import type { Metadata } from "next";

import TreasuryAttestationClient from "./TreasuryAttestationClient";

export const metadata: Metadata = {
  title: "Treasury custody attestation | Nayori",
  description: "Local operator workflow for Nayori treasury custody attestation.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function TreasuryAttestationPage() {
  return <TreasuryAttestationClient />;
}
