import { useMemo, useState } from "react";

interface Trigger {
  theme: string;
  n: number;
  share: number;
  example: {
    dialogue: string;
    cause_raw: string;
    film: { title: string; year: string; poster_path: string };
  } | null;
}

interface Archetype {
  id: string;
  gender: "male" | "female";
  industry: "bolly" | "holly";
  label: string;
  shame: { total: number; triggers: Trigger[] };
  pride: { total: number; triggers: Trigger[] };
}

const POSTER = (p: string) =>
  p ? `https://image.tmdb.org/t/p/w92${p}` : "";

export default function NormCompass({ archetypes }: { archetypes: Archetype[] }) {
  const [activeId, setActiveId] = useState(archetypes[0]?.id ?? "");
  const [emotion, setEmotion] = useState<"shame" | "pride">("shame");
  const active = useMemo(
    () => archetypes.find(a => a.id === activeId) ?? archetypes[0],
    [archetypes, activeId]
  );

  if (!active) return null;
  const block = active[emotion];
  const max = block.triggers[0]?.share ?? 0;

  return (
    <div className="panel p-6 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Norm Compass</p>
      <h3 className="mt-1 font-display text-2xl text-white">
        If you're writing this character, here's what the corpus has done a thousand times.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        Pick an archetype. We'll surface the dominant shame and pride triggers
        for that character in that industry — and an example line from the films.
        Use it as a tropes-to-avoid map, or a tropes-to-knowingly-subvert one.
      </p>

      {/* Archetype picker */}
      <div className="mt-6 flex flex-wrap gap-2">
        {archetypes.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveId(a.id)}
            className={`rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm min-h-[40px] transition ${
              a.id === activeId
                ? a.industry === "bolly"
                  ? "bg-bolly text-ink-950"
                  : "bg-holly text-ink-950"
                : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Emotion toggle */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["shame", "pride"] as const).map(emo => (
          <button
            key={emo}
            onClick={() => setEmotion(emo)}
            className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] min-h-[40px] transition ${
              emo === emotion
                ? "bg-gold-400 text-ink-950"
                : "bg-white/5 text-white/60 hover:bg-white/10 ring-1 ring-white/10"
            }`}
          >
            {emo}
          </button>
        ))}
        <span className="text-xs text-white/40 sm:ml-auto">
          {block.total.toLocaleString()} dialogues
        </span>
      </div>

      {/* Triggers list */}
      <div className="mt-8 grid gap-3">
        {block.triggers.slice(0, 6).map((t, i) => {
          const widthPct = max > 0 ? (t.share / max) * 100 : 0;
          return (
            <div key={t.theme} className="group">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-xs text-white/40 w-5 text-right">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-base text-white flex-1">
                  {t.theme}
                </span>
                <span className="text-xs text-white/50 tabular-nums">
                  {t.n} · {(t.share * 100).toFixed(0)}%
                </span>
              </div>
              <div className="ml-8 mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    emotion === "shame" ? "bg-bolly/70" : "bg-holly/70"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              {t.example && i < 3 && (
                <div className="ml-2 sm:ml-8 mt-2 flex gap-3 rounded-lg bg-ink-950/40 p-3 ring-1 ring-white/5">
                  {t.example.film.poster_path && (
                    <img
                      src={POSTER(t.example.film.poster_path)}
                      alt=""
                      className="h-16 w-11 sm:h-20 sm:w-14 flex-none rounded ring-1 ring-white/10 object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="text-xs leading-relaxed min-w-0 flex-1">
                    <p className="text-white/80 italic break-words">"{t.example.dialogue}"</p>
                    <p className="mt-1 text-white/40">
                      — <span className="text-white/60">{t.example.film.title}</span>
                      {t.example.film.year ? ` (${t.example.film.year})` : ""}
                      {t.example.cause_raw ? (
                        <>
                          {" · "}
                          <span className="text-gold-400/80">
                            cause: {t.example.cause_raw}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-white/40 italic">
        Top 3 triggers shown with example lines. Counts are corpus-wide; share is
        within this archetype × emotion. Frequency ≠ judgement: these are the
        defaults. Your scene either reproduces them, complicates them, or breaks them.
      </p>
    </div>
  );
}
