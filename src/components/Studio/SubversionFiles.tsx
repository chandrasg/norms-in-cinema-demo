interface Subversion {
  trope: string;
  subversion: string;
  dialogue: string;
  industry: "bolly" | "holly";
  cause_raw: string;
  film: { title: string; year: string; poster_path: string };
}

const POSTER = (p: string) =>
  p ? `https://image.tmdb.org/t/p/w185${p}` : "";

/**
 * The Subversion Files — for each dominant trope, an example where the script
 * was flipped (e.g., a male character carrying a typically-female trope).
 */
export default function SubversionFiles({ items }: { items: Subversion[] }) {
  if (!items.length) return null;
  return (
    <div className="panel p-6 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">The Subversion Files</p>
      <h3 className="mt-1 font-display text-2xl text-white max-w-3xl">
        Some films flipped the script. Here's what that looks like.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        For each dominant trope in the corpus, an example where the typical
        target — usually a woman — is replaced by a man, or where the framing
        gets inverted. A starter set: the corpus has hundreds more.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {items.map((s) => (
          <article key={s.film.title} className="flex gap-4 rounded-xl bg-ink-950/40 ring-1 ring-white/5 p-4">
            {s.film.poster_path && (
              <img
                src={POSTER(s.film.poster_path)}
                alt=""
                className="h-28 w-20 flex-none rounded ring-1 ring-white/10 object-cover"
                loading="lazy"
              />
            )}
            <div className="text-xs leading-relaxed flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold-400">
                Trope: {s.trope}
              </p>
              <p className="mt-1 font-display text-base text-white">
                {s.film.title}{" "}
                <span className="text-white/40 font-sans text-xs font-normal">
                  ({s.film.year}, {s.industry === "bolly" ? "Bollywood" : "Hollywood"})
                </span>
              </p>
              <p className="mt-2 text-white/75 italic">"{s.dialogue}"</p>
              {s.cause_raw && (
                <p className="mt-2 text-white/40">
                  <span className="text-white/60">Subversion:</span> {s.subversion} ·{" "}
                  <span className="text-gold-400/80">cause: {s.cause_raw}</span>
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
