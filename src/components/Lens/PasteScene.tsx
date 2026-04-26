import { useState } from "react";

const SAMPLE = `[A father confronts his daughter at the door]
FATHER: Where have you been? Look at the time.
DAUGHTER: I was at Riya's. We were studying.
FATHER: Studying? Until midnight? Have you no shame? What will the neighbors say?
DAUGHTER: Why do you care so much what they say?`;

export default function PasteScene({ endpoint }: { endpoint?: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      if (!endpoint) {
        // No backend wired — show a graceful "coming soon" with what the
        // analysis WOULD do, so the kiosk demos still feel intentional.
        setTimeout(() => {
          setResult({
            offline: true,
            note: "Live analysis is not configured for this kiosk. Pick a film from the list above to read a precomputed reading.",
          });
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
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Bring your own scene</p>
        <span className="tag">Exploratory</span>
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
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={SAMPLE}
        rows={8}
        className="mt-5 block w-full rounded-xl bg-ink-950 px-5 py-4 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 font-mono text-sm leading-relaxed"
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={analyze}
          disabled={!text.trim() || loading}
          className="btn-primary disabled:opacity-40"
        >
          {loading ? "Reading…" : "Read it through both lenses →"}
        </button>
        <button
          onClick={() => setText(SAMPLE)}
          className="text-xs text-white/40 hover:text-white"
        >
          Use sample scene
        </button>
      </div>

      {err && (
        <p className="mt-4 text-sm text-bolly">Couldn't analyze: {err}</p>
      )}

      {result && (
        <div className="mt-6 rounded-xl bg-ink-950 p-5 ring-1 ring-white/5">
          {result.offline ? (
            <p className="text-sm text-white/60">{result.note}</p>
          ) : (
            <pre className="text-xs text-white/80 whitespace-pre-wrap font-mono">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
