import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/Header";
import Logo from "../components/Logo";
import { ToastProvider } from "../components/Toast";
import {
  COMPANY_NAME,
  PRODUCT_DESCRIPTION,
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
  PRODUCT_TITLE,
} from "../constants/brand";
import { SITE_ORIGIN } from "../constants/site";

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <ToastProvider>
          <Header />
          <main>{children}</main>
          <footer className="mt-28 border-t border-white/[0.08]">
            <div className="container-x flex flex-col items-center justify-between gap-4 py-8 text-sm text-mist-500 sm:flex-row">
              <div className="flex items-center gap-2.5">
                <Logo className="h-5 w-5" />
                <span className="font-medium text-mist-300">{PRODUCT_FULL_NAME}</span>
              </div>
              <span>Built on Stacks · Settled on Bitcoin · © 2026</span>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
