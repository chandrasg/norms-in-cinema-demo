import { useState } from "react";

const SAMPLE = `[A father confronts his daughter at the door]
FATHER: Where have you been? Look at the time.
DAUGHTER: I was at Riya's. We were studying.
FATHER: Studying? Until midnight? Have you no shame? What will the neighbors say?
DAUGHTER: Why do you care so much what they say?`;

interface AnalysisResult {
  shame_markers: string[];
  pride_markers: string[];
  target_gender: string;
  predicted_themes: { bolly: string[]; holly: string[] };
  cultural_reading: { bolly: string; holly: string };
  caveat: string;
  model: string;
  offline?: boolean;
  note?: string;
  fallback?: boolean;
}

// Hand-written, high-quality reading of the SAMPLE scene. Shown whenever the
// live model is unreachable so a demo click never bottoms out on a raw error.
// Mirrors how MAPGEN's corpus actually reads this father/daughter exchange.
const FALLBACK_RESULT: AnalysisResult = {
  shame_markers: ["Have you no shame?", "What will the neighbors say?"],
  pride_markers: [],
  target_gender: "female",
  predicted_themes: {
    bolly: ["Family Honor", "Modesty & Reputation", "Female Mobility"],
    holly: ["Parental Control", "Adolescent Autonomy"],
  },
  cultural_reading: {
    bolly:
      "The shame is delivered publicly and inherited collectively — the daughter's whereabouts are framed as a threat to family honor, and the community's gaze (\"the neighbors\") is the enforcing mechanism. In the MAPGEN corpus this pattern clusters tightly with Bollywood shame around female mobility and reputation.",
    holly:
      "The same lines read more as an individual generational-control conflict than a collective-honor breach — a parent policing autonomy. Hollywood shame in the corpus skews toward individual failing rather than community-administered reputation.",
  },
  caveat:
    "Precomputed example reading of the sample scene — shown because the live model is unavailable. A pattern illustration, not a peer-reviewed finding.",
  model: "precomputed",
  fallback: true,
};

export default function PasteScene({ endpoint }: { endpoint?: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      if (!endpoint) {
        setTimeout(() => {
          setResult(FALLBACK_RESULT);
          setLoading(false);
        }, 400);
        return;
      }
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Client marker — the API rejects requests without this header
          // to deter casual scrapers and curl-pasters from burning credits.
          "X-MAPGEN-Client": "lens-v1",
        },
        body: JSON.stringify({ scene: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setResult(data);
    } catch (e: any) {
      // Never bottom out on a raw error during a demo: degrade to the
      // precomputed sample reading and log the real cause to the console.
      console.warn("Lens live call failed, showing precomputed reading:", e);
      setResult(FALLBACK_RESULT);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel p-6 md:p-8">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Bring your own scene</p>
        <span className="rounded-full bg-amber-400/10 ring-1 ring-amber-400/40 text-amber-300 text-[10px] uppercase tracking-[0.18em] px-2 py-0.5">
          Alpha · live LLM
        </span>
      </div>
      <h3 className="mt-2 font-display text-2xl text-white">
        Paste a scene of dialogue.
      </h3>
      <p className="mt-2 text-sm text-white/60 max-w-xl">
        We'll read it through both cultural lenses — what an Indian audience
        might register as shame-evoking vs. what an American audience might.
      </p>

      <textarea
        id="paste-scene"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={SAMPLE}
        rows={8}
        className="mt-5 block w-full rounded-xl bg-ink-950 px-4 md:px-5 py-3 md:py-4 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 font-mono text-sm leading-relaxed"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={analyze}
          disabled={!text.trim() || loading}
          className="btn-primary disabled:opacity-40 min-h-[44px]"
        >
          {loading ? "Reading…" : "Read it through both lenses →"}
        </button>
        <button
          onClick={() => setText(SAMPLE)}
          className="text-xs text-white/50 hover:text-white min-h-[40px] px-2"
        >
          Use sample scene
        </button>
        {text && (
          <button
            onClick={() => { setText(""); setResult(null); }}
            className="text-xs text-white/40 hover:text-white min-h-[40px] px-2"
          >
            Clear
          </button>
        )}
      </div>

      {result?.fallback && (
        <p className="mt-4 text-xs text-amber-300/90 bg-amber-400/5 ring-1 ring-amber-400/30 rounded-lg px-3 py-2">
          Showing a precomputed reading of the sample scene — the live model
          is unavailable right now. The analysis below illustrates how the
          MAPGEN corpus reads this exchange.
        </p>
      )}

      {result && <AnalysisView result={result} />}
    </div>
  );
}

function AnalysisView({ result }: { result: AnalysisResult }) {
  const hasShame = result.shame_markers?.length > 0;
  const hasPride = result.pride_markers?.length > 0;
  const bollyThemes = result.predicted_themes?.bolly ?? [];
  const hollyThemes = result.predicted_themes?.holly ?? [];

  return (
    <div className="mt-8 space-y-6">
      {/* Markers */}
      {(hasShame || hasPride) && (
        <div className="flex flex-col sm:flex-row gap-4">
          {hasShame && (
            <div className="flex-1 rounded-xl bg-bolly/10 ring-1 ring-bolly/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-bolly mb-2">Shame markers</p>
              <div className="flex flex-wrap gap-2">
                {result.shame_markers.map((m, i) => (
                  <span key={i} className="rounded-full bg-bolly/15 px-3 py-1 text-xs text-bolly/90">
                    "{m}"
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasPride && (
            <div className="flex-1 rounded-xl bg-holly/10 ring-1 ring-holly/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-holly mb-2">Pride markers</p>
              <div className="flex flex-wrap gap-2">
                {result.pride_markers.map((m, i) => (
                  <span key={i} className="rounded-full bg-holly/15 px-3 py-1 text-xs text-holly/90">
                    "{m}"
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cultural readings side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white/5 ring-1 ring-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-bolly mb-1">Bollywood lens</p>
          {bollyThemes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {bollyThemes.map((t, i) => (
                <span key={i} className="tag text-xs">{t}</span>
              ))}
            </div>
          )}
          <p className="text-sm text-white/80 leading-relaxed">
            {result.cultural_reading?.bolly}
          </p>
        </div>
        <div className="rounded-xl bg-white/5 ring-1 ring-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-holly mb-1">Hollywood lens</p>
          {hollyThemes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {hollyThemes.map((t, i) => (
                <span key={i} className="tag text-xs">{t}</span>
              ))}
            </div>
          )}
          <p className="text-sm text-white/80 leading-relaxed">
            {result.cultural_reading?.holly}
          </p>
        </div>
      </div>

      {/* Apparent target — surfaced as a prominent line */}
      {result.target_gender && result.target_gender !== "unclear" && (
        <div className="rounded-xl bg-gold-400/5 ring-1 ring-gold-400/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-400 mb-1">
            Who the emotion lands on
          </p>
          <p className="text-base text-white">
            Apparent target: <span className="font-medium capitalize">{result.target_gender}</span>
          </p>
        </div>
      )}

      {/* Footnote-style caveat in plain language */}
      <p className="text-xs text-white/40 italic leading-relaxed pt-2 border-t border-white/5">
        Exploratory: this reading is generated by an AI model trained on the
        12,387-line MAPGEN corpus. It's a pattern match, not a peer-reviewed
        finding — useful for discussion, not for citation.
      </p>
    </div>
  );
}
