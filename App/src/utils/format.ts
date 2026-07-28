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

// sBTC is denominated in sats, mirroring Bitcoin: 1 sBTC = 100_000_000 sats.
const SATS = 100_000_000;

export function formatSbtc(sats: number | bigint, maxDp = 8): string {
  const v = Number(sats) / SATS;
  return v.toLocaleString(undefined, { maximumFractionDigits: maxDp });
}

export function sbtcToSats(sbtc: string | number): number {
  return Math.round(Number(sbtc) * SATS);
}

/** Compact display for small amounts, where sats read better than a long decimal. */
export function formatSbtcCompact(sats: number | bigint): string {
  const n = Number(sats);
  return n > 0 && n < 100_000 ? `${n.toLocaleString()} sats` : `${formatSbtc(n)} sBTC`;
}
