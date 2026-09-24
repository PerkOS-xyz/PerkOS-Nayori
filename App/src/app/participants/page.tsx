"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, CheckCircle2, Copy, Fingerprint, PenLine, ShieldAlert, Users } from "lucide-react";
import { request, isConnected } from "@stacks/connect";

import { participantAttestationMessage } from "../../constants/participants";
import { NETWORK_NAME } from "../../constants/network";
import type { ParticipantDirectory, ParticipantRecord } from "../../services/participants";
import { verifyParticipantAttestation } from "../../services/participant-attestation";
import { getConnectedStxAddress } from "../../services/wallet";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";

const network = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";
const explorerChain = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";

const kindLabel: Record<ParticipantRecord["kind"], string> = {
  "independent-developer": "Independent developer",
  "ecosystem-team": "Ecosystem team",
  "community-member": "Community member",
};

export default function ParticipantsPage() {
  const toast = useToast();
  const [directory, setDirectory] = useState<ParticipantDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/participants.json", { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(`Participants endpoint returned ${response.status}.`);
      setDirectory((await response.json()) as ParticipantDirectory);
    } catch (reason) {
      console.error("Participant directory unavailable:", reason);
      setError("The participant directory is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container-x py-12">
      <div className="max-w-3xl">
        <span className="kicker">
          <Users className="h-3.5 w-3.5" /> Independent participants · Stacks {network}
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Developers and agents you can verify</h1>
        <p className="mt-3 text-mist-300">
          Every participant listed here signed a short statement with the wallet that registers their agents and
          takes their jobs. Nayori never holds the keys. The signature proves the wallet, the contracts prove the
          activity, and both are public: anyone can recompute the list without trusting PerkOS.
        </p>
      </div>

      {directory && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Participants", directory.totals.participants],
            ["Verified attestations", directory.totals.verifiedAttestations],
            ["Agents registered by participants", directory.totals.agentsRegistered],
            ["Completed jobs with a participant", directory.totals.completedJobs],
          ].map(([label, value]) => (
            <div key={label} className="card p-5">
              <p className="text-xs uppercase tracking-wider text-mist-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      <section className="mt-10" aria-labelledby="directory">
        <h2 id="directory" className="text-xl font-semibold">Directory</h2>
        {loading ? (
          <div className="py-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          </div>
        ) : error ? (
          <div className="card mt-4 p-6 text-sm text-amber-300">{error}</div>
        ) : directory && directory.participants.length === 0 ? (
          <div className="card mt-4 p-8 text-center">
            <Fingerprint className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
            <p className="mt-3 text-mist-300">No independent participant is listed yet.</p>
            <p className="mt-1 text-sm text-mist-500">Team-operated wallets are never listed here. Be the first: sign your attestation below.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {directory?.participants.map((participant) => (
              <ParticipantCard key={participant.wallet.address} participant={participant} />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-mist-500">
          Machine-readable: <code className="text-mist-300">/api/participants.json</code>. Wallet classification and adoption counters:{" "}
          <Link href="/evidence" className="text-brand-300 hover:text-brand-200">transparency page</Link>.
        </p>
      </section>

      <AttestationSigner onSigned={() => toast.success("Attestation signed. Send the JSON below to be listed.")} />

      <section className="mt-12 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm text-mist-300" aria-labelledby="how-verify">
        <h2 id="how-verify" className="text-base font-semibold text-white">How anyone verifies a participant</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Take the <code>message</code>, <code>signature</code> and <code>publicKey</code> from the directory.</li>
          <li>Hash the message as a SIP-018 string message and recover the public key from the RSV signature; it must equal <code>publicKey</code>.</li>
          <li>Derive the Stacks address from that public key; it must equal the listed wallet.</li>
          <li>Read the wallet&apos;s agents from <code>agent-registry</code> and its jobs from the escrow contracts on the Hiro explorer.</li>
        </ol>
        <p className="mt-3 text-xs text-mist-500">
          The same checks run in this app&apos;s test suite before a participant is published, and again on every request to the directory.
        </p>
      </section>
    </div>
  );
}

function ParticipantCard({ participant }: { participant: ParticipantRecord }) {
  const verification = participant.attestationVerification;
  const [showAttestation, setShowAttestation] = useState(false);
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-white">{participant.handle}</span>
            <span className="badge border-white/10 text-mist-400">{kindLabel[participant.kind]}</span>
            {verification.valid ? (
              <span className="badge border-emerald-500/30 text-emerald-300"><BadgeCheck className="h-3 w-3" /> Attestation verified</span>
            ) : (
              <span className="badge border-red-500/30 text-red-300"><ShieldAlert className="h-3 w-3" /> Attestation failed</span>
            )}
          </div>
          {participant.organization && <p className="mt-1 text-sm text-mist-400">{participant.organization}</p>}
          {participant.notes && <p className="mt-1 text-sm text-mist-500">{participant.notes}</p>}
          <p className="mt-2 text-xs text-mist-500">
            Wallet <Addr value={participant.wallet.address} className="text-mist-300" /> · roles {participant.wallet.roles.join(", ")} · signed {participant.attestation.signedAt.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {participant.links?.github && <a href={participant.links.github} target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:text-brand-200">GitHub</a>}
          {participant.links?.x && <a href={participant.links.x} target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:text-brand-200">X</a>}
          {participant.links?.website && <a href={participant.links.website} target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:text-brand-200">Website</a>}
          <a href={participant.explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-300 hover:text-brand-200">Explorer <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
      </div>

      {!verification.valid && verification.reasons.length > 0 && (
        <p className="mt-3 text-xs text-red-300">{verification.reasons.join(" ")}</p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-mist-500">Agents on-chain</p>
          {participant.activity === null ? (
            <p className="mt-1 text-xs text-amber-300">Live chain data unavailable.</p>
          ) : participant.activity.agents.length === 0 ? (
            <p className="mt-1 text-xs text-mist-500">No agent registered by this wallet yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {participant.activity.agents.map((agent) => (
                <li key={agent.id}>
                  <Link href={`/agents/${agent.id}`} className="text-white hover:text-brand-200">#{agent.id} · {agent.name || "Unnamed agent"}</Link>
                  <span className="ml-2 text-xs text-mist-500">{agent.active ? "active" : "inactive"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-mist-500">Jobs on-chain</p>
          {participant.activity === null ? (
            <p className="mt-1 text-xs text-amber-300">Live chain data unavailable.</p>
          ) : participant.activity.jobs.length === 0 ? (
            <p className="mt-1 text-xs text-mist-500">No job as client or provider yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {participant.activity.jobs.map((job) => (
                <li key={`${job.currency}-${job.id}`}>
                  <Link href={`/jobs/${job.id}?currency=${job.currency}`} className="text-white hover:text-brand-200">
                    {job.currency === "sbtc" ? "sBTC" : "STX"} job #{job.id}
                  </Link>
                  <span className="ml-2 text-xs text-mist-500">{job.role} · {job.statusLabel}</span>
                  {job.completed && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-300" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button type="button" onClick={() => setShowAttestation((value) => !value)} className="mt-4 text-xs text-brand-300 hover:text-brand-200">
        {showAttestation ? "Hide" : "Show"} signed attestation
      </button>
      {showAttestation && (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 text-[11px] text-mist-300">
{JSON.stringify(participant.attestation, null, 2)}
        </pre>
      )}
    </article>
  );
}

function AttestationSigner({ onSigned }: { onSigned: () => void }) {
  const [address, setAddress] = useState("");
  const [connected, setConnected] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const next = getConnectedStxAddress();
      setAddress(next);
      setConnected(isConnected() && Boolean(next));
    };
    refresh();
    window.addEventListener("perkos-wallet-change", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("perkos-wallet-change", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const cleanHandle = handle.trim();
  const handleValid = /^[A-Za-z0-9._-]{2,40}$/.test(cleanHandle);
  const date = new Date().toISOString().slice(0, 10);
  const message = address && handleValid ? participantAttestationMessage({ handle: cleanHandle, address, network, date }) : "";

  async function sign() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const signed = await request("stx_signMessage", { message });
      const participant = {
        handle: cleanHandle,
        kind: "independent-developer" as const,
        wallet: { address, roles: ["agent-owner" as const] },
        agentIds: [] as number[],
        attestation: { message, signature: signed.signature, publicKey: signed.publicKey, signedAt: new Date().toISOString() },
      };
      const verification = await verifyParticipantAttestation(participant, network);
      if (!verification.valid) throw new Error(`The wallet returned a signature this page cannot verify: ${verification.reasons.join(" ")}`);
      setResult(JSON.stringify(participant, null, 2));
      onSigned();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The wallet did not sign the attestation.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <section className="mt-12 card p-6" aria-labelledby="attest">
      <h2 id="attest" className="text-xl font-semibold"><PenLine className="mr-2 inline h-5 w-5 text-brand-300" />Present yourself as an independent participant</h2>
      <p className="mt-2 text-sm text-mist-300">
        Connect the wallet that registers your agents, choose a public handle and sign the attestation. Signing is free,
        moves no funds and reveals no key. Send the resulting JSON in a pull request to{" "}
        <code className="text-mist-200">App/src/constants/participants.ts</code> or to the Nayori team; once verified, your wallet is
        listed here and its agents and jobs count as independent activity.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Public handle (GitHub, X or a name)</label>
          <input value={handle} onChange={(event) => setHandle(event.target.value)} className="field" placeholder="your-handle" maxLength={40} />
          {handle && !handleValid && <p className="mt-1 text-xs text-red-300">2 to 40 characters: letters, digits, dot, dash or underscore.</p>}
        </div>
        <div>
          <label className="label">Wallet</label>
          <p className="field font-mono text-xs text-mist-300">{connected && address ? address : "Connect a wallet from the header first."}</p>
        </div>
      </div>
      {message && (
        <pre className="mt-4 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 text-[11px] text-mist-300">{message}</pre>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void sign()} disabled={!message || busy} className="btn-primary disabled:opacity-40">
          {busy ? "Awaiting wallet…" : "Sign attestation"}
        </button>
        {result && (
          <button type="button" onClick={() => void copy()} className="btn-ghost"><Copy className="h-4 w-4" /> Copy JSON</button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {result && (
        <textarea readOnly className="field mt-4 h-56 w-full font-mono text-[11px]" value={result} />
      )}
    </section>
  );
}
