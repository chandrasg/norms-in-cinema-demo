interface ConvergenceItem {
  label: string;
  emotion: "shame" | "pride";
  n_bolly: number;
  n_holly: number;
  share_bolly: number;
  share_holly: number;
  convergence_score: number;
  delta: number;
}

/**
 * The Convergence Zone — themes present in BOTH industries with similar
 * intensity. The cross-cultural finding made tangible.
 */
export default function ConvergenceZone({ items }: { items: ConvergenceItem[] }) {
  // Show top 8
  const top = items.slice(0, 8);
  const max = Math.max(...top.map(t => Math.max(t.share_bolly, t.share_holly)));

  return (
    <div className="panel p-6 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">The Convergence Zone</p>
      <h3 className="mt-1 font-display text-2xl text-white max-w-3xl">
        Different vocabulary. Same line.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        These are the themes both industries share most strongly. Below the
        cultural surface — the songs, the languages, the genres — these are
        the gender norms that hold across borders.
      </p>

      <div className="mt-8 grid gap-3">
        {top.map((t, i) => {
          const wB = (t.share_bolly / max) * 100;
          const wH = (t.share_holly / max) * 100;
          return (
            <div key={t.label} className="rounded-lg bg-ink-950/40 ring-1 ring-white/5 px-4 py-3">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="font-display text-xs text-white/40 w-5 text-right">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`text-[10px] uppercase tracking-[0.18em] ${
                  t.emotion === "shame" ? "text-bolly/80" : "text-holly/80"
                }`}>
                  {t.emotion}
                </span>
                <span className="font-display text-base text-white flex-1">{t.label}</span>
              </div>
              <div className="ml-2 sm:ml-8 grid grid-cols-[44px_1fr_auto] sm:grid-cols-[60px_1fr_auto] items-center gap-2 sm:gap-3 text-xs">
                <span className="text-bolly/80 text-right">Bolly</span>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-bolly/60" style={{ width: `${wB}%` }} />
                </div>
                <span className="tabular-nums text-white/60 whitespace-nowrap">
                  {t.n_bolly} · {(t.share_bolly * 100).toFixed(1)}%
                </span>
              </div>
              <div className="ml-2 sm:ml-8 mt-1 grid grid-cols-[44px_1fr_auto] sm:grid-cols-[60px_1fr_auto] items-center gap-2 sm:gap-3 text-xs">
                <span className="text-holly/80 text-right">Holly</span>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-holly/60" style={{ width: `${wH}%` }} />
                </div>
                <span className="tabular-nums text-white/60 whitespace-nowrap">
                  {t.n_holly} · {(t.share_holly * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-white/40 italic max-w-2xl">
        Bars depict share within each industry's total pride or shame themes.
        Themes ranked by harmonic mean penalize those only present in one
        industry. Convergence is the substrate.
      </p>
    </div>
  );
}
