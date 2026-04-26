import { useState } from "react";

const ROLES = [
  { id: "filmmaker", label: "Filmmaker / writer" },
  { id: "festival", label: "Festival programmer" },
  { id: "funder", label: "Funder / studio" },
  { id: "researcher", label: "Researcher" },
  { id: "other", label: "Other" },
];

interface Props {
  endpoint?: string;
}

export default function Feedback({ endpoint }: Props) {
  const [role, setRole] = useState<string>("filmmaker");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // No backend wired yet — fall back to a mailto link with prefilled body
      // so feedback still has a clear path. Replace with a real endpoint later.
      if (!endpoint) {
        const subject = encodeURIComponent(`MAPGEN feedback (${role})`);
        const body = encodeURIComponent(
          `Role: ${role}\n${email ? `Email: ${email}\n` : ""}\n${message}`
        );
        window.location.href = `mailto:sharathg@cis.upenn.edu?subject=${subject}&body=${body}`;
        setSubmitted(true);
        return;
      }
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, message, email }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="panel p-7 md:p-10 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Thank you</p>
        <h3 className="mt-3 font-display text-2xl text-white">Your note is on its way.</h3>
        <p className="mt-3 text-sm text-white/65 max-w-lg mx-auto">
          We're collecting feedback from filmmakers, programmers, funders and researchers
          to shape the next iteration of MAPGEN. We read every message.
        </p>
        <button
          onClick={() => { setSubmitted(false); setMessage(""); setEmail(""); }}
          className="mt-6 text-xs text-white/50 hover:text-white"
        >
          Send another →
        </button>
      </div>
    );
  }

  return (
    <div className="panel p-7 md:p-10">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-400">Help us shape what's next</p>
      <h3 className="mt-2 font-display text-2xl text-white">
        How could this data be most useful to you?
      </h3>
      <p className="mt-3 text-sm text-white/65 max-w-2xl">
        We're extending MAPGEN to 250,000 films across 160 countries. Tell us what cuts of the
        data — what views, what comparisons, what tools — would change your work. We're
        collecting input from across the creative economy.
      </p>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.18em] text-white/50 mb-2">I'm a…</p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={`rounded-full px-4 py-1.5 text-xs transition ${
                role === r.id
                  ? "bg-gold-400 text-ink-950"
                  : "bg-white/5 text-white/70 hover:bg-white/10 ring-1 ring-white/10"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="What would make this most useful in your work? What's missing? What did you want to click that wasn't there?"
        rows={5}
        className="mt-5 block w-full rounded-xl bg-ink-950 px-5 py-4 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 text-sm leading-relaxed"
      />

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email (optional, only if you want a reply)"
        className="mt-3 block w-full rounded-xl bg-ink-950 px-5 py-3 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 text-sm"
      />

      {error && (
        <p className="mt-3 text-sm text-bolly">Couldn't send: {error}</p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!message.trim() || loading}
          className="btn-primary disabled:opacity-40"
        >
          {loading ? "Sending…" : "Send feedback →"}
        </button>
        <p className="text-xs text-white/40">
          Goes to the project lead. No marketing, no list.
        </p>
      </div>
    </div>
  );
}
