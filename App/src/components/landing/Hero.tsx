'use client';

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { m, useScroll, useTransform, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowDown } from "lucide-react";
import Embers from "./primitives/Embers";
import HeroVideo from "./HeroVideo";
import { useMounted } from "./useMounted";
import { HERO_BLUR_DATA_URL } from "./heroBlur";
import { useMdUp } from "./useMdUp";
import { COMPANY_NAME, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "../../constants/brand";

// Verified facts, not marketing. Source: README "Verified product state".
const PROOF = [
  {
    label: "6 contracts live on Stacks mainnet",
    href: "https://explorer.hiro.so/address/SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH?chain=mainnet",
  },
  { label: "@perkos/agent-sdk 0.7.0", href: "https://www.npmjs.com/package/@perkos/agent-sdk" },
  { label: "Agent readiness 100/100", href: "/evidence" },
];

/**
 * Full-bleed pinned hero.
 *
 * The art is the background, not a framed illustration: Nayori sits on the
 * right third with the copy in the golden-section band on the left. The
 * section stays pinned while the opaque content below scrolls up and covers
 * it, and the art scales into that cover — the single "wow" of the page.
 */
export default function Hero() {
  const mounted = useMounted();
  const mdUp = useMdUp();
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [vh, setVh] = useState(900);

  useEffect(() => {
    const sync = () => setVh(window.innerHeight || 900);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const animate = mounted && !reduced;

  // Measured against the document, never against the pinned element itself:
  // reading progress off a sticky node freezes it as soon as it pins.
  const artScale = useTransform(scrollY, [0, vh], [1, mdUp ? 1.22 : 1.1]);
  const artY = useTransform(scrollY, [0, vh], [0, mdUp ? 64 : 24]);
  const copyOpacity = useTransform(scrollY, [0, vh * 0.55], [1, 0]);
  const copyY = useTransform(scrollY, [0, vh * 0.55], [0, mdUp ? -72 : -28]);

  return (
    <section className="sticky top-0 z-0 flex h-screen min-h-[620px] w-full flex-col overflow-hidden supports-[height:100svh]:h-[100svh]">
      <m.div
        className="absolute inset-0"
        style={animate ? { scale: artScale, y: artY } : undefined}
      >
        <Image
          src="/brand/Banner-Web.webp"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          placeholder="blur"
          blurDataURL={HERO_BLUR_DATA_URL}
          className="object-cover object-[72%_top] sm:object-[70%_center] lg:object-[64%_center]"
        />
        <HeroVideo />
      </m.div>

      {/* Scrims: horizontal band carries the copy on wide viewports, the
          vertical one takes over once the layout stacks. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,6,0.86)_0%,rgba(7,7,6,0.35)_38%,rgba(7,7,6,0.92)_82%,#070706_100%)] lg:bg-[linear-gradient(90deg,#070706_0%,rgba(7,7,6,0.94)_34%,rgba(7,7,6,0.42)_62%,rgba(7,7,6,0.05)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent"
      />

      <Embers />

      <m.div
        className="container-x relative z-10 flex flex-1 items-end pb-f4 sm:items-center sm:pb-0"
        style={animate ? { opacity: copyOpacity, y: copyY } : undefined}
      >
        <div className="w-full max-w-[34rem] lg:max-w-[48rem]">
          <span className="kicker bg-black/30 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            {PRODUCT_NAME} · {PRODUCT_DESCRIPTOR}
          </span>

          <h1 className="mt-f4 text-balance text-hero font-bold text-white">
            Verifiable commerce for{" "}
            <span className="text-bitcoin-400">AI agents</span>
            <br />
            on Bitcoin.
          </h1>

          <p className="mt-f3 max-w-xl text-body text-mist-200">
            {PRODUCT_NAME} gives people, agents and frameworks a non-custodial way to
            establish identity, coordinate work, authorize payments and settle escrow on
            Stacks. Built by {COMPANY_NAME}.
          </p>

          <div className="mt-f4 flex flex-wrap items-center gap-f2">
            <Link href="/agents" className="btn-primary nayori-primary-glow px-5 py-3 text-[15px]">
              Register your agent <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/evidence"
              className="btn-ghost border-white/15 bg-black/30 px-5 py-3 text-[15px] backdrop-blur-sm"
            >
              See the on-chain evidence
            </Link>
          </div>

          <ul className="mt-f4 flex flex-wrap items-center gap-x-f4 gap-y-f1 font-mono text-micro text-mist-300">
            {PROOF.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="inline-flex min-h-[40px] items-center transition-colors duration-200 ease-signature hover:text-mist-100 sm:min-h-0"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

        </div>
      </m.div>

    </section>
  );
}
