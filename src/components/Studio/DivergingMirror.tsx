import { useMemo } from "react";

interface EraRow {
  era: string;
  bolly_pride_female_share: number;
  holly_pride_female_share: number;
  bolly_pride_n: number;
  holly_pride_n: number;
}

const ERA_LABELS: Record<string, string> = {
  pre_2000: "Pre-2000",
  "2000_2014": "2000–2014",
  "2015_present": "2015–present",
};

/**
 * The centerpiece visual for the funder dossier. A single, cinematic
 * divergence chart of the female share of pride in each industry.
 */
export default function DivergingMirror({ trend }: { trend: EraRow[] }) {
  const points = useMemo(() => {
    return trend.map((r, i) => ({
      era: r.era,
      label: ERA_LABELS[r.era] ?? r.era,
      bolly: r.bolly_pride_female_share * 100,
      holly: r.holly_pride_female_share * 100,
      x: (i / (trend.length - 1)) * 100,
      bolly_n: r.bolly_pride_n,
      holly_n: r.holly_pride_n,
    }));
  }, [trend]);

  // Y axis: 0 to 40
  const Y_MAX = 40;
  const yFor = (v: number) => 100 - (v / Y_MAX) * 100;

  const last = points[points.length - 1];
  const first = points[0];
  const bollyDelta = last.bolly - first.bolly;
  const hollyDelta = last.holly - first.holly;

  return (
    <div className="panel p-6 md:p-12 bg-gradient-to-b from-white/[0.02] to-transparent">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-400">The Diverging Mirror</p>
      <h3 className="mt-2 font-display text-3xl md:text-4xl text-white max-w-3xl leading-tight">
        Two industries. One metric. Opposite directions.
      </h3>
      <p className="mt-4 text-sm md:text-base text-white/65 max-w-2xl leading-relaxed">
        Female share of <span className="text-white">pride</span> dialogue, by era.
        Hollywood has climbed by <span className="text-holly font-medium">{hollyDelta.toFixed(0)} points</span> since
        the 1990s. Bollywood has fallen by <span className="text-bolly font-medium">{Math.abs(bollyDelta).toFixed(0)} points</span> over
        the same period. Audiences are noticing.
      </p>

      {/* Chart */}
      <div className="mt-12 relative">
        <svg viewBox="0 0 700 380" className="w-full h-auto" role="img"
             aria-label="Female share of pride dialogue, Hollywood vs Bollywood, by era">
          <defs>
            <linearGradient id="hollyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b8def" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#5b8def" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bollyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e94f64" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#e94f64" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y gridlines */}
          {[10, 20, 30, 40].map(v => (
            <g key={v}>
              <line
                x1="60" x2="660"
                y1={20 + (yFor(v) / 100) * 320}
                y2={20 + (yFor(v) / 100) * 320}
                stroke="white" strokeOpacity="0.06" strokeDasharray="2,4"
              />
              <text x="50" y={24 + (yFor(v) / 100) * 320}
                    textAnchor="end" fontSize="11" fill="white" fillOpacity="0.4"
                    className="tabular-nums">
                {v}%
              </text>
            </g>
          ))}

          {/* Hollywood area + line */}
          <path
            d={`M 60 ${20 + (yFor(points[0].holly) / 100) * 320}
                ${points.slice(1).map((p, i) =>
                  `L ${60 + ((i + 1) / (points.length - 1)) * 600} ${20 + (yFor(p.holly) / 100) * 320}`
                ).join(" ")}
                L 660 340 L 60 340 Z`}
            fill="url(#hollyGrad)"
          />
          <path
            d={`M 60 ${20 + (yFor(points[0].holly) / 100) * 320}
                ${points.slice(1).map((p, i) =>
                  `L ${60 + ((i + 1) / (points.length - 1)) * 600} ${20 + (yFor(p.holly) / 100) * 320}`
                ).join(" ")}`}
            fill="none" stroke="#5b8def" strokeWidth="3" strokeLinejoin="round"
          />

          {/* Bollywood area + line */}
          <path
            d={`M 60 ${20 + (yFor(points[0].bolly) / 100) * 320}
                ${points.slice(1).map((p, i) =>
                  `L ${60 + ((i + 1) / (points.length - 1)) * 600} ${20 + (yFor(p.bolly) / 100) * 320}`
                ).join(" ")}
                L 660 340 L 60 340 Z`}
            fill="url(#bollyGrad)"
          />
          <path
            d={`M 60 ${20 + (yFor(points[0].bolly) / 100) * 320}
                ${points.slice(1).map((p, i) =>
                  `L ${60 + ((i + 1) / (points.length - 1)) * 600} ${20 + (yFor(p.bolly) / 100) * 320}`
                ).join(" ")}`}
            fill="none" stroke="#e94f64" strokeWidth="3" strokeLinejoin="round"
          />

          {/* Data points + labels */}
          {points.map((p, i) => {
            const cx = 60 + (i / (points.length - 1)) * 600;
            return (
              <g key={p.era}>
                <circle cx={cx} cy={20 + (yFor(p.holly) / 100) * 320} r="6"
                        fill="#5b8def" stroke="#0a0e1c" strokeWidth="2" />
                <text x={cx} y={20 + (yFor(p.holly) / 100) * 320 - 14}
                      textAnchor="middle" fontSize="13" fill="#5b8def" fontWeight="600">
                  {p.holly.toFixed(0)}%
                </text>

                <circle cx={cx} cy={20 + (yFor(p.bolly) / 100) * 320} r="6"
                        fill="#e94f64" stroke="#0a0e1c" strokeWidth="2" />
                <text x={cx} y={20 + (yFor(p.bolly) / 100) * 320 + 22}
                      textAnchor="middle" fontSize="13" fill="#e94f64" fontWeight="600">
                  {p.bolly.toFixed(0)}%
                </text>

                {/* X axis era label */}
                <text x={cx} y="370" textAnchor="middle" fontSize="12"
                      fill="white" fillOpacity="0.6">
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* Series labels at right */}
          <text x="666" y={24 + (yFor(last.holly) / 100) * 320}
                fontSize="13" fill="#5b8def" fontWeight="600">
            Hollywood
          </text>
          <text x="666" y={24 + (yFor(last.bolly) / 100) * 320}
                fontSize="13" fill="#e94f64" fontWeight="600">
            Bollywood
          </text>
        </svg>
      </div>

      {/* Takeaway band */}
      <div className="mt-10 grid gap-4 md:grid-cols-3 border-t border-white/10 pt-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-holly">What climbed</p>
          <p className="mt-2 font-display text-xl text-white leading-snug">
            Hollywood put more women in pride scenes — for ambition, identity, achievement.
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-bolly">What fell</p>
          <p className="mt-2 font-display text-xl text-white leading-snug">
            Bollywood doubled down on collective male pride — son's accomplishments, family, nation.
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold-400">What it means</p>
          <p className="mt-2 font-display text-xl text-white leading-snug">
            One mirror is updating. The other is hardening. Audiences will choose.
          </p>
        </div>
      </div>
    </div>
  );
}
