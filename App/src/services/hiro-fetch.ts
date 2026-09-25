/**
 * fetch for Hiro's API with the server's API key, when the deployment has one (`HIRO_API_KEY`,
 * server-side only, never NEXT_PUBLIC). Without a key it is plain fetch: the browser bundle and
 * unkeyed deployments behave exactly as before. A key raises Hiro's per-minute quota, which the
 * transparency snapshot (dozens of read-only calls) otherwise exhausts under modest traffic.
 */
export function hiroApiKey(): string | undefined {
  const key = typeof process !== "undefined" ? process.env.HIRO_API_KEY?.trim() : undefined;
  return key || undefined;
}

export const hiroFetch: typeof fetch = (input, init) => {
  const key = hiroApiKey();
  if (!key) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-api-key", key);
  return fetch(input, { ...init, headers });
};
