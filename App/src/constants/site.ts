import { CURRENT_APP_ORIGIN } from "./brand";

export function resolveSiteOrigin(value?: string): string {
  const configured = value?.trim() || CURRENT_APP_ORIGIN;
  const url = new URL(configured);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development");
  }

  return url.origin;
}

export const SITE_ORIGIN = resolveSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
