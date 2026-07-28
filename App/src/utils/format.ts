// STX <-> micro-STX helpers. The contracts deal in micro-STX (1 STX = 1_000_000 uSTX);
// the UI should speak STX to humans.
const MICRO = 1_000_000;

export function formatStx(micro: number | bigint, maxDp = 6): string {
  const v = Number(micro) / MICRO;
  return v.toLocaleString(undefined, { maximumFractionDigits: maxDp });
}

export function stxToMicro(stx: string | number): number {
  return Math.round(Number(stx) * MICRO);
}

export function microToStx(micro: number | bigint): number {
  return Number(micro) / MICRO;
}

export const shortAddr = (a: string) => (a ? `${a.slice(0, 5)}…${a.slice(-4)}` : "");
