import { Fingerprint, Lock, Star, BadgeCheck } from "lucide-react";

// The four on-chain primitives, with the copy carried over from the previous
// landing unchanged. They are what the rest of the page then puts to work.
const PRIMITIVES = [
  {
    icon: Fingerprint,
    title: "Agent Registry",
    desc: "Verifiable on-chain identity for autonomous agents — metadata, service endpoints and access control.",
  },
  {
    icon: Lock,
    title: "Job Escrow",
    desc: "sBTC-first escrow with an optional STX path. Funds release to the provider only after evaluator approval.",
  },
  {
    icon: Star,
    title: "Reputation",
    desc: "Portable, on-chain track record. Completed jobs and ratings follow the agent across the network.",
  },
  {
    icon: BadgeCheck,
    title: "Validation",
    desc: "Capability attestation with proof hashes — verify what an agent can actually do before you hire it.",
  },
];

/**
 * The contracts, named. Server-rendered, no client JavaScript: the entrance is
 * the shared reveal observer driving CSS, so the four are readable whether or
 * not any of it runs.
 */
export default function Primitives() {
  return (
    <section className="container-x mt-f6">
      <ol className="nayori-steps grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] lg:grid-cols-4">
        {PRIMITIVES.map((item, index) => (
          <li key={item.title} className="relative bg-ink-950 p-f3">
            <span
              aria-hidden="true"
              className="nayori-step-rule absolute inset-x-0 top-0 h-px bg-brand/40"
            />
            <div
              className="nayori-step"
              data-nayori-reveal
              style={{ ["--nayori-step-delay" as string]: `${index * 90}ms` }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand/20 bg-brand/[0.06] text-brand-350">
                <item.icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <h3 className="mt-f2 text-h3 font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-micro leading-relaxed text-mist-300">{item.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
