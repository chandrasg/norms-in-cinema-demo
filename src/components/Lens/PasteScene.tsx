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
}

export default function PasteScene({ endpoint }: { endpoint?: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      if (!endpoint) {
        setTimeout(() => {
          setResult({
            offline: true,
            note: "Live analysis is not configured for this kiosk. Pick a film from the list above to read a precomputed reading.",
          } as any);
          setLoading(false);
        }, 400);
        return;
      }
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setResult(data);
    } catch (e: any) {
      setErr(e.message ?? String(e));
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
        This is an extrapolation of the corpus, not a peer-reviewed claim.
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
            onClick={() => { setText(""); setResult(null); setErr(null); }}
            className="text-xs text-white/40 hover:text-white min-h-[40px] px-2"
          >
            Clear
          </button>
        )}
      </div>

      {err && (
        <p className="mt-4 text-sm text-bolly">Couldn't analyze: {err}</p>
      )}

      {result && (
        result.offline ? (
          <p className="mt-6 text-sm text-white/60">{result.note}</p>
        ) : (
          <AnalysisView result={result} />
        )
      )}
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

      {/* Target gender + caveat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-white/40">
        {result.target_gender && result.target_gender !== "unclear" && (
          <p>Apparent target: <span className="text-white/60">{result.target_gender}</span></p>
        )}
        <p className="italic max-w-xl">{result.caveat}</p>
      </div>
    </div>
  );
}
