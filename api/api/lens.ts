/**
 * Vercel serverless function — Station 3 Mode A "paste a scene" analyzer.
 *
 * Deployment:
 *   1. Move (or symlink) this folder to a Vercel project: `cd lens-api && vercel link`.
 *   2. Set env vars on Vercel:
 *        OPENAI_API_KEY    - your key
 *        LLM_MODEL         - default "gpt-4o" (configurable)
 *        ALLOWED_ORIGIN    - comma-separated, e.g. "https://sharathg.cis.upenn.edu"
 *   3. `vercel deploy --prod`
 *   4. Set the deployed URL as PUBLIC_LENS_ENDPOINT in the Astro site's build env.
 *
 * Returns culturally-paired readings (Indian vs. American social-norm lens) of a
 * pasted scene. Returns shame/pride markers, predicted target gender, closest
 * themes from our corpus, and a brief cultural reading.
 */

export const config = { runtime: "edge" };

interface AnalysisRequest {
  scene: string;
}

interface AnalysisResponse {
  shame_markers: string[];
  pride_markers: string[];
  target_gender: "male" | "female" | "unclear";
  predicted_themes: { bolly: string[]; holly: string[] };
  cultural_reading: { bolly: string; holly: string };
  caveat: string;
  model: string;
}

const SYSTEM_PROMPT = `You are a cultural critic trained on the Cross-Cultural Social Norms Dataset (Rai et al., NAACL 2025), which catalogs how shame and pride are expressed across Bollywood and Hollywood films.

Read the scene the user pastes. Return ONLY a JSON object with these fields:

{
  "shame_markers": [...short phrases from the scene that evoke shame...],
  "pride_markers": [...short phrases that evoke pride...],
  "target_gender": "male" | "female" | "unclear",
  "predicted_themes": {
    "bolly": ["...", "..."],
    "holly": ["...", "..."]
  },
  "cultural_reading": {
    "bolly": "2-3 sentence Indian/collectivist social-norm reading. NAME the specific shame or pride trigger explicitly — do not just describe what's happening on screen.",
    "holly": "2-3 sentence American/individualist reading. NAME the specific shame or pride trigger explicitly — do not just describe what's happening on screen."
  }
}

Themes (2-4 words each, drawn from these clusters):
Sexual Harassment, Family Honor, Son's Accomplishments, Cultural Identity, Patriotism, Heroic Bravery, Inappropriate Behavior, Marital Status, Disrespect, Dishonesty, Romantic Expression, Modesty, Promiscuity, Nonconformity, Identity and Beauty, Future Aspirations, Financial Success, Virtuous Living, Personal Achievement, Romantic Relationships, Sports Victory, Academic Success, Poverty, Self-Image Issues, Negligence, Causing Harm, Shamelessness, Sexual Violence and Trauma, Incest and Family Secrets, Stigma of Victimhood, Concealment and Disclosure, Reputation and Social Standing, Bodily Autonomy, Caste and Class, Religious Transgression.

Read carefully — many of the most powerful shame triggers in cinema are NOT what they look like on the surface. Look for these patterns:

(a) ADMISSIONS OF VICTIMHOOD often function as shame triggers. When a character reveals they have been sexually abused, raped, harassed, or trafficked, the scene's shame mechanic may be operating on the *victim* rather than the perpetrator — a culturally enforced silence that frames the survivor's disclosure itself as the transgression. Name this explicitly when present (themes: "Stigma of Victimhood" or "Sexual Violence and Trauma"). Do NOT treat the disclosure as merely "honesty" or "truth-telling" or "Dishonesty."

(b) FAMILY SECRETS — paternity ambiguity, incest, hidden children, abandoned spouses, second families — are dense shame triggers in both industries but especially so in Bollywood. The shame typically attaches to the woman in the position of disclosing the secret, not the man whose actions created it. Classic example: the "She's my sister AND my daughter!" reveal in Chinatown — the shame trigger is the survivor's forced admission of incest, NOT the act of telling the truth. Use "Incest and Family Secrets" + "Stigma of Victimhood."

(c) STRUCTURAL POSITIONS that culture treats as shameful through no fault of the person — caste, class, infertility, widowhood, disability, mental illness, queerness — function as latent shame triggers. Name the structural condition, not just the emotion.

(d) CONCEALMENT/DISCLOSURE dynamics — characters lying to protect honor, characters being forced into the open, gossip and rumor — are shame mechanics even when the scene's surface action is something else.

(e) SLAPS, beatings, and other physical responses to disclosure usually mark a shame trigger one beat earlier in the scene — the slap is the audience's signal that what just got said is unspeakable. Always identify what was unspeakable, not just the violence. The violence is downstream of the shame trigger, not the trigger itself.

(f) PRIDE markers are usually direct ("I'm proud of you," "we did it," boasting), but pride can also be coded — a paternal nod at a son's achievement, a community's collective response to a wedding, a sister's silent affirmation. Surface coded pride too.

Rules:
- Use 2-4 word themes from the cluster list above. If a scene clearly involves trauma disclosure, victimization, or a family-secret reveal, you MUST include the relevant theme ("Sexual Violence and Trauma," "Stigma of Victimhood," "Incest and Family Secrets," "Concealment and Disclosure").
- Be concrete. Reference specific lines or phrases from the scene in shame_markers/pride_markers.
- The cultural_reading fields should NAME the trigger and explain how it would land for an audience drawing on each culture's norms — do not merely describe the on-screen action.
- Do not moralize about either culture. Describe the norm; do not endorse or condemn it.
- Output strictly the JSON object, no preamble or commentary.`;

// =========================================================================
// Anti-spam / API-cost protection
// =========================================================================
//
// This is a public endpoint that calls a paid LLM. Layered defense:
//
//   1. Strict origin allowlist — 403 on any non-allowlisted Origin.
//   2. Required client marker header (X-MAPGEN-Client). Bots / casual curl
//      callers won't send it. Trivially forgeable, but stops 95% of scrapers.
//   3. Per-IP hourly rate limit (in-memory; survives hot Edge isolates).
//   4. Per-isolate global daily cap — hard ceiling on cost.
//   5. Prompt-injection heuristic — rejects "ignore previous instructions"
//      / "system prompt" attempts.
//   6. Length bounds: 60 char min ↔ 2000 char max (was 20 ↔ 4000).
//   7. Repetitive-input heuristic — rejects "aaaaa..." padding etc.
//   8. Bounded OpenAI call: gpt-4o-mini default, max_tokens=700.
//   9. Optional kill switch: env LENS_DISABLED=1 returns 503.

const PER_IP_LIMIT_PER_HOUR = 8;
const GLOBAL_LIMIT_PER_DAY = 500;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ipUsage = new Map<string, { count: number; windowStart: number }>();
const globalState = { count: 0, windowStart: Date.now() };

function rateLimit(ip: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  const entry = ipUsage.get(ip);
  if (!entry || now - entry.windowStart > HOUR) {
    ipUsage.set(ip, { count: 1, windowStart: now });
  } else if (entry.count >= PER_IP_LIMIT_PER_HOUR) {
    return { ok: false, reason: "per_ip_hourly" };
  } else {
    entry.count++;
  }
  if (now - globalState.windowStart > DAY) {
    globalState.count = 1;
    globalState.windowStart = now;
  } else if (globalState.count >= GLOBAL_LIMIT_PER_DAY) {
    return { ok: false, reason: "global_daily" };
  } else {
    globalState.count++;
  }
  return { ok: true };
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore (the |all |any |previous |prior |above )?instruct/i,
  /disregard (the |all |any |previous |prior |above )/i,
  /system prompt/i,
  /you are now/i,
  /forget (everything|the above|prior)/i,
  /jailbreak/i,
  /reveal (the|your) (system|prompt|instructions)/i,
  /developer mode/i,
  /\bDAN\b/,
  /pretend (you are|to be)/i,
  /act as if you/i,
  /override your/i,
];

/**
 * Strip subtitle-format artifacts (SRT/VTT) before sending to the LLM.
 * Removes timestamp lines (00:00:00,000 --> 00:00:00,000), standalone
 * numeric index lines, and collapses multiple blank lines. This both
 *  (a) prevents false positives on the length / repetition heuristics
 *      when users paste raw subtitle excerpts, and
 *  (b) reduces token cost by stripping noise the LLM doesn't need.
 */
function cleanScene(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  const tsRe = /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-+>\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/;
  const idxRe = /^\s*\d{1,5}\s*$/;
  for (const l of lines) {
    if (tsRe.test(l)) continue;       // SRT/VTT timestamp line
    if (idxRe.test(l)) continue;      // standalone subtitle index
    kept.push(l);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function looksLikeAbuse(scene: string): { ok: boolean; reason?: string } {
  for (const re of PROMPT_INJECTION_PATTERNS) {
    if (re.test(scene)) return { ok: false, reason: "injection_attempt" };
  }
  const chars = scene.replace(/\s/g, "");
  if (chars.length > 50) {
    const counts: Record<string, number> = {};
    for (const c of chars) counts[c] = (counts[c] || 0) + 1;
    const maxChar = Math.max(...Object.values(counts));
    if (maxChar / chars.length > 0.6) {
      return { ok: false, reason: "repetitive_input" };
    }
  }
  const tokens = scene.toLowerCase().match(/\b\w+\b/g) || [];
  if (tokens.length > 20) {
    const tokCounts: Record<string, number> = {};
    for (const t of tokens) tokCounts[t] = (tokCounts[t] || 0) + 1;
    const maxTok = Math.max(...Object.values(tokCounts));
    if (maxTok / tokens.length > 0.4) {
      return { ok: false, reason: "repetitive_token" };
    }
  }
  return { ok: true };
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGIN || "*")
    .split(",")
    .map(s => s.trim());
  const allowAll = allowed.includes("*");
  const allowOrigin =
    allowAll || (origin && allowed.includes(origin)) ? origin || "*" : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-MAPGEN-Client",
    "Access-Control-Max-Age": "86400",
  };
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Optional kill-switch — flip env var if costs spike or abuse is detected
  if (process.env.LENS_DISABLED === "1") {
    return new Response(
      JSON.stringify({ error: "Lens analysis is temporarily unavailable." }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Strict origin enforcement — 403 if origin missing or not in allowlist.
  // Browsers always send Origin on cross-origin POST; absence = direct curl.
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const allowAll = allowedOrigins.includes("*");
  if (!allowAll) {
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response(
        JSON.stringify({ error: "Origin not allowed." }),
        { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
  }

  // Required client marker — set by our React component. Bots / curl callers
  // who don't read the source won't send it. Stops casual scrapers without
  // false-positives on real users.
  const clientMarker = req.headers.get("x-mapgen-client");
  if (clientMarker !== "lens-v1") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid client marker." }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(ip);
  if (!rl.ok) {
    const msg = rl.reason === "global_daily"
      ? "Daily capacity reached. Try again tomorrow."
      : "Too many requests from your network. Try again in an hour.";
    return new Response(
      JSON.stringify({ error: msg, reason: rl.reason }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  let body: AnalysisRequest;
  try {
    body = (await req.json()) as AnalysisRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rawScene = (body?.scene ?? "").trim();

  // Outer cap on raw payload — prevents megabyte-sized pastes regardless of
  // how much of it strips out. 8000 is generous for full-scene transcripts.
  if (rawScene.length > 8000) {
    return new Response(
      JSON.stringify({ error: "Scene too long — keep the paste under 8000 characters." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Strip SRT/VTT subtitle artifacts (timestamps, indices) before any
  // analysis. The cleaned scene is what we send to the LLM and what we
  // length-check / abuse-check against.
  const scene = cleanScene(rawScene);

  if (!scene || scene.length < 60) {
    return new Response(
      JSON.stringify({ error: "Not enough dialogue to analyse — paste at least a few lines of actual scene text." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  if (scene.length > 4000) {
    return new Response(
      JSON.stringify({ error: "Too much dialogue — trim the scene to under ~4000 characters of text." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Heuristic abuse / prompt-injection check on cleaned scene
  const abuse = looksLikeAbuse(scene);
  if (!abuse.ok) {
    return new Response(
      JSON.stringify({ error: "Scene rejected by content guard.", reason: abuse.reason }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: OPENAI_API_KEY missing." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Default to mini — ~10x cheaper and adequate for our short JSON output.
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  let openaiResponse: Response;
  try {
    openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: scene },
        ],
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Failed to reach the model.", detail: String(e) }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  if (!openaiResponse.ok) {
    const text = await openaiResponse.text();
    return new Response(
      JSON.stringify({ error: `Model returned ${openaiResponse.status}`, detail: text.slice(0, 200) }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const payload = await openaiResponse.json();
  const content = payload.choices?.[0]?.message?.content ?? "{}";

  let parsed: Partial<AnalysisResponse>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return new Response(
      JSON.stringify({ error: "Model returned non-JSON output.", raw: content.slice(0, 500) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const result: AnalysisResponse = {
    shame_markers: Array.isArray(parsed.shame_markers) ? parsed.shame_markers : [],
    pride_markers: Array.isArray(parsed.pride_markers) ? parsed.pride_markers : [],
    target_gender:
      parsed.target_gender === "male" || parsed.target_gender === "female"
        ? parsed.target_gender
        : "unclear",
    predicted_themes: {
      bolly: parsed.predicted_themes?.bolly ?? [],
      holly: parsed.predicted_themes?.holly ?? [],
    },
    cultural_reading: {
      bolly: parsed.cultural_reading?.bolly ?? "",
      holly: parsed.cultural_reading?.holly ?? "",
    },
    caveat:
      "This is an extrapolation from the MAPGEN corpus, not a peer-reviewed claim. Treat as exploratory.",
    model,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
