import Image from 'next/image';

export function BrandBanner() {
  return (
    <figure className="not-prose my-8 overflow-hidden rounded-2xl border border-[#FC6432]/30 bg-black shadow-[0_24px_80px_rgba(252,100,50,0.14)]">
      <Image
        src="/brand/Banner.png"
        alt="Nayori by PerkOS, the navigator and neutral coordinator of verifiable commerce on Stacks"
        width={1983}
        height={793}
        sizes="(max-width: 768px) 100vw, 960px"
        priority
        unoptimized
        className="h-auto w-full"
      />
      <figcaption className="sr-only">
        Nayori registers identities, enables discovery, coordinates commerce, verifies evidence and
        records reputation on Stacks.
      </figcaption>
    </figure>
  );
}
