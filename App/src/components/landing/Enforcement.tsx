import { ENFORCEMENT } from "./landingData";

/**
 * The differentiator, stated plainly: every capability names the component
 * that enforces it.
 *
 * Server-rendered with no client JavaScript. The row animation is driven by
 * the shared reveal observer through CSS, so the text is present and readable
 * whether or not any of it runs.
 */
export default function Enforcement() {
  return (
    <section className="container-x mt-f7">
      <div className="grid gap-f5 lg:grid-cols-12 lg:gap-f4">
        <div className="lg:col-span-5" data-nayori-reveal>
          <span className="kicker">Where it is enforced</span>
          <h2 className="mt-f3 text-h2 font-bold text-white">
            Every guarantee names
            <br />
            what enforces it.
          </h2>
          <p className="mt-f3 max-w-md text-body text-mist-300">
            Verification and settlement stay independent, and no single service can quietly
            widen its own authority. OAuth authorizes API access, not money movement — an
            access token cannot sign a Stacks transaction.
          </p>
        </div>

        <dl className="border-b border-white/[0.07] lg:col-span-7">
          {ENFORCEMENT.map((row, index) => (
            <div
              key={row.capability}
              className="nayori-enforce-row group relative grid grid-cols-1 gap-1 py-f3 sm:grid-cols-5 sm:gap-f3"
              data-nayori-reveal
              style={{ ["--nayori-reveal-delay" as string]: `${index * 90}ms` }}
            >
              <span
                aria-hidden="true"
                className="nayori-enforce-rule absolute inset-x-0 top-0 h-px bg-white/[0.07]"
              />
              <dt className="text-body font-semibold text-brand-350 sm:col-span-2">
                {row.capability}
              </dt>
              <dd className="nayori-enforce-where font-mono text-micro leading-relaxed text-mist-200 transition-colors duration-200 ease-signature group-hover:text-white sm:col-span-3">
                {row.where}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
