import { useState } from "react";

type Status = "live" | "alpha" | "v2";

interface Country {
  flag: string;
  name: string;
  industry: string;       // e.g. "Bollywood (Hindi)"
  status: Status;
  films?: string;         // e.g. "5,400" or "~12,000 expected"
  note?: string;
}

const COUNTRIES: Country[] = [
  // LIVE — currently in V1
  { flag: "🇮🇳", name: "India", industry: "Bollywood (Hindi)", status: "live",
    films: "~2,500 films", note: "Fully labeled in V1." },
  { flag: "🇺🇸", name: "United States", industry: "Hollywood", status: "live",
    films: "~2,900 films", note: "Fully labeled in V1." },

  // ALPHA — partial coverage being built now
  { flag: "🇰🇷", name: "Korea", industry: "Hallyu / Korean cinema", status: "alpha",
    films: "Pilot batch in process", note: "Subtitle pipeline + theme transfer testing." },
  { flag: "🇮🇳", name: "South India", industry: "Tamil / Telugu / Malayalam", status: "alpha",
    films: "Pilot batch in process", note: "Distinct norm landscape from Hindi cinema." },
  { flag: "🇫🇷", name: "France", industry: "European art cinema", status: "alpha",
    films: "Pilot batch in process", note: "Festival-circuit reference set." },
  { flag: "🇳🇬", name: "Nigeria", industry: "Nollywood", status: "alpha",
    films: "Pilot batch in process", note: "Highest-volume cinema globally; ripe for analysis." },

  // V2 — planned
  { flag: "🇯🇵", name: "Japan", industry: "Japanese cinema", status: "v2" },
  { flag: "🇧🇷", name: "Brazil", industry: "Brazilian cinema", status: "v2" },
  { flag: "🇲🇽", name: "Mexico", industry: "Mexican cinema", status: "v2" },
  { flag: "🇪🇸", name: "Spain", industry: "Spanish cinema", status: "v2" },
  { flag: "🇪🇬", name: "Egypt", industry: "Egyptian cinema", status: "v2" },
  { flag: "🇮🇷", name: "Iran", industry: "Iranian cinema", status: "v2" },
  { flag: "🇹🇷", name: "Turkey", industry: "Turkish cinema", status: "v2" },
  { flag: "🇮🇹", name: "Italy", industry: "Italian cinema", status: "v2" },
  { flag: "🇩🇪", name: "Germany", industry: "German cinema", status: "v2" },
  { flag: "🇨🇳", name: "China", industry: "Chinese cinema", status: "v2" },
  { flag: "🇬🇧", name: "United Kingdom", industry: "British cinema", status: "v2" },
  { flag: "🇦🇷", name: "Argentina", industry: "Argentine cinema", status: "v2" },
  { flag: "🇿🇦", name: "South Africa", industry: "South African cinema", status: "v2" },
  { flag: "🇸🇪", name: "Sweden", industry: "Swedish cinema", status: "v2" },
];

const STATUS_META: Record<Status, { label: string; color: string; ring: string; text: string }> = {
  live:  { label: "Live in V1", color: "bg-emerald-400/10", ring: "ring-emerald-400/40", text: "text-emerald-300" },
  alpha: { label: "Alpha",       color: "bg-amber-400/10",   ring: "ring-amber-400/40",   text: "text-amber-300"   },
  v2:    { label: "V2 roadmap",  color: "bg-white/5",        ring: "ring-white/10",       text: "text-white/50"    },
};

/**
 * Country Preview — visualizes the V2 expansion (~250K films, 160 countries)
 * using a tiered status grid. Live: India (Hindi) + USA. Alpha: 4 industries
 * actively in pilot. V2: 14 named planned + 140 long tail.
 */
export default function CountryPreview() {
  const [filter, setFilter] = useState<Status | "all">("all");
  const visible = COUNTRIES.filter(c => filter === "all" || c.status === filter);

  const counts = {
    live: COUNTRIES.filter(c => c.status === "live").length,
    alpha: COUNTRIES.filter(c => c.status === "alpha").length,
    v2: COUNTRIES.filter(c => c.status === "v2").length,
  };

  return (
    <div className="panel p-6 md:p-10">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Country Preview</p>
        <span className="rounded-full bg-amber-400/10 ring-1 ring-amber-400/40 text-amber-300 text-[10px] uppercase tracking-[0.18em] px-2 py-0.5">
          Alpha
        </span>
      </div>
      <h3 className="mt-1 font-display text-2xl text-white max-w-3xl">
        From two industries to 160 countries.
      </h3>
      <p className="mt-3 text-sm text-white/60 max-w-2xl">
        V1 covers Bollywood and Hollywood. V2 extends the same method —
        embedding-based theme clustering, gendered-target labeling, era
        bucketing — to ~250K films across the major film industries below.{" "}
        <span className="text-amber-300/80">Alpha:</span> the country list and
        roadmap below are the working plan; coverage and exact film counts will
        firm up as pilot batches complete.
      </p>

      {/* Tier summary */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tier
          label="Live in V1"
          count={counts.live}
          accent="emerald"
          desc="Fully labeled. Powering everything you've seen on this site."
        />
        <Tier
          label="Alpha"
          count={counts.alpha}
          accent="amber"
          desc="Pilot batches in process. Distinct cultural landscapes worth a dedicated lens."
        />
        <Tier
          label="V2 roadmap"
          count={`${counts.v2}+`}
          accent="white"
          desc={`${counts.v2} named industries + a long tail to reach 160 countries.`}
        />
      </div>

      {/* Filter */}
      <div className="mt-8 flex flex-wrap gap-2">
        {(["all", "live", "alpha", "v2"] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em] min-h-[36px] transition ${
              filter === k
                ? "bg-gold-400 text-ink-950"
                : "bg-white/5 ring-1 ring-white/10 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {k === "all" ? "All" : STATUS_META[k].label}
          </button>
        ))}
      </div>

      {/* Country grid */}
      <div className="mt-6 grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((c, i) => {
          const m = STATUS_META[c.status];
          return (
            <div key={c.name + i}
                 className={`rounded-xl ${m.color} ring-1 ${m.ring} p-4 transition ${
                   c.status === "v2" ? "opacity-70" : ""
                 }`}>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl leading-none" aria-hidden="true">{c.flag}</span>
                <span className="font-display text-base text-white truncate">{c.name}</span>
              </div>
              <p className="mt-1 text-xs text-white/55 leading-snug">
                {c.industry}
              </p>
              <p className={`mt-3 text-[10px] uppercase tracking-[0.18em] ${m.text}`}>
                {m.label}
              </p>
              {c.films && (
                <p className="mt-1 text-[11px] text-white/45 tabular-nums">{c.films}</p>
              )}
              {c.note && (
                <p className="mt-2 text-[11px] text-white/50 leading-snug">{c.note}</p>
              )}
            </div>
          );
        })}

        {/* The long tail tile */}
        {(filter === "all" || filter === "v2") && (
          <div className="rounded-xl bg-white/[0.02] ring-1 ring-dashed ring-white/10 p-4 flex flex-col justify-between">
            <div>
              <p className="font-display text-base text-white/70">+ 140 more</p>
              <p className="mt-1 text-xs text-white/45 leading-snug">
                African, Southeast Asian, Latin American, MENA, Central Asian,
                and Pacific industries — to reach the V2 target of 160 countries.
              </p>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/40">
              V2 roadmap
            </p>
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-white/40 italic max-w-2xl leading-relaxed">
        This list is illustrative of the scope, not a binding commitment.
        Pilot order is shaped by subtitle availability, cultural research
        partnerships, and funder priorities — which is part of why we want to
        hear from you.
      </p>
    </div>
  );
}

function Tier({ label, count, accent, desc }: {
  label: string;
  count: string | number;
  accent: "emerald" | "amber" | "white";
  desc: string;
}) {
  const accentMap = {
    emerald: { ring: "ring-emerald-400/30", text: "text-emerald-300", bg: "bg-emerald-400/5" },
    amber:   { ring: "ring-amber-400/30",   text: "text-amber-300",   bg: "bg-amber-400/5" },
    white:   { ring: "ring-white/15",        text: "text-white/70",    bg: "bg-white/[0.03]" },
  } as const;
  const a = accentMap[accent];
  return (
    <div className={`rounded-xl ${a.bg} ring-1 ${a.ring} p-4`}>
      <div className="flex items-baseline gap-2">
        <span className={`font-display text-3xl ${a.text}`}>{count}</span>
        <span className={`text-[10px] uppercase tracking-[0.18em] ${a.text}`}>{label}</span>
      </div>
      <p className="mt-2 text-xs text-white/55 leading-snug">{desc}</p>
    </div>
  );
}
