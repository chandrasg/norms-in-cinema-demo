import { useState } from "react";

interface Round {
  id: string;
  dialogue: string;
  answer_industry: "bolly" | "holly";
  answer_emotion: "shame" | "pride";
  film: { title: string; year: string; poster_path: string; country: string };
  target_gender: string;
  theme_label: string;
  cause_raw: string;
}

interface Props {
  rounds: Round[];
}

const TMDB_POSTER = "https://image.tmdb.org/t/p/w300";

export default function GuessGame({ rounds }: Props) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  if (idx >= rounds.length) {
    return (
      <div className="panel p-10 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Done</p>
        <h3 className="mt-3 font-display text-3xl text-white">
          You guessed {score.correct}/{score.total} correctly.
        </h3>
        <p className="mt-4 text-white/70 max-w-xl mx-auto">
          Most people can usually tell the culture from the dialogue. But here's
          something the cultures share — keep scrolling.
        </p>
        <button
          onClick={() => { setIdx(0); setRevealed(false); setScore({ correct: 0, total: 0 }); }}
          className="btn-secondary mt-8"
        >Play again</button>
      </div>
    );
  }

  const round = rounds[idx];

  function guess(industry: "bolly" | "holly") {
    if (revealed) return;
    const correct = industry === round.answer_industry;
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setRevealed(true);
  }

  return (
    <div className="panel p-7 md:p-10">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/40 mb-6">
        <span>Round {idx + 1} of {rounds.length}</span>
        <span>{score.correct} / {score.total}</span>
      </div>

      <p className="font-display text-2xl md:text-3xl text-white leading-snug">
        “{round.dialogue}”
      </p>

      {!revealed ? (
        <div className="mt-10 grid grid-cols-2 gap-4">
          <button
            onClick={() => guess("bolly")}
            className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-6 py-8 text-left transition hover:bg-bolly/15 hover:ring-bolly/40"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-bolly">Bollywood</p>
            <p className="mt-2 text-white/70 text-sm">Press to guess</p>
          </button>
          <button
            onClick={() => guess("holly")}
            className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-6 py-8 text-left transition hover:bg-holly/15 hover:ring-holly/40"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-holly">Hollywood</p>
            <p className="mt-2 text-white/70 text-sm">Press to guess</p>
          </button>
        </div>
      ) : (
        <div className="mt-10">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {round.film.poster_path && (
              <img
                src={TMDB_POSTER + round.film.poster_path}
                alt={`Poster for ${round.film.title}`}
                loading="lazy"
                className="w-32 h-auto rounded-lg ring-1 ring-white/10 shadow-2xl"
              />
            )}
            <div className="flex-1">
              <p className={`text-xs uppercase tracking-[0.25em] ${round.answer_industry === "bolly" ? "text-bolly" : "text-holly"}`}>
                {round.answer_industry === "bolly" ? "Bollywood" : "Hollywood"} ·
                <span className="text-white/60 ml-2">{round.answer_emotion}</span>
              </p>
              <h3 className="mt-2 font-display text-2xl text-white">
                {round.film.title} <span className="text-white/40">({round.film.year})</span>
              </h3>
              <p className="mt-2 text-sm text-white/60">
                Target: <span className="text-white/80">{round.target_gender}</span>
                <span className="mx-2 text-white/30">·</span>
                Theme: <span className="text-gold-400">{round.theme_label}</span>
              </p>
              <p className="mt-3 text-sm text-white/50 italic">
                Reason: {round.cause_raw}
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={() => { setIdx(i => i + 1); setRevealed(false); }}
              className="btn-primary"
            >
              {idx + 1 < rounds.length ? "Next round →" : "See the punch line →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
