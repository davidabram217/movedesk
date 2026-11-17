// supabase/functions/summarize-call/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turns a long phone-call transcript (from the CM Leads quick-lead page) into a
// short office summary of the move. Same setup as parse-lead / parse-booking —
// same CORS, same stored ANTHROPIC_API_KEY secret — only the prompt differs.
//
// DEPLOY (same way parse-lead was deployed; nothing new to configure):
//   1. Put this file at:  supabase/functions/summarize-call/index.ts
//   2. Run:               supabase functions deploy summarize-call --no-verify-jwt
//   (ANTHROPIC_API_KEY is already set, so there's no new secret.)
//
// The app calls it at:  {SUPABASE_URL}/functions/v1/summarize-call
// Request  body: { "text": "<call transcript>" }
// Response body: { "ok": true, "summary": "..." }   or   { "ok": false, "error": "..." }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Match this to whatever your working parse-lead function uses.
const MODEL = "claude-sonnet-5";

const SYSTEM = `You summarize a phone call between a San Francisco moving & storage company (CareMore Moving) and a customer. The text is an automatic speech-to-text transcript of the call: both voices, no speaker labels, with recognition mistakes. Write a short summary for the office so they can create the lead and quote the job.

Write plain text (no markdown, no bullets symbols other than "- "), in this order, leaving out any line that wasn't discussed:
Name: …
Phone: …
Email: …
Move date: … (as said, e.g. "Dec 3", "first week of December", "flexible")
From: … (address or area, floor / stairs / elevator, parking)
To: … (address or area, floor / stairs / elevator, parking)
Size: … (bedrooms, square feet, vaults, or how much stuff)
Packing: … (none / kitchen / breakables / full; boxes needed)
Storage: … (only if mentioned)
Special items: … (piano, safe, art, heavy or fragile items, things NOT going)
How they found us: … (only if the customer said it)
Prices discussed: … (anything we quoted or they asked about — crew, rate, hours, totals)
Next steps: … (what we promised: send a quote, video walkthrough, call back, etc.)
Notes: … (anything else useful in one or two lines)

Rules:
- Only include what was actually said. Never invent details, prices or dates.
- Staff names (e.g. John, Dave) are not the customer, and are not "how they found us".
- If a detail is unclear because of transcription, write it with "(unclear)".
- Keep it under about 150 words. Output the summary only.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 40) {
      return json({ ok: false, error: "Not enough to summarize." }, 400);
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Server missing ANTHROPIC_API_KEY" }, 500);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM,
        // Very long calls: keep the first ~60k characters (well over an hour of talking).
        messages: [{ role: "user", content: text.slice(0, 60000) }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return json({ ok: false, error: data?.error?.message || ("Anthropic error " + resp.status) }, 502);
    }
    const summary = (data.content || []).map((b: any) => b?.text || "").join("").trim();
    if (!summary) return json({ ok: false, error: "Empty summary" }, 502);
    return json({ ok: true, summary });
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
