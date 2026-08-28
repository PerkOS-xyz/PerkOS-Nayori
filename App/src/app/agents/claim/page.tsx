import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AgentClaimClient from "./AgentClaimClient";

export const metadata: Metadata = {
  title: "Claim an agent | Nayori",
  description: "Bind an anonymous Nayori agent registration to a Stacks wallet with Leather.",
  robots: { index: false, follow: false },
};

export default function AgentClaimPage() {
  return (
    <div className="container-x py-12">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>
      <div className="mx-auto mt-8 max-w-2xl">
        <div className="mb-6">
          <span className="kicker">Wallet ownership</span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Claim a Nayori agent</h1>
          <p className="mt-2 text-mist-300">
            Verify the code supplied by the agent, then sign a structured SIP-018 message in Leather.
            This proves wallet control without granting payment or merchant permissions.
          </p>
        </div>
        <AgentClaimClient />
      </div>
    </div>
  );
}
