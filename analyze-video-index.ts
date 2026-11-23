// supabase/functions/analyze-video/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// AI Quote Builder → "📹 Video walkthrough". MoveDesk pulls still frames out of the customer's
// video (and any photos) on the office computer and sends only those pictures here. Claude looks
// at them, together with what the office already entered, and returns an inventory plus suggested
// quote inputs (home size, vaults, packing, access, special items). The HOURS are not decided
// here: MoveDesk still works those out from our real completed jobs.
//
// DEPLOY (same as summarize-call; no new secret):
//   1. Put this file at:  supabase/functions/analyze-video/index.ts
//   2. Run:               supabase functions deploy analyze-video --no-verify-jwt
//   Or in the Supabase website: Edge Functions → Deploy a new function → name it analyze-video →
//   paste this file → Deploy (turn OFF "Verify JWT" like the others).
//
// Request:  { frames: ["<base64 jpeg>", ...], context: { size, moveType, packing, vaults, sqft,
//             accessLoad, accessUnload, notes, vaultGuide } }
// Response: { ok: true, result: {...} }  or  { ok: false, error: "..." }
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-5-5";
const VERSION = "v2-2026-11-23";

const SYSTEM = `You help CareMore Moving & Storage (San Francisco) quote a move from a customer's video
walkthrough. You are given still frames taken from the video (in order) and sometimes photos, plus
what the office has already entered. Frames overlap, so the same item is often seen several times:
count each item ONCE.

Work out:
- The rooms shown and the main items in each (furniture, appliances, TVs, rugs, art, boxes).
- How much is already packed (boxes seen) and how much loose stuff still needs packing (shelves,
  cabinets, closets, decor, books, kitchen).
- Volume in VAULTS. A vault is our 5 x 7 x 8 ft storage container (about 280 cu ft, holding
  roughly a third of a typical 1-bedroom's furniture and boxes once packed tight). Use the
  office's "vault guide" from their own past jobs when given; it is the best reference.
- Access you can actually see: stairs (count flights if possible), elevator, long hallway or walk,
  tight turns. Usually the video only shows the pickup.
- Special items: piano, safe, gun safe, marble/glass tops, large art, mirrors, antiques, very heavy
  items, items needing disassembly (beds, sectionals, desks, cribs), anything awkward.

Rules:
- Only report what you can see. If rooms were clearly not shown (e.g. no kitchen), say so in
  "notShown" and allow for them in the vault RANGE rather than guessing items.
- The office's own entries win for things you cannot see (e.g. destination access, items not in
  the video). Point out any clear disagreement in "conflicts".
- Be practical and conservative; this feeds a real price.

Reply with ONLY a JSON object, no markdown:
{
 "homeSize": "Studio" | "1 Bedroom" | "2 Bedroom" | "3 Bedroom" | "4+ Bedroom" | "Office" | "",
 "vaults": number (best estimate, may be .5),
 "vaultsLow": number, "vaultsHigh": number,
 "packing": "No — just moving" | "Kitchen pack only" | "All breakables" | "Partial pack" | "Fragiles only" | "Full pack" | "",
 "packingReason": "short reason",
 "boxesSeen": number,
 "accessLoad": "Flat" | "1 Flight" | "2 Flight" | "3 Flight" | "Elevator" | "",
 "accessNote": "what you saw about access, or empty",
 "rooms": [ { "room": "Living room", "items": ["Sectional sofa (3 pc)", "55\\" TV", "..."] } ],
 "specialItems": ["..."],
 "disassembly": ["..."],
 "notShown": ["..."],
 "conflicts": ["..."],
 "summary": "2-3 sentences for the office: size, how full, packing, anything that will slow the crew",
 "confidence": "high" | "medium" | "low"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { frames, context } = await req.json();
    if (!Array.isArray(frames) || !frames.length) return json({ ok: false, error: "No frames sent." }, 400);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Server missing ANTHROPIC_API_KEY" }, 500);

    const imgs = frames.slice(0, 95).filter((f: unknown) => typeof f === "string" && f.length > 100)
      .map((data: string) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
    const c = context || {};
    const known = [
      c.size && `Home size: ${c.size}`, c.moveType && `Job type: ${c.moveType}`,
      c.packing && `Packing: ${c.packing}`, c.vaults && `Vaults: ${c.vaults}`, c.sqft && `Sq ft: ${c.sqft}`,
      c.accessLoad && `Access at pickup: ${c.accessLoad}`, c.accessUnload && `Access at drop-off: ${c.accessUnload}`,
      c.notes && `Office notes: ${String(c.notes).slice(0, 1500)}`,
    ].filter(Boolean).join("\n") || "(nothing entered yet)";
    const text = `What the office has entered so far:\n${known}\n\n` +
      (c.vaultGuide ? `Vault guide from CareMore's own completed jobs:\n${String(c.vaultGuide).slice(0, 1500)}\n\n` : "") +
      (c.previous ? `EARLIER CHECK: the office already checked other videos/photos of this SAME job and got the result
below. The pictures above are NEW ones. Return ONE combined result for the whole job: keep
everything from the earlier check, add what is new, and count an item seen in both only once (the
same sofa filmed twice is one sofa). Re-estimate vaults, packing and size for the whole job.
${JSON.stringify(c.previous).slice(0, 8000)}\n\n` : "") +
      `There are ${imgs.length} pictures above, in video order. Return the JSON.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: SYSTEM,
        messages: [{ role: "user", content: [...imgs, { type: "text", text }] }] }),
    });
    const data = await resp.json();
    if (!resp.ok) return json({ ok: false, error: data?.error?.message || ("Anthropic error " + resp.status) }, 502);
    const raw = (data.content || []).map((b: any) => b?.text || "").join("").trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: false, error: "Could not read the AI's answer." }, 502);
    let result;
    try { result = JSON.parse(m[0]); } catch { return json({ ok: false, error: "Could not read the AI's answer." }, 502); }
    return json({ ok: true, result, version: VERSION, frames: imgs.length });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });
}
