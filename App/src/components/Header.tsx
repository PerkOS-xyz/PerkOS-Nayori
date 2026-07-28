'use client';

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import Logo, { GithubMark } from "./Logo";
import WalletConnect from "./WalletConnect";
import { NETWORK_NAME } from "../constants/network";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/activity", label: "Activity" },
  { href: "/stats", label: "Stats" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-ink-900/70 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo className="h-7 w-7" />
          <span className="text-[15px] font-bold tracking-tight text-white">PerkOS</span>
          <span className="hidden text-[15px] font-medium text-mist-500 sm:inline">Agentic Commerce</span>
          <span className="rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300">
            {NETWORK_NAME}
          </span>
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

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search"
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition hover:border-white/30 hover:text-white sm:flex"
          >
            <Search className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/PerkOS-xyz/Stacks-Agentic-Commerce"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition hover:border-white/30 hover:text-white sm:flex"
          >
            <GithubMark className="h-4 w-4" />
          </a>
          <WalletConnect />
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-mist-300 transition hover:text-white md:hidden"
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
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
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
