import { EXPLORER, CHAIN_PARAM } from "../services/onchain-stats";
import { shortAddr } from "../utils/format";

// A wallet/contract principal rendered as a short, explorer-linked monospace chip.
export default function Addr({ value, className = "" }: { value?: string | null; className?: string }) {
  if (!value) return <span className={`text-mist-500 ${className}`}>Not set</span>;
  return (
    <a
      href={`${EXPLORER}/address/${value}?chain=${CHAIN_PARAM}`}
      target="_blank"
      rel="noopener noreferrer"
      title={value}
      className={`font-mono transition hover:text-brand-300 ${className}`}
    >
      {shortAddr(value)}
    </a>
  );
}
