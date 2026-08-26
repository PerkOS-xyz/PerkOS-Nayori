import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "../constants/site";

const routes = [
  "",
  "/agents",
  "/jobs",
  "/dashboard",
  "/analytics",
  "/activity",
  "/search",
  "/stats",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${SITE_ORIGIN}${route}`,
    changeFrequency: route === "" ? "weekly" : "daily",
    priority: route === "" ? 1 : 0.8,
  }));
}
