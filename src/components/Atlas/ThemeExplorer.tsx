import { useMemo, useState } from "react";

// =====================================================================
// Theme Explorer
// =====================================================================
//
// Inverts the navigation Niyati flagged in the monthly meeting: a user
// arrives with a topic in mind ("women in the workforce", "harassment",
// "patriotism") and wants to land on (a) the theme that captures it,
// (b) what the corpus contains under that theme, and (c) examples that
// reinforce *and* counter the dominant treatment.
//
// Sits above the existing tug-of-war on the Atlas page and uses the
// per-theme aggregates we now ship in station2_atlas.json (gender_breakdown,
// by_industry_gender, counter_examples).

interface ThemeExample {
  dialogue: string;
  industry: string;
  target_gender: string;
  cause_raw: string;
  film: { title: string; year: string; poster_path: string };
  counter_type?: "cross_gender" | "cross_industry";
}

interface Theme {
  id: number;
  emotion: "shame" | "pride";
  label: string;
  n_bolly: number;
  n_holly: number;
  total: number;
  share_bolly: number;
  share_holly: number;
  delta_bolly_minus_holly: number;
  gender_breakdown: { male: number; female: number; unclear: number };
  by_industry_gender: {
    bolly: { male?: number; female?: number; unclear?: number };
    holly: { male?: number; female?: number; unclear?: number };
  };
  examples: ThemeExample[];
  counter_examples: ThemeExample[];
}

const POSTER = (p: string) => (p ? `https://image.tmdb.org/t/p/w92${p}` : "");

// Synonyms / natural-language queries that should resolve to specific themes.
// Hand-crafted because the goal is to make the search forgiving for queries
// like "women in the workforce" → Future Aspirations / Personal Achievement.
// Add to this map as we hear new queries from users.
const THEME_SYNONYMS: Record<string, string[]> = {
  "Sexual Harassment": ["harassment", "harassed", "abuse", "assault", "molestation", "groping", "catcalling", "stalking", "rape", "sexual violence"],
  "Marital Status": ["marriage", "married", "single", "unmarried", "wife", "husband", "wedding", "divorce", "widow", "spinster"],
  "Future Aspirations": ["ambition", "aspirations", "career", "future", "dreams", "goals", "workforce", "work", "job", "vocation", "professional", "women in the workforce", "career women"],
  "Personal Achievement": ["achievement", "success", "accomplishment", "milestone", "winning", "triumph", "career", "work", "promotion"],
  "Family Honor": ["honor", "family", "izzat", "reputation", "name", "respect", "household"],
  "Cultural Identity": ["culture", "identity", "ethnicity", "heritage", "tradition", "roots", "origin"],
  "Patriotism": ["country", "nation", "patriot", "patriotism", "flag", "homeland", "national pride"],
  "Heroic Bravery": ["bravery", "hero", "courage", "valor", "fearless"],
  "Inappropriate Behavior": ["impropriety", "misconduct", "rudeness", "disrespectful", "inappropriate", "vulgar"],
  "Disrespect": ["disrespect", "rude", "insult", "contempt", "disregard"],
  "Dishonesty": ["lying", "lies", "lie", "dishonest", "untruthful", "false"],
  "Romantic Expression": ["love", "romance", "romantic", "intimacy", "affection", "courtship"],
  "Modesty": ["modesty", "modest", "clothing", "dress", "covered"],
  "Immodesty": ["immodest", "skimpy", "revealing", "exposed", "scantily"],
  "Promiscuity": ["promiscuity", "promiscuous", "loose", "slut", "whore", "casual sex"],
  "Nonconformity": ["nonconformity", "nonconformist", "different", "unconventional", "rebel", "outsider", "queer", "gay", "lgbt"],
  "Identity and Beauty": ["beauty", "identity", "looks", "appearance", "self", "self-image"],
  "Financial Success": ["wealth", "money", "rich", "riches", "financial", "earnings", "income", "prosperity"],
  "Virtuous Living": ["virtue", "virtuous", "moral", "ethical", "righteous", "good"],
  "Parental Pride": ["parent", "parental", "mother", "father", "child", "raising", "upbringing", "kids"],
  "Romantic Relationships": ["relationship", "couple", "romance", "boyfriend", "girlfriend", "love", "dating"],
  "Sports Victory": ["sports", "athletics", "game", "match", "win", "victory", "team", "competition"],
  "Academic Success": ["education", "school", "college", "university", "exam", "grades", "academic", "study", "studies"],
  "Poverty": ["poverty", "poor", "destitute", "broke", "impoverished", "struggling"],
  "Self-Image Issues": ["self-image", "self-esteem", "body", "looks", "weight", "appearance", "insecure"],
  "Negligence": ["negligence", "neglect", "careless", "irresponsible", "inattentive", "lazy"],
  "Causing Harm": ["harm", "hurting", "injuring", "damage", "violent"],
  "Shamelessness": ["shameless", "brazen", "audacious", "no shame"],
  "Suspicion and Deceit": ["suspicion", "deceit", "deceiving", "secretive", "hiding", "concealment", "betrayal"],
  "Betrayal": ["betrayal", "betray", "infidelity", "cheating", "unfaithful", "treachery"],
  "Financial Desperation": ["debt", "broke", "desperate", "money trouble", "bankruptcy", "loan"],
  "Criminal Activity": ["crime", "criminal", "illegal", "theft", "robbery", "law-breaking"],
  "Corruption": ["corruption", "corrupt", "bribery", "graft", "scandal", "kickback"],
  "Son's Accomplishments": ["son", "boy", "male child", "young man", "boy's success"],
  "Moral Complexity": ["moral", "ethics", "dilemma", "complexity", "grey area", "conflicted"],
  "Violence": ["violence", "violent", "fight", "fighting", "abuse", "physical"],
  "Invasion of Privacy": ["privacy", "private", "intrusion", "snooping", "spying", "surveillance"],
  "Alcoholism": ["alcohol", "alcoholic", "drinking", "drunk", "addiction", "booze"],
  "False Accusation": ["accusation", "accused", "blame", "scapegoat", "wrongly accused"],
  "Deception": ["deception", "trick", "deceive", "fraud", "cheating"],
};

function matchScore(theme: Theme, q: string): number {
  if (!q) return 0;
  const qq = q.toLowerCase().trim();
  const label = theme.label.toLowerCase();

  // Exact label substring match — strongest signal
  if (label.includes(qq)) return 100;

  // Synonym match
  const synonyms = THEME_SYNONYMS[theme.label] || [];
  for (const syn of synonyms) {
    const s = syn.toLowerCase();
    if (s === qq) return 90;
    if (s.includes(qq) || qq.includes(s)) return 60;
  }

  // Per-token overlap (e.g. "women career" matches "career women" synonym)
  const qTokens = qq.split(/\s+/).filter(t => t.length >= 3);
  let tokenHits = 0;
  for (const tok of qTokens) {
    if (label.includes(tok)) tokenHits++;
    for (const syn of synonyms) {
      if (syn.toLowerCase().includes(tok)) { tokenHits++; break; }
    }
  }
  return tokenHits > 0 ? 30 + tokenHits * 5 : 0;
}

function dominantPatternSentence(t: Theme): string {
  const total = t.total;
  const fem = t.gender_breakdown.female;
  const male = t.gender_breakdown.male;
  const dominantInd = t.delta_bolly_minus_holly > 0 ? "Bollywood" : "Hollywood";
  const minorityInd = t.delta_bolly_minus_holly > 0 ? "Hollywood" : "Bollywood";
  const dominantCount = t.delta_bolly_minus_holly > 0 ? t.n_bolly : t.n_holly;
  const minorityCount = t.delta_bolly_minus_holly > 0 ? t.n_holly : t.n_bolly;

  const labeled = fem + male;
  const dominantGender = labeled === 0 ? "unclear" : (fem > male ? "female" : "male");
  const dominantGenderShare = labeled === 0 ? 0 : Math.max(fem, male) / labeled;
  const minorityGender = dominantGender === "female" ? "male" : "female";
  const minorityCount_g = dominantGender === "female" ? male : fem;

  const ratio = minorityCount_g > 0
    ? (Math.max(fem, male) / minorityCount_g).toFixed(1)
    : "—";

  return (
    `In the corpus, this theme appears ${total.toLocaleString()} times — ` +
    `${dominantCount.toLocaleString()} in ${dominantInd}, ${minorityCount.toLocaleString()} in ${minorityInd}. ` +
    (labeled > 30 && dominantGenderShare > 0.55
      ? `Targets are predominantly ${dominantGender} (${Math.round(dominantGenderShare * 100)}%; ${ratio}× more than ${minorityGender}).`
      : `Gender targeting is mixed across the corpus.`)
  );
}

export default function ThemeExplorer({ themes }: { themes: Theme[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return themes
      .map(t => ({ t, s: matchScore(t, query) }))
      .filter(m => m.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map(m => m.t);
  }, [query, themes]);

  const selected = selectedId != null
    ? themes.find(t => t.id === selectedId) ?? null
    : null;

  const allSorted = useMemo(
    () => [...themes].sort((a, b) => b.total - a.total),
    [themes]
  );

  return (
    <div className="panel p-6 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Theme Explorer</p>
      <h3 className="mt-1 font-display text-2xl text-white max-w-3xl">
        Start with a topic. See what the corpus contains.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        Type a theme you're working with — or a topic, like
        <span className="text-white"> "women in the workforce"</span>,
        <span className="text-white"> "harassment"</span>, or
        <span className="text-white"> "family honor"</span> — and we'll surface
        the dominant pattern, examples that reinforce it, and counter-examples
        that go the other way.
      </p>

      {/* Search input */}
      <div className="mt-6 relative max-w-xl">
        <input
          type="search"
          placeholder="Try: harassment, women in the workforce, family honor…"
          value={query}
          aria-label="Search themes by natural-language query"
          onChange={e => { setQuery(e.target.value); setSelectedId(null); }}
          className="block w-full rounded-xl bg-ink-950 px-5 py-3 text-white placeholder-white/50 ring-1 ring-white/20 focus:outline-none focus:ring-gold-400/50"
        />
        {/* Autocomplete suggestions */}
        {matches.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-2 rounded-xl bg-ink-900 ring-1 ring-white/10 shadow-2xl overflow-hidden">
            {matches.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedId(t.id); setQuery(t.label); }}
                className="block w-full text-left px-4 py-3 hover:bg-white/5 transition border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-sm text-white">{t.label}</span>
                  <span className={`text-[10px] uppercase tracking-[0.18em] ${
                    t.emotion === "shame" ? "text-bolly/80" : "text-holly/80"
                  }`}>
                    {t.emotion}
                  </span>
                  <span className="ml-auto text-xs text-white/55 tabular-nums">
                    {t.total.toLocaleString()} dialogues
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        {query.trim() && matches.length === 0 && (
          <p className="mt-2 text-xs text-white/55">
            No theme matches "{query}". Try simpler keywords or
            <button
              onClick={() => setShowAll(true)}
              className="text-gold-400 hover:underline ml-1"
            >
              browse all 39 themes →
            </button>
          </p>
        )}
      </div>

      {/* Browse-all fallback */}
      {!selected && (
        <div className="mt-6">
          <button
            onClick={() => setShowAll(s => !s)}
            className="text-xs text-white/50 hover:text-white"
          >
            {showAll ? "Hide" : "Or browse all 39 themes"} {showAll ? "↑" : "↓"}
          </button>
          {showAll && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {allSorted.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedId(t.id); setQuery(t.label); setShowAll(false); }}
                  className="text-left rounded-lg bg-white/[0.03] hover:bg-white/[0.07] ring-1 ring-white/5 px-3 py-2 transition"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-white">{t.label}</span>
                    <span className={`text-[10px] uppercase tracking-[0.15em] ${
                      t.emotion === "shame" ? "text-bolly/70" : "text-holly/70"
                    }`}>
                      {t.emotion}
                    </span>
                    <span className="ml-auto text-[11px] text-white/55 tabular-nums">{t.total}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected theme detail */}
      {selected && (
        <div className="mt-8 border-t border-white/10 pt-8">
          <ThemeDetail theme={selected} onClose={() => { setSelectedId(null); setQuery(""); }} />
        </div>
      )}
    </div>
  );
}

function ThemeDetail({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const sentence = dominantPatternSentence(theme);

  return (
    <div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="font-display text-3xl text-white">{theme.label}</h3>
        <span className={`text-[10px] uppercase tracking-[0.25em] ${
          theme.emotion === "shame" ? "text-bolly" : "text-holly"
        }`}>
          {theme.emotion}
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-xs text-white/55 hover:text-white"
        >
          ← back to search
        </button>
      </div>

      {/* The "so what" auto-summary */}
      <p className="mt-3 text-base text-white/80 leading-relaxed max-w-3xl">
        {sentence}
      </p>

      {/* Industry split bars */}
      <div className="mt-5 max-w-xl space-y-2">
        <SplitBar
          label="Bollywood"
          color="bolly"
          n={theme.n_bolly}
          max={Math.max(theme.n_bolly, theme.n_holly)}
        />
        <SplitBar
          label="Hollywood"
          color="holly"
          n={theme.n_holly}
          max={Math.max(theme.n_bolly, theme.n_holly)}
        />
      </div>

      {/* Gender breakdown bar */}
      <div className="mt-5 max-w-xl">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50 mb-2">
          Target of the {theme.emotion} dialogue
        </p>
        <GenderBar breakdown={theme.gender_breakdown} />
      </div>

      {/* How to read this — the framing line Erica/Soraya/Ana Maria asked for */}
      <p className="mt-5 text-xs text-white/55 italic max-w-2xl border-l-2 border-gold-400/30 pl-3 leading-relaxed">
        Consider how a scene about this theme might reproduce the dominant
        pattern shown above — or open space to subvert it. The counter-examples
        below show how the corpus has staged this same theme in less common
        ways.
      </p>

      {/* Examples — dominant pattern */}
      <div className="mt-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50 mb-3">
          Dominant-pattern examples ({theme.examples.length})
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {theme.examples.slice(0, 4).map((ex, i) => (
            <ExampleCard key={i} example={ex} />
          ))}
        </div>
      </div>

      {/* Counter-pattern examples */}
      {theme.counter_examples && theme.counter_examples.length > 0 && (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 mb-3">
            Counter-pattern examples ({theme.counter_examples.length})
          </p>
          <p className="text-xs text-white/55 mb-3 max-w-2xl">
            These dialogues stage the same theme but go against the dominant
            gender or industry pattern — a starting point for finding scenes
            that complicate the default treatment.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {theme.counter_examples.map((ex, i) => (
              <ExampleCard key={i} example={ex} isCounter />
            ))}
          </div>
        </div>
      )}

      {/* Caveat */}
      <p className="mt-6 text-[11px] text-white/55 italic max-w-2xl">
        "Counter-pattern" here is a proxy: examples are picked because their
        target gender or industry inverts the dominant pattern of this theme.
        Whether the scene <em>narratively</em> resolves the trope (restitution,
        consequence, dialogue) is not yet labeled in the corpus — that
        annotation lands in V2.
      </p>
    </div>
  );
}

function SplitBar({ label, color, n, max }: { label: string; color: "bolly"|"holly"; n: number; max: number }) {
  const w = max ? (n / max) * 100 : 0;
  const bg = color === "bolly" ? "bg-bolly/60" : "bg-holly/60";
  const txt = color === "bolly" ? "text-bolly" : "text-holly";
  return (
    <div className="grid grid-cols-[80px_1fr_60px] items-center gap-3 text-xs">
      <span className={`${txt} text-right`}>{label}</span>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${bg}`} style={{ width: `${w}%` }} />
      </div>
      <span className="tabular-nums text-white/60">{n.toLocaleString()}</span>
    </div>
  );
}

function GenderBar({ breakdown }: { breakdown: { male: number; female: number; unclear: number } }) {
  const total = breakdown.male + breakdown.female + breakdown.unclear;
  if (!total) return null;
  const fp = (breakdown.female / total) * 100;
  const mp = (breakdown.male / total) * 100;
  const up = (breakdown.unclear / total) * 100;
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden flex bg-white/5">
        <div className="bg-bolly/70" style={{ width: `${fp}%` }} title={`Female: ${breakdown.female}`} />
        <div className="bg-holly/70" style={{ width: `${mp}%` }} title={`Male: ${breakdown.male}`} />
        <div className="bg-white/15" style={{ width: `${up}%` }} title={`Unclear: ${breakdown.unclear}`} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/60">
        <span><span className="inline-block w-2 h-2 rounded-full bg-bolly/70 mr-1.5" />Female · {breakdown.female.toLocaleString()} ({fp.toFixed(0)}%)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-holly/70 mr-1.5" />Male · {breakdown.male.toLocaleString()} ({mp.toFixed(0)}%)</span>
        {breakdown.unclear > 0 && (
          <span><span className="inline-block w-2 h-2 rounded-full bg-white/15 mr-1.5" />Unclear · {breakdown.unclear.toLocaleString()} ({up.toFixed(0)}%)</span>
        )}
      </div>
    </div>
  );
}

function ExampleCard({ example, isCounter }: { example: ThemeExample; isCounter?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ring-1 ${
      isCounter
        ? "bg-emerald-400/[0.04] ring-emerald-400/20"
        : "bg-ink-950/40 ring-white/5"
    }`}>
      <div className="flex gap-3">
        {example.film.poster_path && (
          <img
            src={POSTER(example.film.poster_path)}
            alt=""
            className="h-16 w-11 flex-none rounded ring-1 ring-white/10 object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1 text-xs">
          <p className="text-white/80 italic leading-relaxed">"{example.dialogue}"</p>
          <p className="mt-2 text-white/55">
            <span className={example.industry === "bolly" ? "text-bolly/80" : "text-holly/80"}>
              {example.industry === "bolly" ? "Bollywood" : "Hollywood"}
            </span>
            {" · "}{example.film.title} ({example.film.year})
            {example.target_gender && example.target_gender !== "unclear" && (
              <> · target: {example.target_gender}</>
            )}
            {isCounter && example.counter_type && (
              <> · <span className="text-emerald-300/80">{
                example.counter_type === "cross_gender" ? "cross-gender" : "cross-industry"
              }</span></>
            )}
          </p>
          {example.cause_raw && (
            <p className="mt-1 text-[11px] text-white/55 italic">{example.cause_raw}</p>
          )}
        </div>
      </div>
    </div>
  );
}
