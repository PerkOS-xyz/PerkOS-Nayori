import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { ToastProvider } from "../components/Toast";
import WebMcpProvider from "../components/WebMcpProvider";
import {
  COMPANY_NAME,
  PRODUCT_DESCRIPTION,
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
  PRODUCT_TITLE,
} from "../constants/brand";
import { SITE_ORIGIN } from "../constants/site";
import { webMcpBootstrapScript } from "../constants/webmcp";

const siteOrigin = SITE_ORIGIN;

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: PRODUCT_FULL_NAME,
  alternateName: PRODUCT_NAME,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: siteOrigin,
  description: PRODUCT_DESCRIPTION,
  provider: {
    "@type": "Organization",
    name: COMPANY_NAME,
    url: "https://perkos.xyz",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: PRODUCT_FULL_NAME,
  title: PRODUCT_TITLE,
  description: PRODUCT_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: PRODUCT_TITLE,
    description: PRODUCT_DESCRIPTION,
    url: siteOrigin,
    siteName: PRODUCT_FULL_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_TITLE,
    description: PRODUCT_DESCRIPTION,
  },
  creator: COMPANY_NAME,
  publisher: COMPANY_NAME,
  other: {
    "talentapp:project_verification":
      "1a285110d8754ae950cf96a157356f89a3f28a8b6698d320fcef87d8e951815ce61246289b8010efaa4cab5d1bde96062c1c9e425df5b828e57deef9f881b328",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="alternate"
          type="text/markdown"
          href="/llms.txt"
          title={`${PRODUCT_NAME} for language models`}
        />
        <link
          rel="alternate"
          type="application/json"
          href="/.well-known/agent.json"
          title={`${PRODUCT_NAME} agent discovery manifest`}
        />
        <link
          rel="authorization-server"
          type="application/json"
          href="/.well-known/oauth-authorization-server"
        />
        <link
          rel="mcp"
          type="application/json"
          href="/.well-known/mcp/server-card.json"
        />
        <link
          rel="ard"
          type="application/json"
          href="/.well-known/ard.json"
          title={`${PRODUCT_NAME} agentic resource catalog`}
        />
        <link
          rel="ai-catalog"
          type="application/json"
          href="/.well-known/ai-catalog.json"
          title={`${PRODUCT_NAME} agentic resource catalog (legacy relation)`}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <script
          id="webmcp-bootstrap"
          dangerouslySetInnerHTML={{ __html: webMcpBootstrapScript() }}
        />
        <WebMcpProvider />
        <ToastProvider>
          <Header />
          <main>{children}</main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
