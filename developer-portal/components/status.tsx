import type { ReactNode } from 'react';

type StatusTone = 'mainnet' | 'testnet' | 'public' | 'restricted' | 'planned';

const styles: Record<StatusTone, string> = {
  mainnet: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  testnet: 'border-brand/35 bg-brand/10 text-[#c43e12] dark:text-[#ffad91]',
  public: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  restricted: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  planned: 'border-fd-border bg-fd-muted text-fd-muted-foreground',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusRow({ children }: { children: ReactNode }) {
  return <div className="not-prose mb-6 flex flex-wrap gap-2">{children}</div>;
}
