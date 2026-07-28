import "./globals.css";
import Header from "../components/Header";
import Logo from "../components/Logo";
import { ToastProvider } from "../components/Toast";

const TITLE = "PerkOS: Agentic Commerce on Bitcoin";
const DESC =
  "The trust and payments layer for AI agents on Bitcoin. On-chain agent identity, job escrow, reputation and validation. Live on Stacks mainnet.";

export const metadata = {
  metadataBase: new URL("https://stacks.perkos.xyz"),
  title: TITLE,
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "https://stacks.perkos.xyz",
    siteName: "PerkOS Agentic Commerce",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
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
              <span className="font-medium text-mist-300">PerkOS Agentic Commerce</span>
            </div>
            <span>Built on Stacks · Settled on Bitcoin · © 2026</span>
          </div>
        </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
