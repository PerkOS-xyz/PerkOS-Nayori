export const appName = 'Nayori — PerkOS Stacks Agentic Commerce';
export const siteOrigin = process.env.NAYORI_DOCS_ORIGIN ?? 'https://docs.nayori.ai';
export const docsRoute = '/';
export const docsImageRoute = '/og';
export const docsContentRoute = '/llms.mdx';

// fill this with your actual GitHub info, for example:
export const gitConfig = {
  user: 'PerkOS-xyz',
  repo: 'PerkOS-Nayori',
  branch: 'main',
};

export const productLinks = {
  app: process.env.NAYORI_APP_ORIGIN ?? 'https://app.nayori.ai',
  evidence: `${process.env.NAYORI_PRODUCT_ORIGIN ?? 'https://nayori.ai'}/evidence`,
  sdk: 'https://www.npmjs.com/package/@perkos/agent-sdk',
  api: process.env.NAYORI_API_ORIGIN ?? 'https://api.nayori.ai',
} as const;
