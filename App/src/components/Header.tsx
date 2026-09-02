'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import Logo, { GithubMark } from "./Logo";
import WalletConnect from "./WalletConnect";
import { PRODUCT_NAME } from "../constants/brand";
import { NETWORK_NAME } from "../constants/network";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/activity", label: "Activity" },
  { href: "/evidence", label: "Transparency" },
];
const RELEASE_CHANNEL = process.env.NEXT_PUBLIC_RELEASE_CHANNEL;

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [lifted, setLifted] = useState(false);

  // Transparent over the hero art, solid once the page starts moving.
  useEffect(() => {
    const sync = () => setLifted(window.scrollY > 24);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ease-signature ${
        lifted || open
          ? "border-b border-white/[0.07] bg-ink-900/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5" onClick={() => setOpen(false)}>
          <Logo className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <span className="truncate text-[15px] font-bold tracking-tight text-white">{PRODUCT_NAME}</span>
          <span className="shrink-0 rounded-full border border-brand/25 bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300 sm:px-2">
            {NETWORK_NAME}
          </span>
          {RELEASE_CHANNEL === "qa" && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              QA
            </span>
          )}
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-white/[0.06] text-white" : "text-mist-300 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/search"
            aria-label="Search"
            className="hidden h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition hover:border-white/30 hover:text-white sm:flex md:h-9 md:w-9"
          >
            <Search className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/PerkOS-xyz/PerkOS-Nayori"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hidden h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition hover:border-white/30 hover:text-white sm:flex md:h-9 md:w-9"
          >
            <GithubMark className="h-4 w-4" />
          </a>
          <WalletConnect />
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition hover:text-white md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/[0.07] bg-ink-900/95 backdrop-blur-xl md:hidden">
          <div className="container-x flex flex-col gap-1 py-3">
            {[...NAV, { href: "/search", label: "Search" }].map((n) => {
              const active = path === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-white/[0.06] text-white" : "text-mist-300 hover:text-white"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
