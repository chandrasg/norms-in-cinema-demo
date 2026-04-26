import { useMemo } from "react";

interface EraRow {
  era: string;
  bolly_shame_female_share: number;
  bolly_pride_female_share: number;
  bolly_pride_male_share: number;
  holly_shame_female_share: number;
  holly_pride_female_share: number;
  holly_pride_male_share: number;
  bolly_shame_n: number;
  bolly_pride_n: number;
  holly_shame_n: number;
  holly_pride_n: number;
}

const ERA_LABELS: Record<string, string> = {
  pre_2000: "Pre-2000",
  "2000_2014": "2000–2014",
  "2015_present": "2015–present",
};

export default function EraTrend({ trend }: { trend: EraRow[] }) {
  // Female share of pride is the punchline — Bollywood drops, Hollywood climbs
  const prideRows = useMemo(() => trend.map(r => ({
    era: r.era,
    bolly: r.bolly_pride_female_share * 100,
    holly: r.holly_pride_female_share * 100,
    bolly_n: r.bolly_pride_n,
    holly_n: r.holly_pride_n,
  })), [trend]);

  const shameRows = useMemo(() => trend.map(r => ({
    era: r.era,
    bolly: r.bolly_shame_female_share * 100,
    holly: r.holly_shame_female_share * 100,
    bolly_n: r.bolly_shame_n,
    holly_n: r.holly_shame_n,
  })), [trend]);

  return (
    <div className="panel p-6 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Has anything changed?</p>
      <h3 className="mt-1 font-display text-2xl text-white">The two industries have started moving in opposite directions.</h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        Female share of <span className="text-holly">pride</span> has climbed in Hollywood
        from 23% to 31% since 2000. In Bollywood it has fallen from 28% to 19%.
        The shame side stays roughly fixed — what's shifting is who gets celebrated.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Chart
          title="Female share of PRIDE"
          subtitle="Climbing in Hollywood. Falling in Bollywood."
          rows={prideRows}
        />
        <Chart
          title="Female share of SHAME"
          subtitle="Roughly stable in both — the floor hasn't moved."
          rows={shameRows}
        />
      </div>

      <p className="mt-8 text-xs text-white/40 italic max-w-2xl">
        Era buckets follow the source dataset. n = labeled-gender dialogue count per era·industry.
        Small sample sizes in the most recent bucket (Bollywood pride n={trend[2]?.bolly_pride_n})
        warrant caution, but the direction is consistent across our coverage.
      </p>
    </div>
  );
}

function Chart({
  title, subtitle, rows,
}: {
  title: string;
  subtitle: string;
  rows: { era: string; bolly: number; holly: number; bolly_n: number; holly_n: number }[];
}) {
  const max = 50; // y-axis cap, in percent
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-white/60">{title}</p>
      <p className="text-xs text-white/40 mt-0.5 mb-4">{subtitle}</p>

      <div className="grid grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.era} className="text-center">
            <div className="relative h-44 flex items-end justify-center gap-2">
              <Bar pct={r.bolly / max} color="bolly" value={r.bolly} n={r.bolly_n} />
              <Bar pct={r.holly / max} color="holly" value={r.holly} n={r.holly_n} />
            </div>
            <p className="mt-2 text-xs text-white/50">{ERA_LABELS[r.era] ?? r.era}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-bolly inline-block"></span>
          Bollywood
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-holly inline-block"></span>
          Hollywood
        </span>
      </div>
    </div>
  );
}

function Bar({ pct, color, value, n }: { pct: number; color: "bolly" | "holly"; value: number; n: number }) {
  const h = Math.min(Math.max(pct, 0), 1) * 100;
  const cls = color === "bolly" ? "bg-bolly/80" : "bg-holly/80";
  const txt = color === "bolly" ? "text-bolly" : "text-holly";
  return (
    <div className="flex flex-col items-center justify-end h-full w-10">
      <span className={`mb-1 text-xs font-display ${txt}`}>{value.toFixed(0)}%</span>
      <div
        className={`${cls} w-full rounded-t-sm transition-all`}
        style={{ height: `${h}%`, minHeight: 2 }}
        title={`n=${n}`}
      />
    </div>
  );
}
