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

// Mirrors scripts/export_station_json.py::slugify so we can deep-link from
// the Atlas FilmSearch into the Lens detail page without server-side help.
function filmSlug(industry: string, title: string, year: string): string {
  const base = `${industry}-${title}-${year}`;
  const cleaned = base
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "untitled";
}

// Get base path for in-site links (matches BASE_URL trailing-slash handling
// used elsewhere in the codebase).
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export default function FilmSearch({ films }: { films: FilmIndexEntry[] }) {
  const [q, setQ] = useState("");
  const [industryFilter, setIndustryFilter] = useState<"all" | "bolly" | "holly">("all");
  const [eraFilter, setEraFilter] = useState<"all" | "pre2000" | "mid" | "recent">("all");

  const matches = useMemo(() => {
    let pool = films;
    if (industryFilter !== "all") pool = pool.filter(f => f.industry === industryFilter);
    if (eraFilter !== "all") {
      pool = pool.filter(f => {
        const y = parseInt(f.year, 10);
        if (!y) return false;
        if (eraFilter === "pre2000") return y < 2000;
        if (eraFilter === "mid") return y >= 2000 && y < 2015;
        return y >= 2015;
      });
    }
    if (q.trim().length >= 2) {
      const needle = q.toLowerCase();
      pool = pool.filter(f => f.title.toLowerCase().includes(needle));
      return pool.slice(0, 24);
    }
    return pool.slice(0, 12);
  }, [q, films, industryFilter, eraFilter]);

  return (
    <div className="panel p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Search</p>
      <h3 className="mt-2 font-display text-2xl text-white">Find a film.</h3>
      <p className="mt-2 text-sm text-white/60">
        Type a title or filter by industry / era — see every shame and pride
        dialogue we extracted from it.
      </p>
      <p className="mt-2 text-xs text-white/45 max-w-2xl leading-relaxed">
        Coverage note: the corpus only includes films where annotators found
        shame or pride dialogue. Major action and animated franchises (e.g.,
        <em> Avengers</em>, <em>Toy Story</em>) appear with only a few labeled
        lines because their dialogue is dominated by plot rather than
        norm-laden moments. Films with no shame or pride dialogue aren't in
        the corpus at all.
      </p>

      <input
        type="search"
        placeholder="Devdas, Manchester by the Sea, Dilwale Dulhania Le Jayenge..."
        value={q}
        onChange={e => setQ(e.target.value)}
        className="mt-5 block w-full rounded-xl bg-ink-950 px-5 py-3 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50"
      />

      {/* Filters */}
      <div className="mt-3 flex flex-wrap gap-3">
        <div className="flex gap-1 rounded-full bg-ink-950 p-1 ring-1 ring-white/10">
          {(["all", "bolly", "holly"] as const).map(k => (
            <button
              key={k}
              onClick={() => setIndustryFilter(k)}
              className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em] min-h-[32px] transition ${
                industryFilter === k
                  ? k === "bolly" ? "bg-bolly text-ink-950"
                    : k === "holly" ? "bg-holly text-ink-950"
                    : "bg-white/15 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {k === "all" ? "All" : k === "bolly" ? "Bolly" : "Holly"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-ink-950 p-1 ring-1 ring-white/10">
          {(["all", "pre2000", "mid", "recent"] as const).map(k => (
            <button
              key={k}
              onClick={() => setEraFilter(k)}
              className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em] min-h-[32px] transition ${
                eraFilter === k
                  ? "bg-gold-400 text-ink-950"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {k === "all" ? "Any era" : k === "pre2000" ? "<2000" : k === "mid" ? "2000–14" : "2015+"}
            </button>
          ))}
        </div>
        {(industryFilter !== "all" || eraFilter !== "all" || q.trim().length > 0) && (
          <button
            onClick={() => { setIndustryFilter("all"); setEraFilter("all"); setQ(""); }}
            className="text-xs text-white/40 hover:text-white px-2"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {matches.map(f => {
          const slug = filmSlug(f.industry, f.title, f.year);
          // Films with at least 3 dialogues have detail JSON files in
          // public/data/station3_lens/. The Lens page picks the slug from
          // the ?film= query param and auto-loads it.
          const hasDetail = f.total_count >= 3;
          const href = hasDetail
            ? `${BASE}/lens?film=${encodeURIComponent(slug)}`
            : undefined;

          const inner = (
            <>
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
              {hasDetail && (
                <p className="mt-1 text-[11px] text-gold-400/60 group-hover:text-gold-400 transition">
                  View dialogues →
                </p>
              )}
            </>
          );

          return hasDetail ? (
            <a
              key={f.id}
              href={href}
              className="group rounded-xl bg-white/5 p-3 ring-1 ring-white/5 transition hover:ring-gold-400/40 hover:bg-white/[0.07] block"
            >
              {inner}
            </a>
          ) : (
            <article
              key={f.id}
              className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5 opacity-70"
              title="Too few extracted dialogues to show a detail page"
            >
              {inner}
            </article>
          );
        })}
      </div>

      {matches.length === 0 && (
        <p className="mt-6 text-sm text-white/40">
          {q.trim().length >= 2
            ? <>No films matching "{q}" with the current filters. Try clearing filters or simpler titles — transliteration is imperfect on Bollywood titles.</>
            : <>No films match the current filters. Clear filters to see all films.</>}
        </p>
      )}
    </div>
  );
}
