import { useMemo, useState } from "react";

interface FilmIndexEntry {
  id: string;
  title: string;
  year: string;
  industry: string;
  country: string;
  poster_path: string;
  shame_count: number;
  pride_count: number;
  total_count: number;
}

const TMDB_POSTER = "https://image.tmdb.org/t/p/w154";

export default function FilmSearch({ films }: { films: FilmIndexEntry[] }) {
  const [q, setQ] = useState("");

  const matches = useMemo(() => {
    if (q.trim().length < 2) return films.slice(0, 12);
    const needle = q.toLowerCase();
    return films
      .filter(f => f.title.toLowerCase().includes(needle))
      .slice(0, 24);
  }, [q, films]);

  return (
    <div className="panel p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Search</p>
      <h3 className="mt-2 font-display text-2xl text-white">Find a film.</h3>
      <p className="mt-2 text-sm text-white/60">
        Type a title — see every shame and pride dialogue we extracted from it.
      </p>

      <input
        type="search"
        placeholder="Devdas, Manchester by the Sea, Dilwale Dulhania Le Jayenge..."
        value={q}
        onChange={e => setQ(e.target.value)}
        className="mt-5 block w-full rounded-xl bg-ink-950 px-5 py-3 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50"
      />

      <div className="mt-6 grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {matches.map(f => (
          <article
            key={f.id}
            className="group rounded-xl bg-white/5 p-3 ring-1 ring-white/5 transition hover:ring-gold-400/30"
          >
            {f.poster_path ? (
              <img
                src={TMDB_POSTER + f.poster_path}
                alt={`Poster for ${f.title}`}
                loading="lazy"
                className="w-full aspect-[2/3] rounded object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="w-full aspect-[2/3] rounded bg-ink-800 grid place-items-center text-white/30 text-xs">
                no poster
              </div>
            )}
            <p className="mt-2 text-sm text-white/90 line-clamp-2">{f.title}</p>
            <p className="text-xs text-white/40">{f.year}</p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {f.shame_count > 0 && (
                <span className="text-bolly">{f.shame_count} shame</span>
              )}
              {f.pride_count > 0 && (
                <span className="text-holly">{f.pride_count} pride</span>
              )}
            </div>
          </article>
        ))}
      </div>

      {matches.length === 0 && q.trim().length >= 2 && (
        <p className="mt-6 text-sm text-white/40">
          No films matching "{q}". The corpus has 5,400+ films but transliteration
          is imperfect.
        </p>
      )}
    </div>
  );
}
