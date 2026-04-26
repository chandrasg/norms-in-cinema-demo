import { useMemo, useState } from "react";

interface Theme {
  id: number;
  emotion: "shame" | "pride";
  label: string;
  n_bolly: number;
  n_holly: number;
  total: number;
  delta_bolly_minus_holly: number;
  examples: Array<{
    dialogue_id: string;
    dialogue: string;
    industry: string;
    target_gender: string;
    cause_raw: string;
    film: { title: string; year: string; poster_path: string };
  }>;
}

interface Props {
  themes: Theme[];
  emotion: "shame" | "pride";
}

const TMDB_POSTER = "https://image.tmdb.org/t/p/w200";

export default function ThemeTugOfWar({ themes, emotion }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  const sorted = useMemo(
    () => themes
      .filter(t => t.emotion === emotion)
      .sort((a, b) => b.delta_bolly_minus_holly - a.delta_bolly_minus_holly),
    [themes, emotion]
  );

  const maxAbs = useMemo(
    () => Math.max(...sorted.map(t => Math.abs(t.delta_bolly_minus_holly))) || 0.05,
    [sorted]
  );

  const selectedTheme = selected != null ? sorted.find(t => t.id === selected) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="panel p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/50">
          <span className="text-bolly">← Bollywood-leaning</span>
          <span>{emotion}</span>
          <span className="text-holly">Hollywood-leaning →</span>
        </div>

        <ul className="space-y-1.5">
          {sorted.map(t => {
            const d = t.delta_bolly_minus_holly;
            const widthPct = (Math.abs(d) / maxAbs) * 50; // up to 50% (one half)
            const isLeft = d > 0;
            const active = selected === t.id;
            return (
              <li key={t.id}>
                <button
                  onClick={() => setSelected(active ? null : t.id)}
                  className={`relative flex h-10 w-full items-center transition group ${active ? "bg-white/5" : "hover:bg-white/5"} rounded-md`}
                >
                  {/* Left half (Bolly bar) */}
                  <div className="relative flex h-full w-1/2 items-center justify-end">
                    {isLeft && (
                      <div
                        className={`absolute right-0 h-6 rounded-l ${active ? "bg-bolly" : "bg-bolly/70"}`}
                        style={{ width: `${widthPct * 2}%` }}
                      />
                    )}
                    {isLeft && (
                      <span className="relative z-10 mr-3 text-sm font-medium text-white">
                        {t.label}
                      </span>
                    )}
                  </div>
                  {/* Center divider */}
                  <div className="h-full w-px bg-white/15" />
                  {/* Right half (Holly bar) */}
                  <div className="relative flex h-full w-1/2 items-center">
                    {!isLeft && (
                      <div
                        className={`absolute left-0 h-6 rounded-r ${active ? "bg-holly" : "bg-holly/70"}`}
                        style={{ width: `${widthPct * 2}%` }}
                      />
                    )}
                    {!isLeft && (
                      <span className="relative z-10 ml-3 text-sm font-medium text-white">
                        {t.label}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 text-xs text-white/40">
          Click a theme to read example dialogues from films that triggered it.
        </p>
      </div>

      <div className="panel p-6 md:p-8 min-h-[400px]">
        {selectedTheme ? (
          <ThemePanel theme={selectedTheme} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-white/40">
            <p className="font-display text-xl text-white/50">Pick a theme.</p>
            <p className="mt-3 max-w-xs text-sm">
              Each bar's length is the cultural Δ — how much more or less
              prominent that theme is in one industry vs. the other.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThemePanel({ theme }: { theme: Theme }) {
  const lean = theme.delta_bolly_minus_holly > 0 ? "bolly" : "holly";
  return (
    <div>
      <p className={`text-xs uppercase tracking-[0.25em] ${lean === "bolly" ? "text-bolly" : "text-holly"}`}>
        {theme.emotion} · {lean === "bolly" ? "Bollywood-leaning" : "Hollywood-leaning"}
      </p>
      <h3 className="mt-2 font-display text-3xl text-white">{theme.label}</h3>

      <div className="mt-4 flex items-center gap-6 text-sm">
        <span className="flex items-baseline gap-1.5">
          <span className="text-bolly font-display text-2xl">{theme.n_bolly}</span>
          <span className="text-white/50 text-xs">Bolly</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-holly font-display text-2xl">{theme.n_holly}</span>
          <span className="text-white/50 text-xs">Holly</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-gold-400 font-display text-2xl">
            {theme.delta_bolly_minus_holly > 0 ? "+" : ""}
            {(theme.delta_bolly_minus_holly * 100).toFixed(2)}%
          </span>
          <span className="text-white/50 text-xs">Δ</span>
        </span>
      </div>

      <div className="mt-6 space-y-4">
        {theme.examples.map(ex => (
          <article key={ex.dialogue_id} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/5">
            <div className="flex items-start gap-3">
              {ex.film.poster_path && (
                <img
                  src={TMDB_POSTER + ex.film.poster_path}
                  alt={`Poster for ${ex.film.title}`}
                  loading="lazy"
                  className="w-14 h-auto rounded ring-1 ring-white/10 flex-shrink-0"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className={ex.industry === "bolly" ? "text-bolly" : "text-holly"}>
                    {ex.industry === "bolly" ? "Bollywood" : "Hollywood"}
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="text-white/60">{ex.film.title} ({ex.film.year})</span>
                  {ex.target_gender && ex.target_gender !== "unclear" && (
                    <>
                      <span className="text-white/30">·</span>
                      <span className="text-white/40">target: {ex.target_gender}</span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-sm text-white/80 leading-relaxed">
                  "{ex.dialogue}"
                </p>
                <p className="mt-2 text-xs italic text-white/40">{ex.cause_raw}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
