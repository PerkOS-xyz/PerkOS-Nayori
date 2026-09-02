import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { appName, siteOrigin } from '@/lib/shared';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: appName,
    template: '%s · Nayori Docs',
  },
  description:
    'Build Bitcoin-native agent commerce with Nayori, the PerkOS Agent SDK, Stacks escrow, x402, MPP, OAuth and MCP.',
  applicationName: appName,
  alternates: { canonical: '/' },
  openGraph: {
    title: appName,
    description: 'Developer guides, API reference and security boundaries for Nayori — PerkOS Stacks Agentic Commerce.',
    type: 'website',
    url: siteOrigin,
    siteName: appName,
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          search={{ enabled: true }}
          theme={{ enabled: true, defaultTheme: 'dark' }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
