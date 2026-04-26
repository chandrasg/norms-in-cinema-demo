import { useEffect, useMemo, useState } from "react";

interface FilmIndex {
  slug: string;
  title: string;
  year: string;
  industry: string;
  poster_path: string;
  totals: { shame: number; pride: number };
}

interface FilmDetail {
  film: {
    id: string;
    title: string;
    year: string;
    industry: string;
    country: string;
    poster_path: string;
    overview: string;
  };
  totals: { shame: number; pride: number };
  themes: { label: string; count: number }[];
  gender_breakdown: Record<string, Record<string, number>>;
  dialogues: Array<{
    dialogue_id: string;
    emotion: string;
    dialogue: string;
    target_person: string;
    target_gender: string;
    cause_raw: string;
    theme_label: string;
  }>;
}

const TMDB_POSTER = "https://image.tmdb.org/t/p/w300";
const TMDB_POSTER_SM = "https://image.tmdb.org/t/p/w154";

interface Props {
  filmIndex: FilmIndex[];
  basePath: string;  // e.g. "/mapgen-demo/data/station3_lens"
}

export default function FilmPicker({ filmIndex, basePath }: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<FilmDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "bolly" | "holly">("all");

  const filtered = useMemo(
    () => filmIndex.filter(f => filter === "all" || f.industry === filter),
    [filmIndex, filter]
  );

  useEffect(() => {
    if (!selectedSlug) return;
    setLoading(true);
    fetch(`${basePath}/${selectedSlug}.json`)
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false); })
      .catch(() => { setDetail(null); setLoading(false); });
  }, [selectedSlug, basePath]);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="panel p-4">
        <div className="flex gap-1 text-xs">
          {(["all", "bolly", "holly"] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`flex-1 rounded-md py-1.5 transition ${
                filter === k
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {k === "all" ? "All" : k === "bolly" ? "Bolly" : "Holly"}
            </button>
          ))}
        </div>
        <ul className="mt-3 max-h-[600px] overflow-y-auto space-y-1 pr-1">
          {filtered.map(f => (
            <li key={f.slug}>
              <button
                onClick={() => setSelectedSlug(f.slug)}
                className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition ${
                  selectedSlug === f.slug
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                {f.poster_path ? (
                  <img
                    src={TMDB_POSTER_SM + f.poster_path}
                    alt=""
                    className="h-12 w-8 rounded object-cover ring-1 ring-white/10 flex-shrink-0"
                  />
                ) : (
                  <div className="h-12 w-8 rounded bg-ink-800 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{f.title}</p>
                  <p className="text-xs text-white/40">
                    {f.year} · {f.industry === "bolly" ? "Bolly" : "Holly"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-6 md:p-8 min-h-[600px]">
        {loading && <p className="text-white/40">Loading…</p>}
        {!selectedSlug && (
          <div className="flex h-full flex-col items-center justify-center text-center text-white/50">
            <p className="font-display text-2xl text-white/60">Pick a film.</p>
            <p className="mt-3 max-w-sm text-sm">
              Read it through the corpus's lens — every shame and pride
              dialogue we extracted, the themes they cluster into, and how
              the gendered weight falls.
            </p>
          </div>
        )}
        {detail && <FilmDetailView detail={detail} />}
      </div>
    </div>
  );
}

function FilmDetailView({ detail }: { detail: FilmDetail }) {
  const f = detail.film;
  const shame = detail.dialogues.filter(d => d.emotion === "shame");
  const pride = detail.dialogues.filter(d => d.emotion === "pride");
  return (
    <article>
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {f.poster_path && (
          <img
            src={TMDB_POSTER + f.poster_path}
            alt=""
            className="w-32 md:w-40 rounded-lg ring-1 ring-white/10 shadow-2xl"
          />
        )}
        <div className="flex-1">
          <p className={`text-xs uppercase tracking-[0.25em] ${f.industry === "bolly" ? "text-bolly" : "text-holly"}`}>
            {f.industry === "bolly" ? "Bollywood" : "Hollywood"}
            {f.year && <span className="text-white/40 ml-2">· {f.year}</span>}
          </p>
          <h2 className="mt-2 font-display text-3xl text-white">{f.title}</h2>
          {f.overview && (
            <p className="mt-3 text-sm text-white/65 leading-relaxed line-clamp-3">{f.overview}</p>
          )}
          <div className="mt-4 flex items-center gap-5 text-sm">
            <span className="flex items-baseline gap-1.5">
              <span className="text-bolly font-display text-2xl">{detail.totals.shame}</span>
              <span className="text-white/50 text-xs">shame</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-holly font-display text-2xl">{detail.totals.pride}</span>
              <span className="text-white/50 text-xs">pride</span>
            </span>
          </div>
        </div>
      </div>

      {detail.themes.length > 0 && (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-400 mb-3">Themes that surface</p>
          <div className="flex flex-wrap gap-2">
            {detail.themes.slice(0, 8).map(t => (
              <span key={t.label} className="tag">
                {t.label} <span className="text-white/40 ml-1">×{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {shame.length > 0 && (
        <DialogueList title="Shame" dialogues={shame.slice(0, 6)} accent="bolly" />
      )}
      {pride.length > 0 && (
        <DialogueList title="Pride" dialogues={pride.slice(0, 6)} accent="holly" />
      )}
    </article>
  );
}

function DialogueList({
  title, dialogues, accent,
}: {
  title: string;
  dialogues: FilmDetail["dialogues"];
  accent: "bolly" | "holly";
}) {
  return (
    <div className="mt-8">
      <h3 className={`text-xs uppercase tracking-[0.25em] ${accent === "bolly" ? "text-bolly" : "text-holly"}`}>
        {title}
      </h3>
      <ul className="mt-3 space-y-3">
        {dialogues.map(d => (
          <li key={d.dialogue_id} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/5">
            <p className="text-sm text-white/85 leading-relaxed">"{d.dialogue}"</p>
            <p className="mt-2 text-xs text-white/40">
              <span className={accent === "bolly" ? "text-bolly/80" : "text-holly/80"}>
                {d.target_person || "—"}
              </span>
              {d.target_gender && d.target_gender !== "unclear" && ` · ${d.target_gender}`}
              {d.theme_label && <> · <span className="text-gold-400/80">{d.theme_label}</span></>}
              {d.cause_raw && <> · <em>{d.cause_raw}</em></>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
