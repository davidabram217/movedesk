// supabase/functions/parse-quote/index.ts
// Reads a quote CareMore has already written (usually dictated to an AI first) and returns it as
// structured fields for the Quote Builder.
//
// Deploy alongside parse-lead and agent-reply — same ANTHROPIC_API_KEY secret, no new config.
//
// THE KEY POINT: the pasted text is CareMore's OWN decided quote. Crew, rates, cash rates and
// hours are stated in it, so extracting them is transcription, not price inference. There is no
// guessing involved and nothing should be invented.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You extract a moving quote that CareMore Moving & Storage has already written into
structured JSON for their quote builder. The text is THEIR OWN quote — every figure in it is a
decision they have already made. Your job is transcription, not estimation.

Return ONLY a JSON object, no preamble, no markdown fences, with this shape:

{
  "projectName": string,
  "moveType": string,
  "packing": string,
  "description": string,
  "vaults": number,
  "storagePerVault": number,
  "storageCostsText": string,
  "cashDiscountText": string,
  "days": [
    { "label": string, "date": "YYYY-MM-DD", "crew": number, "crewNote": string,
      "rate": number, "rateCash": number, "hrsMin": number, "hrsMax": number,
      "feeFuel": number, "feeMaterials": number }
  ],
  "fees": [ { "label": string, "amount": number, "hrsMin": number, "hrsMax": number, "note": string } ],
  "statedTotalMin": number,
  "statedTotalMax": number
}

RULES — these matter more than completeness:

1. NEVER INVENT A NUMBER. If the text does not state something, omit the field entirely. A missing
   field is correct; a plausible guess is a wrong quote going to a customer.

2. DISCOUNTS: take the EFFECTIVE figure, not the original. "$25 fuel fee (discounted from $50)"
   is 25. "Normally $130 per vault, I'm offering $110" is 110. Ignore the discount narrative.

3. CASH RATES are a separate field. "$225 per hour ($210 cash rate)" is rate 225, rateCash 210.
   Never put a cash rate in the rate field.

4. MULTI-DAY: a text with more than one day block ("DAY 1 — PACKING", "DAY 2 — MOVING") returns
   one entry per day, each with its OWN crew, rate and hours — they usually differ. Use the day
   heading as "label" (e.g. "Packing", "Moving into storage").

5. CREW NOTES: a sentence recommending or explaining the crew — "I recommend a four-man crew to
   keep everything moving efficiently" — goes in that day's "crewNote", condensed to a short
   phrase. Do not put it in the description.

6. RANGE FEES: "Packing materials: approximately $500–$600" is a fee with hrsMin 500 and hrsMax
   600 (the builder uses those two fields for a range). A single figure uses "amount".

7. PER-DAY vs WHOLE-JOB FEES: a fuel or materials fee stated inside a day block belongs to that
   day. Only fees stated for the job as a whole go in "fees".

8. TOTALS: if the text contains a summary table or a total, put those figures in "statedTotalMin"
   and "statedTotalMax" — they are used ONLY to verify the extraction. The builder recalculates
   the real total from the parts. Never treat a stated total as authoritative.

9. Hours "5–6 hours" is hrsMin 5, hrsMax 6. A single "3 hours" is hrsMin 3 with hrsMax omitted.

10. CASH DISCOUNT: if the text states a cash arrangement for the job as a whole, put that wording
    in "cashDiscountText". Per-day cash rates still belong in each day's "rateCash" — the two are
    different things and both can appear.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { text } = await req.json();
    if (!text || !String(text).trim()) {
      return new Response(JSON.stringify({ ok: false, error: "No text supplied" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: String(text).trim() }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: data?.error?.message || "Anthropic error" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const raw = (data.content || []).filter((c: any) => c.type === "text")
      .map((c: any) => c.text).join("").trim();
    let quote: any;
    try {
      quote = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim());
    } catch (_) {
      return new Response(JSON.stringify({ ok: false, error: "Could not read the response as JSON" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // VERIFY, don't trust. Recompute the total from the extracted parts and compare it against
    // any total stated in the text. A mismatch almost always means a misread hour count or a
    // cash rate landing in the wrong field — worth surfacing rather than silently accepting.
    try {
      let min = 0, max = 0;
      (quote.days || []).forEach((d: any) => {
        const r = Number(d.rate) || 0;
        const hMin = Number(d.hrsMin) || 0;
        const hMax = Number(d.hrsMax) || hMin;
        min += r * hMin + (Number(d.feeFuel) || 0) + (Number(d.feeMaterials) || 0);
        max += r * hMax + (Number(d.feeFuel) || 0) + (Number(d.feeMaterials) || 0);
      });
      (quote.fees || []).forEach((f: any) => {
        min += Number(f.hrsMin) || Number(f.amount) || 0;
        max += Number(f.hrsMax) || Number(f.amount) || 0;
      });
      const sMin = Number(quote.statedTotalMin) || 0;
      const sMax = Number(quote.statedTotalMax) || 0;
      if (sMin || sMax) {
        const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
        const ok = Math.abs(min - sMin) < 1 && Math.abs(max - sMax) < 1;
        quote._checkOk = ok;
        quote._checkNote = ok
          ? "\u2713 Adds up to the total in your text (" + money(min) + "\u2013" + money(max) + ")"
          : "\u26a0 Your text says " + money(sMin) + "\u2013" + money(sMax) + " but these figures come to "
            + money(min) + "\u2013" + money(max) + ". Worth checking before sending.";
      }
    } catch (_) { /* verification is a convenience, never a blocker */ }

    return new Response(JSON.stringify({ ok: true, quote }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
