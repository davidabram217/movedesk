// supabase/functions/parse-booking/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracts moving-job BOOKING details from a pasted email/text into structured
// JSON for the MoveDesk booking form. This mirrors your existing `parse-lead`
// edge function — same auth, same CORS, same stored ANTHROPIC_API_KEY secret —
// only the prompt + output schema differ.
//
// DEPLOY (same way parse-lead was deployed; nothing new to configure):
//   1. Put this file at:  supabase/functions/parse-booking/index.ts
//   2. Run:               supabase functions deploy parse-booking --no-verify-jwt
//   (ANTHROPIC_API_KEY is already set from parse-lead, so there's no new secret.)
//
// The app calls it at:  {SUPABASE_URL}/functions/v1/parse-booking
// Request  body: { "text": "<pasted email/text>" }
// Response body: { "ok": true, "extracted": { ...schema below... } }
//            or: { "ok": false, "error": "..." }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Match this to whatever your working parse-lead function uses. Sonnet handles
// messy, multi-day emails well; switch to "claude-haiku-4-5-20251001" to cut cost.
const MODEL = "claude-sonnet-5";

const SYSTEM = `You extract moving-job booking details from a pasted email or text message and return ONLY a JSON object — no prose, no markdown code fences.

The business is a San Francisco moving & storage company. A booking is either single-day or multi-day. Extract only what is explicitly present; never invent values. Use null for anything genuinely absent.

Return EXACTLY this shape:
{
  "isMultiDay": boolean,
  "customerName": string|null,
  "phone": string|null,           // primary phone, formatted (XXX) XXX-XXXX
  "altPhone": string|null,        // second phone if two are given
  "email": string|null,
  "size": string|null,            // e.g. "1 Bdrm", "1,400 sq ft, 2-bedroom"
  "packing": string|null,         // packing notes, e.g. "No packing but needs boxes"
  "source": string|null,          // how they found us, e.g. "Google"
  "date": string|null,            // SINGLE-DAY only. ISO YYYY-MM-DD, or "TBD" if not firm
  "arrivalWindow": string|null,   // e.g. "8:30am-9:30am"
  "movers": number|null,          // SINGLE-DAY crew count
  "hoursMin": number|null,        // SINGLE-DAY estimated hours low (respect a stated minimum)
  "hoursMax": number|null,        // SINGLE-DAY estimated hours high
  "rateRegular": number|null,     // hourly $ standard
  "rateCash": number|null,        // hourly $ cash
  "from": string|null,            // SINGLE-DAY pickup address
  "to": string|null,              // SINGLE-DAY dropoff address
  "feeFuel": number|null,         // $ fuel fee (applies whether single or multi-day)
  "feeMaterials": number|null,    // $ materials fee
  "deposit": number|null,         // $ deposit if stated
  "driveTime": string|null,       // free text, e.g. "Return drive time applies each day"
  "scope": string|null,           // short scope summary
  "officeNotes": string|null,     // logistics/notes blob for the office (NOT customer-facing)
  "days": [                       // MULTI-DAY only; use [] when single-day
    {
      "date": string|null,        // ISO YYYY-MM-DD or "TBD"
      "label": string|null,       // e.g. "Load & Return to Warehouse"
      "from": string|null,
      "to": string|null,
      "movers": number|null,
      "hoursMin": number|null,
      "hoursMax": number|null,
      "rateRegular": number|null,
      "rateCash": number|null,
      "arrivalWindow": string|null,
      "scope": string|null
    }
  ]
}

Rules:
- Dates: convert "Monday June 15th" to ISO using the NEXT such date on or after __TODAY__. If the text says dates are to be confirmed / tentative / "mid to late May", set the date(s) to "TBD".
- Phones: two numbers given → first is "phone", second is "altPhone".
- Hours: "2 hour minimum" with no range → hoursMin=2, hoursMax=null. "6.5 – 7.5 hours" → hoursMin=6.5, hoursMax=7.5.
- Multi-day: set isMultiDay=true and fill "days" in order. Put SHARED charges (fuel, materials, deposit, driveTime) at the TOP level, not per day. Leave the single-day fields (date, from, to, movers, hoursMin/Max, rateRegular, rateCash, arrivalWindow, scope) null when isMultiDay=true.
- Money: numbers only — no "$", no commas (e.g. 2437.5, not "$2,437.50").
- Output raw JSON only. Never wrap it in backticks.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return json({ ok: false, error: "Please paste more text." }, 400);
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Server missing ANTHROPIC_API_KEY" }, 500);

    const today = new Date().toISOString().split("T")[0];
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM.replace("__TODAY__", today),
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return json({ ok: false, error: data?.error?.message || ("Anthropic error " + resp.status) }, 502);
    }

    let raw = (data.content || []).map((b: any) => b?.text || "").join("").trim();
    // Strip accidental code fences just in case
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();

    let extracted: unknown;
    try {
      extracted = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Model did not return valid JSON", raw }, 502);
    }

    return json({ ok: true, extracted });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
