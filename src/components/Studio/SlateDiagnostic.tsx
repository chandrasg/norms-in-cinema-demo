import { useMemo, useState } from "react";

interface FilmIndexEntry {
  id: string;
  title: string;
  year: string;
  industry: string;
  poster_path: string;
  shame_count: number;
  pride_count: number;
  total_count: number;
}

const POSTER = (p: string) => (p ? `https://image.tmdb.org/t/p/w92${p}` : "");

const SAMPLE = `The Dark Knight
Lagaan
La La Land
Devdas
Manchester by the Sea
Kabhi Khushi Kabhie Gham`;

/**
 * Slate Diagnostic — paste a list of film titles, fuzzy-match against the
 * 300-film corpus, aggregate the norm profile, compare to corpus benchmarks.
 *
 * Alpha caveat: matches only against the 300 films currently in our index.
 * Theme-level breakdown ships in V2 (waiting on per-film theme exports for
 * the full corpus). Today: shame/pride counts, industry, era benchmarks.
 */
export default function SlateDiagnostic({ films }: { films: FilmIndexEntry[] }) {
  const [text, setText] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

  // Build a fast lookup table — normalize title (lowercase, strip non-alphanumeric)
  const lookup = useMemo(() => {
    const m = new Map<string, FilmIndexEntry>();
    for (const f of films) {
      m.set(normalize(f.title), f);
    }
    return m;
  }, [films]);

  const titles = useMemo(
    () => text.split(/[\n,]+/).map(t => t.trim()).filter(Boolean),
    [text]
  );

  const result = useMemo(() => {
    if (!analyzed) return null;
    const matched: FilmIndexEntry[] = [];
    const unmatched: string[] = [];
    for (const t of titles) {
      const norm = normalize(t);
      const exact = lookup.get(norm);
      if (exact) {
        matched.push(exact);
        continue;
      }
      // Try contains match — pick film with highest total_count
      const candidates = films.filter(f =>
        normalize(f.title).includes(norm) || norm.includes(normalize(f.title))
      );
      if (candidates.length > 0) {
        matched.push(candidates.sort((a, b) => b.total_count - a.total_count)[0]);
      } else {
        unmatched.push(t);
      }
    }

    const totalShame = matched.reduce((s, f) => s + f.shame_count, 0);
    const totalPride = matched.reduce((s, f) => s + f.pride_count, 0);
    const total = totalShame + totalPride;
    const bollyCount = matched.filter(f => f.industry === "bolly").length;
    const hollyCount = matched.filter(f => f.industry === "holly").length;
    const eraBuckets = { pre2000: 0, mid: 0, recent: 0 };
    for (const f of matched) {
      const y = parseInt(f.year, 10);
      if (!y) continue;
      if (y < 2000) eraBuckets.pre2000++;
      else if (y < 2015) eraBuckets.mid++;
      else eraBuckets.recent++;
    }

    return {
      matched, unmatched, total, totalShame, totalPride,
      bollyCount, hollyCount, eraBuckets,
      shameRatio: total > 0 ? totalShame / total : 0,
    };
  }, [analyzed, titles, lookup, films]);

  // Corpus benchmarks (computed across the 300-film index)
  const benchmarks = useMemo(() => {
    const bShame = films.reduce((s, f) => s + f.shame_count, 0);
    const bPride = films.reduce((s, f) => s + f.pride_count, 0);
    return {
      shameRatio: bShame / (bShame + bPride),
      bollyShare: films.filter(f => f.industry === "bolly").length / films.length,
    };
  }, [films]);

  return (
    <div className="panel p-6 md:p-10">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Slate Diagnostic</p>
        <span className="rounded-full bg-amber-400/10 ring-1 ring-amber-400/40 text-amber-300 text-[10px] uppercase tracking-[0.18em] px-2 py-0.5">
          Alpha
        </span>
      </div>
      <h3 className="mt-1 font-display text-2xl text-white max-w-3xl">
        Audit a slate. See its norm profile against the corpus.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        Paste film titles — one per line or comma-separated. We'll match against
        our 300-film index and surface aggregate shame / pride counts, the
        industry mix, the era distribution, and how it compares to the corpus
        average. <span className="text-amber-300/80">Alpha:</span> theme-level
        breakdowns and matching against the full 5,400-film corpus arrive in V2.
      </p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={SAMPLE}
        rows={6}
        className="mt-5 block w-full rounded-xl bg-ink-950 px-4 py-3 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 text-sm leading-relaxed font-mono"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => { setAnalyzed(true); }}
          disabled={titles.length < 1}
          className="btn-primary disabled:opacity-40 min-h-[40px]"
        >
          {analyzed ? "Re-run diagnostic →" : "Run diagnostic →"}
        </button>
        <button
          onClick={() => { setText(SAMPLE); setAnalyzed(false); }}
          className="text-xs text-white/40 hover:text-white min-h-[40px]"
        >
          Use sample slate
        </button>
        {analyzed && (
          <button
            onClick={() => { setText(""); setAnalyzed(false); }}
            className="text-xs text-white/40 hover:text-white min-h-[40px]"
          >
            Clear
          </button>
        )}
      </div>

      {result && (
        <div className="mt-8 space-y-6">
          {/* Match summary */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/30 text-emerald-300 px-3 py-1.5">
              {result.matched.length} matched
            </span>
            {result.unmatched.length > 0 && (
              <span className="rounded-full bg-white/5 ring-1 ring-white/10 text-white/60 px-3 py-1.5">
                {result.unmatched.length} unmatched
              </span>
            )}
          </div>

          {result.matched.length > 0 && (
            <>
              {/* Headline metrics */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Total dialogues"
                  value={result.total.toLocaleString()}
                  hint={`across ${result.matched.length} films`}
                />
                <Metric
                  label="Shame : Pride"
                  value={`${(result.shameRatio * 100).toFixed(0)} : ${((1 - result.shameRatio) * 100).toFixed(0)}`}
                  hint={`corpus avg: ${(benchmarks.shameRatio * 100).toFixed(0)} : ${((1 - benchmarks.shameRatio) * 100).toFixed(0)}`}
                  delta={result.shameRatio - benchmarks.shameRatio}
                />
                <Metric
                  label="Bolly : Holly"
                  value={`${result.bollyCount} : ${result.hollyCount}`}
                  hint={`corpus avg: ${Math.round(benchmarks.bollyShare * 10)} : ${10 - Math.round(benchmarks.bollyShare * 10)} per 10`}
                />
                <Metric
                  label="Era spread"
                  value={`${result.eraBuckets.pre2000} · ${result.eraBuckets.mid} · ${result.eraBuckets.recent}`}
                  hint="pre-00 · 00-14 · 15+"
                />
              </div>

              {/* Per-film breakdown */}
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/50 mb-3">
                  The slate, film by film
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {result.matched.map((f, i) => (
                    <div key={i} className="flex gap-3 rounded-lg bg-ink-950/40 ring-1 ring-white/5 p-3">
                      {f.poster_path ? (
                        <img
                          src={POSTER(f.poster_path)}
                          alt=""
                          className="h-16 w-11 flex-none rounded ring-1 ring-white/10 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-16 w-11 flex-none rounded bg-ink-900" />
                      )}
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-display text-sm text-white truncate">{f.title}</p>
                        <p className="text-white/40">
                          {f.year} · <span className={f.industry === "bolly" ? "text-bolly" : "text-holly"}>
                            {f.industry === "bolly" ? "Bolly" : "Holly"}
                          </span>
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {f.shame_count > 0 && <span className="text-bolly/80">{f.shame_count} shame</span>}
                          {f.pride_count > 0 && <span className="text-holly/80">{f.pride_count} pride</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reading */}
              <div className="rounded-xl bg-gold-400/5 ring-1 ring-gold-400/20 p-4 md:p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-gold-400 mb-2">Reading</p>
                <p className="text-sm text-white/80 leading-relaxed">
                  {readingFor(result, benchmarks)}
                </p>
              </div>
            </>
          )}

          {result.unmatched.length > 0 && (
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50 mb-2">
                Couldn't match {result.unmatched.length} title{result.unmatched.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-white/60 leading-relaxed">
                {result.unmatched.slice(0, 8).map((t, i) => (
                  <span key={i} className="inline-block mr-2">"<span className="text-white/80">{t}</span>"</span>
                ))}
                {result.unmatched.length > 8 && <span>and {result.unmatched.length - 8} more.</span>}
                {" "}V2 expands to ~250K films across 160 countries.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, hint, delta }: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
}) {
  const deltaTxt = delta != null
    ? Math.abs(delta) < 0.02
      ? "≈ corpus"
      : delta > 0 ? `+${(delta * 100).toFixed(0)}pp shame-leaning`
                  : `+${Math.abs(delta * 100).toFixed(0)}pp pride-leaning`
    : null;
  return (
    <div className="rounded-xl bg-ink-950/40 ring-1 ring-white/5 p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">{label}</p>
      <p className="mt-2 font-display text-2xl text-white tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-white/40">{hint}</p>}
      {deltaTxt && (
        <p className={`mt-1 text-[11px] ${
          delta != null && Math.abs(delta) < 0.02
            ? "text-white/40"
            : delta != null && delta > 0
            ? "text-bolly/80"
            : "text-holly/80"
        }`}>
          {deltaTxt}
        </p>
      )}
    </div>
  );
}

function readingFor(r: any, b: any): string {
  const parts: string[] = [];
  if (r.matched.length === 0) return "No matches in the corpus yet — V2 will expand to 250K titles.";

  if (r.shameRatio > b.shameRatio + 0.05) {
    parts.push("Your slate skews shame-heavy compared to the corpus average — characters are being held to account more than they're being celebrated.");
  } else if (r.shameRatio < b.shameRatio - 0.05) {
    parts.push("Your slate skews pride-leaning — more celebration than sanction relative to the corpus.");
  } else {
    parts.push("Your slate's shame–pride balance tracks the corpus average.");
  }

  if (r.bollyCount > 0 && r.hollyCount === 0) {
    parts.push("All-Bollywood — for cross-cultural comparison, consider mixing in Hollywood titles to surface the asymmetries.");
  } else if (r.hollyCount > 0 && r.bollyCount === 0) {
    parts.push("All-Hollywood — adding Bollywood titles surfaces the cultural axis the corpus is built around.");
  } else if (r.bollyCount > 0 && r.hollyCount > 0) {
    parts.push(`Bollywood–Hollywood split: ${r.bollyCount}–${r.hollyCount}. The convergences and divergences will be visible in The Atlas.`);
  }

  if (r.eraBuckets.recent === 0 && (r.eraBuckets.pre2000 + r.eraBuckets.mid) > 0) {
    parts.push("No post-2015 titles — the diverging female-pride trend (Mirror) won't show up.");
  }

  return parts.join(" ");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
