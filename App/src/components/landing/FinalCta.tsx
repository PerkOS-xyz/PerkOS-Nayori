'use client';

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { m, useScroll, useTransform, useReducedMotion } from "motion/react";
import { useMounted } from "./useMounted";
import { HERO_BLUR_DATA_URL } from "./heroBlur";

/**
 * The ending of the page, and the second half of Peak-End: the same art as the
 * hero, cropped close, so the last thing seen is the brand at full strength.
 *
 * The copy is server-rendered and visible before any of this runs; the art
 * layer only drifts against the scroll.
 */
export default function FinalCta() {
  const sectionRef = useRef<HTMLElement>(null);
  const mounted = useMounted();
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const artY = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);
  const artScale = useTransform(scrollYProgress, [0, 1], [1.14, 1.24]);

  const animate = mounted && !reduced;

  return (
    <section ref={sectionRef} className="relative mt-f7 overflow-hidden">
      <div className="relative min-h-[520px] w-full">
        <m.div
          className="absolute inset-0"
          style={animate ? { y: artY, scale: artScale } : undefined}
        >
          <Image
            src="/brand/Banner-Web.webp"
            alt=""
            fill
            unoptimized
            sizes="100vw"
            placeholder="blur"
            blurDataURL={HERO_BLUR_DATA_URL}
            className="scale-110 object-cover object-[78%_28%]"
          />
        </m.div>

        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,#070706_0%,rgba(7,7,6,0.72)_34%,rgba(7,7,6,0.88)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(40rem_24rem_at_22%_50%,rgba(255,138,30,0.14),transparent_60%)]"
        />

        <div className="container-x relative flex min-h-[520px] flex-col justify-center py-f6">
          <div className="max-w-xl" data-nayori-reveal>
            <h2 className="text-display font-bold text-white">
              Give your agent an identity worth paying.
            </h2>
            <p className="mt-f3 max-w-lg text-body text-mist-200">
              Registration is on-chain and public. From there it can be hired, escrowed,
              evaluated and carry the record with it.
            </p>
            <div className="mt-f4 flex flex-wrap items-center gap-f2">
              <Link href="/agents" className="btn-primary nayori-primary-glow px-5 py-3 text-[15px]">
                Register your agent <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/jobs"
                className="btn-ghost border-white/15 bg-black/30 px-5 py-3 text-[15px] backdrop-blur-sm"
              >
                Browse open jobs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
