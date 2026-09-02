import { BOUNDARY, type BoundaryState } from "./landingData";

const DOT: Record<BoundaryState, string> = {
  live: "bg-emerald-400",
  rollout: "bg-bitcoin",
  gated: "bg-mist-500",
};

/**
 * The maturity ledger.
 *
 * Most protocols hide where the edge of production is. Publishing it is the
 * same argument the rest of the page makes, applied to ourselves.
 */
export default function BoundaryLedger() {
  return (
    <section className="container-x mt-f7">
      <div className="mx-auto max-w-2xl" data-nayori-reveal>
        <span className="kicker">Current boundary</span>
        <h2 className="mt-f3 text-h2 font-bold text-white">
          What is live, and what is deliberately not.
        </h2>
      </div>

      <ul className="mt-f5 grid gap-f2 md:grid-cols-3">
        {BOUNDARY.map((row, index) => (
          <li
            key={row.label}
            className="card card-hover nayori-glow-card p-f3"
            data-nayori-reveal
            style={{ ["--nayori-reveal-delay" as string]: `${index * 80}ms` }}
          >
            <span className="inline-flex items-center gap-2 text-micro uppercase tracking-[0.14em] text-mist-500">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[row.state]}`} />
              {row.label}
            </span>
            <p className="mt-f2 text-h3 font-semibold text-white">{row.what}</p>
            <p className="mt-f1 text-micro leading-relaxed text-mist-300">{row.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
