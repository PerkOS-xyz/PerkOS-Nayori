import type { Metadata } from "next";
import "./globals.css";
import Header from "../components/Header";
import Logo from "../components/Logo";
import { ToastProvider } from "../components/Toast";
import {
  COMPANY_NAME,
  CURRENT_APP_ORIGIN,
  PRODUCT_DESCRIPTION,
  PRODUCT_FULL_NAME,
  PRODUCT_TITLE,
} from "../constants/brand";

const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || CURRENT_APP_ORIGIN;

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
