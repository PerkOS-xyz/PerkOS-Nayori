import Image from "next/image";

export function GithubMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.7.5.5 5.7.5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-1.8c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17 4.4 18 4.7 18 4.7c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

export default function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <Image
      src="/brand/Logo.png"
      alt="Nayori"
      width={1254}
      height={1254}
      sizes="36px"
      priority
      unoptimized
      className={`rounded-full border border-brand-300/35 object-cover shadow-[0_0_18px_rgba(252,100,50,0.22)] ${className}`}
    />
  );
}

export function PerkOSMark({ className = "h-5 w-5" }: { className?: string }) {
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
