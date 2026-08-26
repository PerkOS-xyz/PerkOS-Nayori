import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "../constants/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/chainhook",
      },
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "PerplexityBot",
        ],
        allow: "/",
        disallow: "/api/chainhook",
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
