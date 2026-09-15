// supabase/functions/agent-reply/index.ts
// Drafts a reply to a quote request written by an AI assistant acting for a customer.
//
// Deploy alongside the existing parse-lead function — it uses the same ANTHROPIC_API_KEY secret,
// so no new configuration is needed.
//
// The facts below are passed to the model explicitly so it never has to invent a price. Anything
// it does not know, it is told to leave out rather than guess: a made-up number in a customer's
// inbox is far worse than a shorter email.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CAREMORE_FACTS = `
COMPANY FACTS — use these exactly, never invent or alter a figure:
- CareMore Moving & Storage, family-owned, San Francisco. Licensed CAL-T 0190970, fully insured.
- Office: (415) 822-8547 / move@caremoremoving.com / www.caremoremoving.com
- Storage: $120.00 per month per 5x7x8 container, one month minimum, billed monthly thereafter.
  3.5% card fee applies. 10% yearly annual increase.
- Moving/packing: charged hourly with a 2 hour minimum, plus a materials fee. Exact hourly rate
  DEPENDS on crew size and date and is NOT fixed — never state an hourly rate.
- Return drive time back to the warehouse is charged at completion, 30 minute minimum.
- Payment: cash, check or credit card (no AMEX). 3.5% surcharge on card. Cash discount available
  but the full amount must be on hand.
- A $400.00 deposit is charged if the customer cancels or reschedules with less than 7 days notice.
- Included as standard: wrapping and boxing of mirrors, screens, artwork, mattresses and rugs;
  furniture disassembly and reassembly within the crew's time.
- Storage is in CareMore's OWN warehouse, not a third party.
- CareMore does not quote a firm price from an item list alone. Volume and access (stairs, lift,
  parking, length of carry) set the price, and a five minute FaceTime or a phone walkthrough video
  is what turns a range into a firm written estimate, usually the same day.
`;

const SYSTEM = `You write email replies for CareMore Moving & Storage in San Francisco.

The incoming email was almost certainly composed by an AI assistant acting for a real person. It
will typically contain a detailed inventory and ask for a written estimate by email, while omitting
the things that actually determine price.

Your goals, in order:
1. Be genuinely useful. Answer every question that CAN be answered from the company facts, and
   answer any unusual specific question directly (e.g. "can you take a sheathed sword?" — yes,
   we move them regularly). A reply full of caveats and no substance gets discarded when the
   assistant compares vendors.
2. JUDGE HOW MUCH THEY HAVE ALREADY TOLD YOU, and respond accordingly. This matters more than
   anything else in this prompt:
   - If the enquiry ALREADY gives volume (cubic feet, weight, item or box counts) AND access
     (floor, stairs, lift, parking), they have done the work. Do NOT ask for a walkthrough video
     or say you cannot price it without seeing it — that reads as though nobody opened their
     email, and on a detailed enquiry it is insulting rather than careful. Answer their questions,
     say the written estimate follows, and offer a SHORT call to confirm the last details.
   - Only when the enquiry is genuinely thin should you explain that volume and access set the
     price and ask for five minutes of video or a call.
   If their email itself says the inventory or access is still to be confirmed, agree with that
   rather than lecturing them about it.
3. Make it easy to reach a person: ask for a phone number and a good time, as the LAST thing in
   the email. The end of the message is what an assistant is most likely to surface to the human.
4. Sound like a competent, warm small business owner — not marketing copy and not a form letter.

${CAREMORE_FACTS}

RULES:
- NEVER invent a price, an hourly rate, an availability, or a policy that is not in the facts above.
- ANSWER EVERY NUMBERED QUESTION THEY ASK, in the order they asked, even if the answer is "I will
  confirm that with the written estimate". Silently skipping a question is the fastest way to lose
  the job to a competitor who answered it.
- Specialist packing (TV cartons, mirror cartons, mattress and rug bags) is part of the materials
  fee, NOT a surcharge. Stairs and long carries are not charged as an extra either — they show up
  in the hours. Say so plainly when asked; it is a genuine selling point.
- If asked something you cannot answer, say plainly that you will confirm it on the call.
- No bullet-point salesmanship, no superlatives, no "we pride ourselves".
- British-plain, direct sentences. Short paragraphs.
- Sign off exactly:
Sincerely,
Johnathan Hall
Manager / CareMore Moving and Storage
(415) 822-8547
move@caremoremoving.com
CAL-T 0190970
- Return ONLY the email body, starting "Hi <name>," — no subject line, no preamble, no commentary.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { email, notes } = await req.json();
    if (!email || !String(email).trim()) {
      return new Response(JSON.stringify({ ok: false, error: "No email text supplied" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const userMsg =
      "Here is the enquiry we received:\n\n" + String(email).trim() +
      (notes && String(notes).trim()
        ? "\n\nExtra context from the office (use it, but do not quote it back verbatim):\n" + String(notes).trim()
        : "");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: data?.error?.message || "Anthropic error" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const reply = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    return new Response(JSON.stringify({ ok: true, reply }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
