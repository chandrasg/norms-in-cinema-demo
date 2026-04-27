import { useState } from "react";

const ROLES = [
  { id: "filmmaker", label: "Filmmaker / writer" },
  { id: "festival", label: "Festival programmer" },
  { id: "funder", label: "Funder / studio" },
  { id: "researcher", label: "Researcher" },
  { id: "other", label: "Other" },
];

interface Props {
  /**
   * Google Apps Script web-app URL or compatible JSON-accepting POST endpoint.
   * If absent, falls back to a mailto: link.
   */
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
      if (!endpoint) {
        // Fallback: open the user's mail client with a prefilled message.
        // Address is reassembled at runtime from base64 fragments so it
        // never appears as a literal mailto: target in the bundled JS.
        const _u = "c2hhcmF0aGc=";
        const _d = "Y2lzLnVwZW5uLmVkdQ==";
        const addr = atob(_u) + "@" + atob(_d);
        const subject = encodeURIComponent(`MAPGEN feedback (${role})`);
        const body = encodeURIComponent(
          `Role: ${role}\n${email ? `Email: ${email}\n` : ""}\n${message}`
        );
        window.location.href = `mailto:${addr}?subject=${subject}&body=${body}`;
        setSubmitted(true);
        return;
      }

      // Send to the configured endpoint (Google Apps Script or compatible).
      // Use text/plain content-type so the request stays a CORS "simple request"
      // and skips the preflight — Apps Script web apps don't handle OPTIONS.
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          role,
          message,
          email,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          referrer: typeof document !== "undefined" ? document.referrer : "",
          page: typeof location !== "undefined" ? location.href : "",
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Apps Script returns JSON {ok: true|false, error?: string}
      const result = await r.json().catch(() => ({ ok: true }));
      if (result && result.ok === false) {
        throw new Error(result.error || "Submission rejected");
      }
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
        <h3 className="mt-3 font-display text-2xl text-white">Your note is in.</h3>
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
        data — what views, what comparisons, what tools — would support your work. We're
        collecting input from across the creative economy.
      </p>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.18em] text-white/50 mb-2">I'm a…</p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={`rounded-full px-4 py-2 text-xs min-h-[40px] transition ${
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
        className="mt-5 block w-full rounded-xl bg-ink-950 px-4 md:px-5 py-3 md:py-4 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 text-sm leading-relaxed"
      />

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email (optional, only if you want a reply)"
        className="mt-3 block w-full rounded-xl bg-ink-950 px-4 md:px-5 py-3 text-white placeholder-white/30 ring-1 ring-white/10 focus:outline-none focus:ring-gold-400/50 text-sm"
      />

      {error && (
        <p className="mt-3 text-sm text-bolly">Couldn't send: {error}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={!message.trim() || loading}
          className="btn-primary disabled:opacity-40 min-h-[44px]"
        >
          {loading ? "Sending…" : "Send feedback →"}
        </button>
        <p className="text-xs text-white/40">
          {endpoint
            ? "Logged to a private Google Sheet. No marketing, no list."
            : "Goes to the project lead. No marketing, no list."}
        </p>
      </div>
    </div>
  );
}
