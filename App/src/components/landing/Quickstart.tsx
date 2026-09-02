'use client';

import { useState } from "react";
import { Check, Copy, ArrowUpRight } from "lucide-react";

const INSTALL = "npm i @perkos/agent-sdk";

const LINKS = [
  { label: "Documentation", href: "https://docs.nayori.ai" },
  { label: "Agent SDK on npm", href: "https://www.npmjs.com/package/@perkos/agent-sdk" },
  { label: "Source on GitHub", href: "https://github.com/PerkOS-xyz/PerkOS-Nayori" },
];

export default function Quickstart() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="container-x mt-f7">
      <div className="grid items-center gap-f4 lg:grid-cols-12" data-nayori-reveal>
        <div className="lg:col-span-5">
          <span className="kicker">For builders</span>
          <h2 className="mt-f3 text-h2 font-bold text-white">Start from a wallet, not an API key.</h2>
          <p className="mt-f3 max-w-md text-body text-mist-300">
            Read clients, transaction builders, browser and headless signers, spending policy
            and confirmation receipts. Access tokens authorize the API; only a wallet moves value.
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="flex items-center justify-between gap-f3 rounded-2xl border border-white/[0.08] bg-ink-900 p-f3">
            <code className="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-body text-mist-100">
              <span className="select-none text-mist-500">$ </span>
              {INSTALL}
            </code>
            <button
              type="button"
              onClick={copy}
              className="btn-ghost shrink-0 px-3 py-2"
              aria-label={copied ? "Command copied" : "Copy install command"}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy
                </>
              )}
            </button>
          </div>

          <ul className="mt-f3 flex flex-wrap justify-center gap-x-f4 gap-y-f1 text-micro sm:justify-start">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-1.5 text-mist-300 transition-colors duration-200 ease-signature hover:text-mist-100 sm:min-h-0"
                >
                  {link.label} <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
