import Link from "next/link";
import Logo, { GithubMark, PerkOSMark } from "./Logo";
import { COMPANY_NAME, PRODUCT_FULL_NAME, PRODUCT_NAME } from "../constants/brand";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Agents", href: "/agents" },
      { label: "Jobs", href: "/jobs" },
      { label: "Activity", href: "/activity" },
      { label: "Transparency", href: "/evidence" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "https://docs.nayori.ai", external: true },
      { label: "Agent SDK", href: "https://www.npmjs.com/package/@perkos/agent-sdk", external: true },
      { label: "GitHub", href: "https://github.com/PerkOS-xyz/PerkOS-Nayori", external: true },
      { label: "For language models", href: "/llms.txt" },
    ],
  },
  {
    title: "Evidence",
    links: [
      {
        label: "Contracts on the explorer",
        href: "https://explorer.hiro.so/address/SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH?chain=mainnet",
        external: true,
      },
      { label: "Public snapshot (JSON)", href: "/api/evidence.json" },
      { label: "Public snapshot (CSV)", href: "/api/evidence.csv" },
      { label: "Service health", href: "/api/health" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-f5 border-t border-white/[0.08]">
      <div className="container-x py-f5">
        <div className="grid gap-f4 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <span className="text-h3 font-bold tracking-tight text-white">{PRODUCT_NAME}</span>
            </div>
            <p className="mt-f2 max-w-xs text-micro leading-relaxed text-mist-500">
              On-chain identity, escrow, reputation and validation for agent commerce.
              Wallets keep custody of every economic action.
            </p>
            <a
              href="https://perkos.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-f3 inline-flex min-h-[40px] items-center gap-1.5 text-micro text-mist-300 transition-colors duration-200 ease-signature hover:text-mist-100 sm:min-h-0"
            >
              Built by <PerkOSMark className="h-4 w-4" /> {COMPANY_NAME}
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} className="lg:col-span-2" aria-label={column.title}>
              <h2 className="text-micro font-medium uppercase tracking-[0.14em] text-mist-500">
                {column.title}
              </h2>
              <ul className="mt-f2 sm:space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[40px] items-center text-micro text-mist-300 transition-colors duration-200 ease-signature hover:text-white sm:min-h-0"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="inline-flex min-h-[40px] items-center text-micro text-mist-300 transition-colors duration-200 ease-signature hover:text-white sm:min-h-0"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="lg:col-span-1 lg:justify-self-end">
            <a
              href="https://github.com/PerkOS-xyz/PerkOS-Nayori"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition-colors duration-200 ease-signature hover:border-white/30 hover:text-white sm:h-9 sm:w-9"
            >
              <GithubMark className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mt-f5 flex flex-col gap-2 border-t border-white/[0.06] pt-f3 text-micro text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <span>{PRODUCT_FULL_NAME}</span>
          <span>Built on Stacks · Settled on Bitcoin · © 2026</span>
        </div>
      </div>
    </footer>
  );
}
