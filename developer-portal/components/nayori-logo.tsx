import Image from 'next/image';

export function NayoriLogo({ className = 'size-7' }: { className?: string }) {
  return (
    <Image
      src="/brand/Logo.png"
      alt="Nayori"
      width={1254}
      height={1254}
      sizes="28px"
      priority
      unoptimized
      className={`rounded-full border border-[#FC6432]/40 object-cover shadow-[0_0_16px_rgba(252,100,50,0.2)] ${className}`}
    />
  );
}

export function PerkOSLogo({ className = 'size-5' }: { className?: string }) {
  return (
    <Image
      src="/brand/PerkOS.png"
      alt=""
      width={1254}
      height={1254}
      sizes="20px"
      unoptimized
      className={`rounded object-cover ${className}`}
    />
  );
}
