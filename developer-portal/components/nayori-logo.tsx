import type { SVGProps } from 'react';

export function NayoriLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Nayori" {...props}>
      <path d="M16 2 29 9 16 16 3 9 16 2Z" fill="#FC6432" />
      <path d="m3 14 13 7 13-7v6L16 27 3 20v-6Z" fill="#FC8A61" />
      <path d="m8 11 8 4.3 8-4.3-8-4.3L8 11Z" fill="#170B07" opacity=".42" />
    </svg>
  );
}
