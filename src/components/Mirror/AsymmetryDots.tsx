import { useEffect, useMemo, useRef, useState } from "react";

interface AsymCounts {
  male: number;
  female: number;
  unclear: number;
}

interface Props {
  asymmetry: {
    shame: { bolly: AsymCounts; holly: AsymCounts };
    pride: { bolly: AsymCounts; holly: AsymCounts };
  };
}

/**
 * The asymmetry dot-stream. Each dialogue is a dot. Shame on the left,
 * pride on the right. Female targets in coral, male in blue, unclear in
 * dim white. The shape of the cloud IS the finding.
 */
export default function AsymmetryDots({ asymmetry }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [played, setPlayed] = useState(false);

  // Build dot list — sample down for fps reasons, preserving ratios
  const dots = useMemo(() => {
    const all: { side: "shame" | "pride"; industry: "bolly" | "holly"; gender: "male" | "female" | "unclear" }[] = [];
    for (const side of ["shame", "pride"] as const) {
      for (const ind of ["bolly", "holly"] as const) {
        const c = asymmetry[side][ind];
        for (let i = 0; i < c.male; i++) all.push({ side, industry: ind, gender: "male" });
        for (let i = 0; i < c.female; i++) all.push({ side, industry: ind, gender: "female" });
        for (let i = 0; i < c.unclear; i++) all.push({ side, industry: ind, gender: "unclear" });
      }
    }
    // Shuffle so visual reveal is interleaved
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [asymmetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || played) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const colWidth = cssW / 2;
    const padding = 24;

    // Two stacks (shame left, pride right). Within each, dots fall to a
    // packed grid — so the height of the dot pile encodes count.
    const dotR = 2.4;
    const gap = 1.2;
    const cellW = dotR * 2 + gap;
    const dotsPerRow = Math.floor((colWidth - padding * 2) / cellW);

    const positions: Record<"shame" | "pride", { x: number; y: number }[]> = {
      shame: [],
      pride: [],
    };

    let i = 0;
    let rafId: number;
    const startTime = performance.now();
    const totalMs = 4500;

    function colorFor(d: typeof dots[number]) {
      if (d.gender === "female") return "rgba(232, 93, 77, 0.85)"; // bolly coral / female-shame mark
      if (d.gender === "male") return "rgba(91, 141, 239, 0.7)";
      return "rgba(255, 255, 255, 0.18)";
    }

    function frame(t: number) {
      const progress = Math.min((t - startTime) / totalMs, 1);
      const target = Math.floor(progress * dots.length);

      while (i < target) {
        const d = dots[i];
        const arr = positions[d.side];
        const idx = arr.length;
        const row = Math.floor(idx / dotsPerRow);
        const col = idx % dotsPerRow;
        const xOffset = d.side === "shame" ? padding : colWidth + padding;
        const x = xOffset + col * cellW + dotR;
        const y = cssH - padding - row * cellW - dotR;

        ctx!.beginPath();
        ctx!.fillStyle = colorFor(d);
        ctx!.arc(x, y, dotR, 0, Math.PI * 2);
        ctx!.fill();

        arr.push({ x, y });
        i++;
      }

      if (progress < 1) rafId = requestAnimationFrame(frame);
      else setPlayed(true);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [dots, played]);

  // Totals for the legend bar
  const totals = useMemo(() => {
    const t = { shame: { female: 0, male: 0, unclear: 0 }, pride: { female: 0, male: 0, unclear: 0 } };
    for (const side of ["shame", "pride"] as const) {
      for (const ind of ["bolly", "holly"] as const) {
        t[side].female += asymmetry[side][ind].female;
        t[side].male += asymmetry[side][ind].male;
        t[side].unclear += asymmetry[side][ind].unclear;
      }
    }
    return t;
  }, [asymmetry]);

  function pct(n: number, d: number) {
    return d ? Math.round((n / d) * 100) : 0;
  }

  const shameLabeled = totals.shame.female + totals.shame.male;
  const prideLabeled = totals.pride.female + totals.pride.male;

  return (
    <div className="panel p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Who carries the emotion?</p>
          <h3 className="mt-1 font-display text-2xl text-white">Every dialogue, every dot.</h3>
        </div>
        <button
          className="text-xs text-white/50 hover:text-white"
          onClick={() => setPlayed(false)}
        >Replay ↻</button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs uppercase tracking-wider text-white/50 mb-2">
        <p className="text-center">Shame · {totals.shame.female + totals.shame.male + totals.shame.unclear} dialogues</p>
        <p className="text-center">Pride · {totals.pride.female + totals.pride.male + totals.pride.unclear} dialogues</p>
      </div>

      <canvas ref={canvasRef} className="block w-full h-[360px] md:h-[440px]" />

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-display text-3xl text-bolly">
            {pct(totals.shame.female, shameLabeled)}<span className="text-white/40 text-lg">%</span>
          </p>
          <p className="text-white/60">of labeled shame lands on women</p>
        </div>
        <div>
          <p className="font-display text-3xl text-holly">
            {pct(totals.pride.male, prideLabeled)}<span className="text-white/40 text-lg">%</span>
          </p>
          <p className="text-white/60">of labeled pride lands on men</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 text-xs text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-bolly inline-block"></span>
          female target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-holly inline-block"></span>
          male target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/20 inline-block"></span>
          unclear
        </span>
      </div>
    </div>
  );
}
