import { useEffect, useMemo, useState } from "react";

interface EraGenderCounts { male: number; female: number; unclear: number }

interface Props {
  era: Record<"shame" | "pride", Record<"bolly" | "holly", Record<string, EraGenderCounts>>>;
  era_themes: Record<"shame" | "pride", Record<"bolly" | "holly", Record<string, Record<string, number>>>>;
}

const ERAS = [
  { key: "pre_2000", label: "1990 — 1999", subtitle: "After the cold war.", color: "ink-700" },
  { key: "2000_2014", label: "2000 — 2014", subtitle: "Post-9/11. Mobile cinema.", color: "ink-600" },
  { key: "2015_present", label: "2015 — present", subtitle: "#MeToo. Streaming. Reckoning.", color: "gold-400" },
];

const SLIDE_DURATION = 8000;  // 8s per era-step
const TOTAL_LOOP = SLIDE_DURATION * 6;  // ~48s loop

/**
 * The ambient timeline — autoplay loop for an unattended kiosk surface.
 * Cycles through the three eras showing:
 *   - The female-shame share for both industries
 *   - Top 5 shame themes for each industry, that era
 *   - A callout when entering the 2015-present era
 */
export default function AmbientTimeline({ era, era_themes }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % ERAS.length);
    }, SLIDE_DURATION);
    return () => clearInterval(interval);
  }, []);

  const current = ERAS[step];

  const stats = useMemo(() => {
    const out: Record<"bolly" | "holly", { female: number; male: number; total: number; femaleShare: number }> = {
      bolly: { female: 0, male: 0, total: 0, femaleShare: 0 },
      holly: { female: 0, male: 0, total: 0, femaleShare: 0 },
    };
    for (const ind of ["bolly", "holly"] as const) {
      const c = era.shame[ind][current.key] || { male: 0, female: 0, unclear: 0 };
      out[ind].female = c.female || 0;
      out[ind].male = c.male || 0;
      const labeled = out[ind].female + out[ind].male;
      out[ind].total = labeled + (c.unclear || 0);
      out[ind].femaleShare = labeled > 0 ? out[ind].female / labeled : 0;
    }
    return out;
  }, [era, current]);

  const topThemes = useMemo(() => {
    const out: Record<"bolly" | "holly", string[]> = { bolly: [], holly: [] };
    for (const ind of ["bolly", "holly"] as const) {
      const themeMap = era_themes.shame[ind][current.key] || {};
      out[ind] = Object.entries(themeMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([label]) => label);
    }
    return out;
  }, [era_themes, current]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-white/5 p-10 md:p-16 min-h-[640px]">
      {/* Era progress dots */}
      <div className="absolute top-6 right-6 flex gap-2">
        {ERAS.map((e, i) => (
          <span
            key={e.key}
            className={`h-1.5 w-8 rounded-full transition-colors duration-700 ${
              i === step ? "bg-gold-400" : i < step ? "bg-white/30" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {/* Top label */}
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">Norms through time · auto-loop</p>

      {/* Era title */}
      <div key={current.key} className="mt-8 animate-fade-in-up">
        <h2 className="font-display text-7xl md:text-8xl text-white tracking-tight">
          {current.label}
        </h2>
        <p className="mt-3 font-display italic text-2xl text-white/60">
          {current.subtitle}
        </p>
      </div>

      {/* Female-shame share — two columns, animated */}
      <div className="mt-16 grid gap-8 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-bolly">Bollywood · shame</p>
          <p className="mt-3 font-display text-6xl md:text-7xl text-white">
            {Math.round(stats.bolly.femaleShare * 100)}<span className="text-white/30 text-3xl">% women</span>
          </p>
          <p className="mt-2 text-sm text-white/50">
            {stats.bolly.female} / {stats.bolly.female + stats.bolly.male} labeled
          </p>
          <ul className="mt-6 space-y-1.5">
            {topThemes.bolly.map((t, i) => (
              <li
                key={t}
                className="text-white/70 text-sm font-display"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="text-bolly">·</span> {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-holly">Hollywood · shame</p>
          <p className="mt-3 font-display text-6xl md:text-7xl text-white">
            {Math.round(stats.holly.femaleShare * 100)}<span className="text-white/30 text-3xl">% women</span>
          </p>
          <p className="mt-2 text-sm text-white/50">
            {stats.holly.female} / {stats.holly.female + stats.holly.male} labeled
          </p>
          <ul className="mt-6 space-y-1.5">
            {topThemes.holly.map(t => (
              <li key={t} className="text-white/70 text-sm font-display">
                <span className="text-holly">·</span> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Era-specific callout — only on the latest era */}
      {current.key === "2015_present" && (
        <div className="mt-16 max-w-2xl border-l-2 border-gold-400 pl-6 animate-fade-in-up">
          <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Callout</p>
          <p className="mt-2 font-display italic text-xl text-white/85 leading-snug">
            #MeToo, Nirbhaya, the streaming-era opening of the Indian film market.
            Watch which themes spike. Watch which don't move.
          </p>
        </div>
      )}

      {/* Subtle tick marker bottom */}
      <div className="absolute bottom-6 left-10 right-10 flex items-center justify-between text-xs text-white/30">
        <span>MAPGEN · Cinema's Mirror</span>
        <span>{step + 1} / {ERAS.length}</span>
      </div>

      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 700ms ease-out both; }
      `}</style>
    </div>
  );
}
