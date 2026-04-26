interface WhitespaceItem {
  label: string;
  emotion: "shame" | "pride";
  absent_in: "bolly" | "holly";
  present_in: "bolly" | "holly";
  n_present: number;
  n_absent: number;
  share_present: number;
  share_absent: number;
  ratio: number;
}

const IND = {
  bolly: { label: "Bollywood", color: "text-bolly", bg: "bg-bolly/70" },
  holly: { label: "Hollywood", color: "text-holly", bg: "bg-holly/70" },
} as const;

/**
 * Whitespace Map — themes one industry tells robustly that the other
 * under-tells. Frames "stories that haven't been bridged."
 */
export default function WhitespaceMap({ items }: { items: WhitespaceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="panel p-6 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Whitespace Map</p>
      <h3 className="mt-1 font-display text-2xl text-white max-w-3xl">
        Stories one industry tells. The other doesn't.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        Each row is a theme robustly present in one industry and under-told in
        the other. For investors and producers thinking about cross-cultural
        adaptation: these are the gaps where audience appetite has been
        demonstrated on one side but not yet served on the other.
      </p>

      <div className="mt-8 grid gap-4">
        {items.map((w) => {
          const present = IND[w.present_in];
          const absent = IND[w.absent_in];
          return (
            <div key={w.label} className="rounded-xl bg-ink-950/40 ring-1 ring-white/5 p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-display text-lg text-white">{w.label}</span>
                <span className={`text-[10px] uppercase tracking-[0.18em] ${
                  w.emotion === "shame" ? "text-bolly/80" : "text-holly/80"
                }`}>
                  {w.emotion}
                </span>
                <span className="ml-auto text-xs text-white/50 tabular-nums">
                  {w.ratio === 999 ? "absent" : `${w.ratio.toFixed(1)}× gap`}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-[60px_1fr_auto] sm:grid-cols-[80px_1fr_auto] items-center gap-2 sm:gap-3 text-xs">
                <span className={`${present.color} text-right truncate`}>{present.label}</span>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full ${present.bg}`}
                       style={{ width: `${Math.min(100, w.share_present * 1500)}%` }} />
                </div>
                <span className="tabular-nums text-white/60 whitespace-nowrap">
                  {w.n_present} · {(w.share_present * 100).toFixed(1)}%
                </span>
              </div>

              <div className="mt-1 grid grid-cols-[60px_1fr_auto] sm:grid-cols-[80px_1fr_auto] items-center gap-2 sm:gap-3 text-xs">
                <span className={`${absent.color} text-right truncate`}>{absent.label}</span>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full ${absent.bg} opacity-60`}
                       style={{ width: `${Math.min(100, w.share_absent * 1500)}%` }} />
                </div>
                <span className="tabular-nums text-white/60 whitespace-nowrap">
                  {w.n_absent} · {(w.share_absent * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-white/40 italic max-w-2xl">
        Bars are scaled to make small shares visible. Whitespace ≠ "should be
        copied." It's a starting point for asking <em>why</em> a story works in one
        cultural context and what would have to change to bridge it.
      </p>
    </div>
  );
}
