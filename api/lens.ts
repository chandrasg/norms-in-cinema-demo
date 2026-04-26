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
    "bolly": "1-2 sentence Indian/collectivist social-norm reading: what an audience drawing on Bollywood norms might register here.",
    "holly": "1-2 sentence American/individualist reading: what an audience drawing on Hollywood norms might register here."
  }
}

Rules:
- Themes should be 2-4 words each, drawn from these clusters: Sexual Harassment, Family Honor, Son's Accomplishments, Cultural Identity, Patriotism, Heroic Bravery, Inappropriate Behavior, Marital Status, Disrespect, Dishonesty, Romantic Expression, Modesty, Promiscuity, Nonconformity, Identity and Beauty, Future Aspirations, Financial Success, Virtuous Living, Personal Achievement, Romantic Relationships, Sports Victory, Academic Success, Poverty, Self-Image Issues, Negligence, Causing Harm, Shamelessness.
- Be concrete. Reference specific lines or phrases.
- Do not moralize about either culture.
- Output strictly the JSON, no preamble or commentary.`;

const USAGE_LIMIT_PER_HOUR = 60;
const usage = new Map<string, { count: number; windowStart: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const entry = usage.get(ip);
  if (!entry || now - entry.windowStart > HOUR) {
    usage.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= USAGE_LIMIT_PER_HOUR) return false;
  entry.count++;
  return true;
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
    "Access-Control-Allow-Headers": "Content-Type",
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

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again in an hour." }),
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

  const scene = (body?.scene ?? "").trim();
  if (!scene || scene.length < 20) {
    return new Response(
      JSON.stringify({ error: "Scene too short — paste at least 20 characters." }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  if (scene.length > 4000) {
    return new Response(
      JSON.stringify({ error: "Scene too long — keep it under 4000 characters." }),
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

  const model = process.env.LLM_MODEL || "gpt-4o";

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
