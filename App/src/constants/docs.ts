/** Release routing is independent from wallet state or untrusted URL parameters. */
export function docsOriginForRelease(channel?: string, network?: string): string {
  return channel === "qa" && network === "testnet"
    ? "https://docs.qa.nayori.ai"
    : "https://docs.nayori.ai";
}

export const DOCS_ORIGIN = docsOriginForRelease(
  process.env.NEXT_PUBLIC_RELEASE_CHANNEL,
  process.env.NEXT_PUBLIC_STACKS_NETWORK,
);
