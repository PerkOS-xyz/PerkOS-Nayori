'use client';

import { useEffect, useState } from "react";
import { connect, request } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { BadgeCheck, Fingerprint, KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { NAYORI_OAUTH_ORIGIN } from "../../../constants/oauth-discovery";
import { selectStxAddressForNetwork } from "../../../services/wallet";

type ClaimPayload = {
  registrationId: string;
  challengeId: string;
  userCode: string;
  expiresAt: string;
  network: "testnet" | "mainnet";
  domain: { name: "Nayori Agent Claim"; version: "1"; chainId: number };
  message: { action: "claim-agent"; origin: string; registrationId: string;
    challengeId: string; userCode: string; expiresAt: number };
};

type PreparedClaim = { status: "pending" | "claimed"; claim: ClaimPayload; wallet_address?: string };

const claimTokenPattern = /^ny_ct_[A-Za-z0-9_-]{43}$/;
const codePattern = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function claimClarity(claim: ClaimPayload) {
  return {
    domain: Cl.tuple({ name: Cl.stringAscii(claim.domain.name),
      version: Cl.stringAscii(claim.domain.version), "chain-id": Cl.uint(claim.domain.chainId) }),
    message: Cl.tuple({ action: Cl.stringAscii(claim.message.action),
      origin: Cl.stringAscii(claim.message.origin),
      "registration-id": Cl.stringAscii(claim.message.registrationId),
      "challenge-id": Cl.stringAscii(claim.message.challengeId),
      "user-code": Cl.stringAscii(claim.message.userCode),
      "expires-at": Cl.uint(claim.message.expiresAt) }),
  };
}

async function jsonRequest<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${NAYORI_OAUTH_ORIGIN}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const value = await response.json() as { message?: string; error_description?: string } & T;
  if (!response.ok) throw new Error(value.message ?? value.error_description ?? "The claim request failed.");
  return value;
}

export default function AgentClaimClient() {
  const [claimToken, setClaimToken] = useState("");
  const [userCode, setUserCode] = useState("");
  const [prepared, setPrepared] = useState<PreparedClaim | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "signing" | "claimed">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (claimTokenPattern.test(fragment)) {
      setClaimToken(fragment);
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      setError("This claim link is missing a valid one-time token. Ask the agent to create a new registration.");
    }
  }, []);

  async function loadClaim(event: React.FormEvent) {
    event.preventDefault();
    const normalizedCode = userCode.trim().toUpperCase();
    if (!claimTokenPattern.test(claimToken) || !codePattern.test(normalizedCode)) {
      setError("Enter the eight-character code shown by the agent, including the hyphen.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const result = await jsonRequest<PreparedClaim>("/agent/identity/claim", {
        claim_token: claimToken, user_code: normalizedCode,
      });
      setPrepared(result);
      if (result.status === "claimed") setStatus("claimed");
      else setStatus("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The claim could not be loaded.");
      setStatus("idle");
    }
  }

  async function signAndClaim() {
    if (!prepared || prepared.status !== "pending") return;
    setStatus("signing");
    setError("");
    try {
      const connected = await connect({ network: prepared.claim.network });
      const walletAddress = selectStxAddressForNetwork(connected.addresses, prepared.claim.network);
      if (!walletAddress) throw new Error(`Leather did not return a Stacks ${prepared.claim.network} address.`);
      const signed = await request("stx_signStructuredMessage", claimClarity(prepared.claim));
      if (!signed.signature || !signed.publicKey) throw new Error("Leather did not return the claim signature and public key.");
      const result = await jsonRequest<{ status: "claimed"; wallet_address: string }>(
        "/agent/identity/claim/complete",
        { claim_token: claimToken, user_code: prepared.claim.userCode,
          challenge_id: prepared.claim.challengeId, wallet_address: walletAddress,
          signature: signed.signature, public_key: signed.publicKey }
      );
      setPrepared({ ...prepared, status: result.status, wallet_address: result.wallet_address });
      setStatus("claimed");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Leather could not complete the claim.";
      if (!/cancel|reject/i.test(message)) setError(message);
      setStatus("idle");
    }
  }

  if (status === "claimed") {
    return (
      <section className="card p-7" aria-live="polite">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <BadgeCheck className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Agent claimed</h2>
        <p className="mt-2 text-mist-300">
          Wallet ownership is verified. The agent can now poll its claim token for a refreshed credential.
          Its authorization remains limited to <code className="text-emerald-300">agent:self</code>.
        </p>
        {prepared?.wallet_address && <p className="mt-4 break-all font-mono text-xs text-mist-500">{prepared.wallet_address}</p>}
      </section>
    );
  }

  return (
    <section className="card p-7">
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ icon: KeyRound, title: "One-time link", text: "The URL token stays out of server logs." },
          { icon: Fingerprint, title: "SIP-018 proof", text: "The signature binds this exact claim." },
          { icon: ShieldCheck, title: "Least privilege", text: "Only agent:self is available." }].map((item) => (
          <div key={item.title} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <item.icon className="h-4 w-4 text-brand-300" />
            <p className="mt-2 text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-mist-500">{item.text}</p>
          </div>
        ))}
      </div>

      {!prepared && (
        <form onSubmit={loadClaim} className="mt-6">
          <label htmlFor="agent-claim-code" className="label">Code shown by the agent</label>
          <input id="agent-claim-code" className="field font-mono uppercase tracking-[0.18em]"
            value={userCode} onChange={(event) => setUserCode(event.target.value.toUpperCase())}
            placeholder="ABCD-EFGH" autoComplete="one-time-code" maxLength={9} required />
          <button type="submit" className="btn-primary mt-4 w-full" disabled={status === "loading" || !claimToken}>
            {status === "loading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying code…</> : "Review wallet claim"}
          </button>
        </form>
      )}

      {prepared?.status === "pending" && (
        <div className="mt-6 rounded-xl border border-brand/25 bg-brand/[0.06] p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-300">Ready to sign</p>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-mist-500">Registration</dt><dd className="font-mono text-xs">{prepared.claim.registrationId}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-mist-500">Network</dt><dd className="capitalize">Stacks {prepared.claim.network}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-mist-500">Scope after claim</dt><dd><code>agent:self</code></dd></div>
          </dl>
          <button type="button" onClick={signAndClaim} className="btn-primary mt-5 w-full" disabled={status === "signing"}>
            {status === "signing" ? <><Loader2 className="h-4 w-4 animate-spin" /> Waiting for Leather…</> : <><Wallet className="h-4 w-4" /> Sign with Leather</>}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      <p className="mt-5 text-xs leading-relaxed text-mist-500">
        Never enter a seed phrase or private key. Leather should show a structured message, not a token transfer or contract call.
      </p>
    </section>
  );
}
