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
 * SVG uses preserveAspectRatio="none" so it scales fluidly on mobile.
 */
export default function DivergingMirror({ trend }: { trend: EraRow[] }) {
  const points = useMemo(() => {
    return trend.map((r, i) => ({
      era: r.era,
      label: ERA_LABELS[r.era] ?? r.era,
      bolly: r.bolly_pride_female_share * 100,
      holly: r.holly_pride_female_share * 100,
      bolly_n: r.bolly_pride_n,
      holly_n: r.holly_pride_n,
    }));
  }, [trend]);

  // ViewBox: width 800, height 360. Plot area inset.
  const W = 800;
  const H = 360;
  const PAD_L = 64;
  const PAD_R = 110; // room for series labels at right
  const PAD_T = 28;
  const PAD_B = 56;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const Y_MAX = 40;

  const xFor = (i: number) => PAD_L + (i / (points.length - 1)) * plotW;
  const yFor = (v: number) => PAD_T + plotH - (v / Y_MAX) * plotH;

  const last = points[points.length - 1];
  const first = points[0];
  const bollyDelta = last.bolly - first.bolly;
  const hollyDelta = last.holly - first.holly;

  // Build path strings
  const hollyLine = points.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.holly)}`
  ).join(" ");
  const bollyLine = points.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.bolly)}`
  ).join(" ");
  const hollyArea = `${hollyLine} L ${xFor(points.length - 1)} ${PAD_T + plotH} L ${PAD_L} ${PAD_T + plotH} Z`;
  const bollyArea = `${bollyLine} L ${xFor(points.length - 1)} ${PAD_T + plotH} L ${PAD_L} ${PAD_T + plotH} Z`;

  return (
    <div className="panel p-5 md:p-12 bg-gradient-to-b from-white/[0.02] to-transparent">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-400">The Diverging Mirror</p>
      <h3 className="mt-2 font-display text-2xl md:text-4xl text-white max-w-3xl leading-tight">
        Two industries. One metric. Opposite directions.
      </h3>
      <p className="mt-4 text-sm md:text-base text-white/65 max-w-2xl leading-relaxed">
        Dialogue about female pride, by era. Hollywood has climbed by{" "}
        <span className="text-holly font-medium">{hollyDelta.toFixed(0)} points</span>{" "}
        since the 1990s. Bollywood has fallen by{" "}
        <span className="text-bolly font-medium">{Math.abs(bollyDelta).toFixed(0)} points</span>{" "}
        over the same period.
      </p>

      {/* Chart — responsive */}
      <div className="mt-8 md:mt-12 -mx-2 md:mx-0 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full h-auto min-w-[520px]"
          role="img"
          aria-label="Female share of pride dialogue, Hollywood vs Bollywood, by era"
        >
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
                x1={PAD_L} x2={W - PAD_R}
                y1={yFor(v)} y2={yFor(v)}
                stroke="white" strokeOpacity="0.06" strokeDasharray="2,4"
              />
              <text x={PAD_L - 10} y={yFor(v) + 4}
                    textAnchor="end" fontSize="13" fill="white" fillOpacity="0.4"
                    className="tabular-nums">
                {v}%
              </text>
            </g>
          ))}

          {/* Hollywood area + line */}
          <path d={hollyArea} fill="url(#hollyGrad)" />
          <path d={hollyLine} fill="none" stroke="#5b8def" strokeWidth="3" strokeLinejoin="round" />

          {/* Bollywood area + line */}
          <path d={bollyArea} fill="url(#bollyGrad)" />
          <path d={bollyLine} fill="none" stroke="#e94f64" strokeWidth="3" strokeLinejoin="round" />

          {/* Data points + labels */}
          {points.map((p, i) => {
            const cx = xFor(i);
            return (
              <g key={p.era}>
                <circle cx={cx} cy={yFor(p.holly)} r="6"
                        fill="#5b8def" stroke="#0a0e1c" strokeWidth="2" />
                <text x={cx} y={yFor(p.holly) - 14}
                      textAnchor="middle" fontSize="14" fill="#5b8def" fontWeight="600">
                  {p.holly.toFixed(0)}%
                </text>
                <circle cx={cx} cy={yFor(p.bolly)} r="6"
                        fill="#e94f64" stroke="#0a0e1c" strokeWidth="2" />
                <text x={cx} y={yFor(p.bolly) + 22}
                      textAnchor="middle" fontSize="14" fill="#e94f64" fontWeight="600">
                  {p.bolly.toFixed(0)}%
                </text>
                <text x={cx} y={H - 22} textAnchor="middle" fontSize="13"
                      fill="white" fillOpacity="0.6">
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* Series labels at right — clipped within viewBox */}
          <text x={W - PAD_R + 8} y={yFor(last.holly) + 4}
                fontSize="14" fill="#5b8def" fontWeight="600">
            Hollywood
          </text>
          <text x={W - PAD_R + 8} y={yFor(last.bolly) + 4}
                fontSize="14" fill="#e94f64" fontWeight="600">
            Bollywood
          </text>
        </svg>
      </div>

      {/* Sample-size caveat */}
      <p className="mt-4 text-xs text-white/40 italic">
        n per industry × era ranges from {Math.min(...points.flatMap(p => [p.bolly_n, p.holly_n]))} to{" "}
        {Math.max(...points.flatMap(p => [p.bolly_n, p.holly_n]))} dialogues
        about pride. Direction is consistent across coverage; small samples in
        the most recent Bollywood dataset warrant caution on the exact value.
      </p>

      {/* Takeaway band */}
      <div className="mt-8 md:mt-10 grid gap-4 md:grid-cols-3 border-t border-white/10 pt-6 md:pt-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-holly">What climbed</p>
          <p className="mt-2 font-display text-lg md:text-xl text-white leading-snug">
            Hollywood depicted more scenes about female pride — prominent
            themes were ambition, identity, achievement.
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-bolly">What fell</p>
          <p className="mt-2 font-display text-lg md:text-xl text-white leading-snug">
            Bollywood doubled down on collective male pride for a son's
            accomplishments, family, nation.
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold-400">What it means</p>
          <p className="mt-2 font-display text-lg md:text-xl text-white leading-snug">
            One mirror is challenging stale stereotypes. The other continues to
            endorse them. Audiences will choose.
          </p>
        </div>
      </div>
    </div>
  );
}
