"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, CheckCircle2, Copy, Fingerprint, PenLine, Search, ShieldAlert, Users } from "lucide-react";
import { request, isConnected } from "@stacks/connect";

import { participantAttestationMessage } from "../../constants/participants";
import { NETWORK_NAME } from "../../constants/network";
import type { ParticipantDirectory, ParticipantRecord } from "../../services/participants";
import type { ParticipantKind, ParticipantRole } from "../../constants/participants";
import { verifyParticipantAttestation } from "../../services/participant-attestation";
import { getConnectedStxAddress } from "../../services/wallet";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";

const network = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";
const explorerChain = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";

const KINDS: { value: ParticipantKind; label: string }[] = [
  { value: "independent-developer", label: "Independent developer" },
  { value: "ecosystem-team", label: "Ecosystem team" },
  { value: "community-member", label: "Community member" },
];
const ROLES: { value: ParticipantRole; label: string; hint: string }[] = [
  { value: "agent-owner", label: "Agent owner", hint: "registers agents in agent-registry" },
  { value: "provider", label: "Provider", hint: "takes jobs and delivers" },
  { value: "client", label: "Client", hint: "posts and funds jobs" },
];
const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [connectedAddress, setConnectedAddress] = useState("");

  const load = useCallback(async (nextPage: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      const response = await fetch(`/api/participants.json?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
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
    void load(page, search);
  }, [load, page, search]);

  useEffect(() => {
    const refresh = () => setConnectedAddress(isConnected() ? getConnectedStxAddress() : "");
    refresh();
    window.addEventListener("perkos-wallet-change", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("perkos-wallet-change", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const pages = directory ? Math.max(1, Math.ceil(directory.total / directory.pageSize)) : 1;

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

      <RegistrationForm
        connectedAddress={connectedAddress}
        onRegistered={(wallet, created) => {
          toast.success(created ? "You are listed. Your wallet now counts as independent." : "Your entry was updated.");
          setQuery("");
          setSearch("");
          setPage(1);
          void load(1, "").then(() => {
            document.getElementById(wallet)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      />

      <section className="mt-12" aria-labelledby="directory">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="directory" className="text-xl font-semibold">Directory</h2>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(query.trim());
            }}
          >
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="field w-64" placeholder="Search handle or wallet" maxLength={80} aria-label="Search participants" />
            <button type="submit" className="btn-ghost btn-sm"><Search className="h-4 w-4" /> Search</button>
          </form>
        </div>
        {loading ? (
          <div className="py-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          </div>
        ) : error ? (
          <div className="card mt-4 p-6 text-sm text-amber-300">{error}</div>
        ) : directory && directory.participants.length === 0 ? (
          <div className="card mt-4 p-8 text-center">
            <Fingerprint className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
            <p className="mt-3 text-mist-300">{search ? `No participant matches "${search}".` : "No independent participant is listed yet."}</p>
            <p className="mt-1 text-sm text-mist-500">Team-operated wallets are never listed here. Be the first: register above with your wallet.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {directory?.participants.map((participant) => (
              <ParticipantCard key={participant.wallet.address} participant={participant} mine={participant.wallet.address === connectedAddress} />
            ))}
          </div>
        )}
        {directory && pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-mist-400">
            <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {directory.page} of {pages} · {directory.total} participants</span>
            <button type="button" className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
        <p className="mt-3 text-xs text-mist-500">
          Machine-readable: <code className="text-mist-300">/api/participants.json</code> (paginated, <code className="text-mist-300">?q=</code> to search) and{" "}
          <code className="text-mist-300">/api/participants/&lt;wallet&gt;</code>. Wallet classification and adoption counters:{" "}
          <Link href="/evidence" className="text-brand-300 hover:text-brand-200">transparency page</Link>.
        </p>
      </section>

      <section className="mt-12 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm text-mist-300" aria-labelledby="how-verify">
        <h2 id="how-verify" className="text-base font-semibold text-white">How anyone verifies a participant</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Take the <code>message</code>, <code>signature</code> and <code>publicKey</code> from the directory.</li>
          <li>Hash the message as a SIP-018 string message and recover the public key from the RSV signature; it must equal <code>publicKey</code>.</li>
          <li>Derive the Stacks address from that public key; it must equal the listed wallet.</li>
          <li>Read the wallet&apos;s agents from <code>agent-registry</code> and its jobs from the escrow contracts on the Hiro explorer.</li>
        </ol>
        <p className="mt-3 text-xs text-mist-500">
          Self-registered entries pass these checks when they are submitted; entries pinned in the repository pass them in the test suite and on every request.
        </p>
      </section>
    </div>
  );
}

function ParticipantCard({ participant, mine }: { participant: ParticipantRecord; mine: boolean }) {
  const verification = participant.attestationVerification;
  const [showAttestation, setShowAttestation] = useState(false);
  return (
    <article id={participant.wallet.address} className={`card p-5 scroll-mt-24${mine ? " border-brand-400/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-white">{participant.handle}</span>
            <span className="badge border-white/10 text-mist-400">{kindLabel[participant.kind]}</span>
            {mine && <span className="badge border-brand-400/40 text-brand-300">Your wallet · edit above</span>}
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

interface FormState {
  handle: string;
  kind: ParticipantKind;
  roles: ParticipantRole[];
  github: string;
  x: string;
  website: string;
  organization: string;
  notes: string;
}
const EMPTY: FormState = { handle: "", kind: "independent-developer", roles: ["agent-owner", "provider"], github: "", x: "", website: "", organization: "", notes: "" };

function RegistrationForm({ connectedAddress, onRegistered }: { connectedAddress: string; onRegistered: (wallet: string, created: boolean) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [listed, setListed] = useState<{ handle: string; updatedAt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const address = connectedAddress;

  // Prefill from the URL (the CLI hands off with ?register=1&handle=...) and from the registry when this wallet is listed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("register")) {
      setForm((current) => ({
        ...current,
        handle: params.get("handle") ?? current.handle,
        kind: (KINDS.some((k) => k.value === params.get("kind")) ? params.get("kind") : current.kind) as ParticipantKind,
        roles: params.get("roles") ? (params.get("roles")!.split(",").filter((r) => ROLES.some((role) => role.value === r)) as ParticipantRole[]) : current.roles,
        github: params.get("github") ?? current.github,
        x: params.get("x") ?? current.x,
        website: params.get("website") ?? current.website,
        organization: params.get("organization") ?? current.organization,
        notes: params.get("notes") ?? current.notes,
      }));
      document.getElementById("register")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (!address) {
      setListed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/participants/${address}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setListed(null);
          return;
        }
        const entry = (await response.json()) as ParticipantRecord & { updatedAt?: string };
        if (cancelled) return;
        setListed({ handle: entry.handle, updatedAt: entry.updatedAt });
        setForm({
          handle: entry.handle,
          kind: entry.kind,
          roles: entry.wallet.roles,
          github: entry.links?.github ?? "",
          x: entry.links?.x ?? "",
          website: entry.links?.website ?? "",
          organization: entry.organization ?? "",
          notes: entry.notes ?? "",
        });
      } catch {
        if (!cancelled) setListed(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const cleanHandle = form.handle.trim();
  const handleValid = /^[A-Za-z0-9._-]{2,40}$/.test(cleanHandle);
  const date = new Date().toISOString().slice(0, 10);
  const message = address && handleValid ? participantAttestationMessage({ handle: cleanHandle, address, network, date }) : "";
  const ready = Boolean(message) && form.roles.length > 0 && !busy;

  async function sign() {
    setBusy(true);
    setError(null);
    setFallback(null);
    setDone(null);
    try {
      const signed = await request("stx_signMessage", { message });
      const links = Object.fromEntries(
        (["github", "x", "website"] as const).map((key) => [key, form[key].trim()]).filter(([, value]) => value),
      );
      const participant = {
        handle: cleanHandle,
        kind: form.kind,
        ...(form.organization.trim() ? { organization: form.organization.trim() } : {}),
        ...(Object.keys(links).length ? { links } : {}),
        wallet: { address, roles: form.roles },
        agentIds: [] as number[],
        attestation: { message, signature: signed.signature, publicKey: signed.publicKey, signedAt: new Date().toISOString() },
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      };
      const verification = await verifyParticipantAttestation(participant, network);
      if (!verification.valid) throw new Error(`The wallet returned a signature this page cannot verify: ${verification.reasons.join(" ")}`);
      const response = await fetch("/api/participants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(participant) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string; created?: boolean; url?: string };
      if (response.status === 503 && body.error === "registry_not_configured") {
        setFallback(JSON.stringify(participant, null, 2));
        return;
      }
      if (!response.ok) throw new Error(body.message ?? `The registry answered ${response.status}.`);
      setDone(body.url ?? `/participants#${address}`);
      setListed({ handle: cleanHandle, updatedAt: new Date().toISOString() });
      onRegistered(address, Boolean(body.created));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The wallet did not sign the attestation.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!fallback) return;
    try {
      await navigator.clipboard.writeText(fallback);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <section id="register" className="mt-12 card p-6 scroll-mt-24" aria-labelledby="attest">
      <h2 id="attest" className="text-xl font-semibold">
        <PenLine className="mr-2 inline h-5 w-5 text-brand-300" />
        {listed ? `Edit your entry (${listed.handle})` : "Register as an independent participant"}
      </h2>
      <p className="mt-2 text-sm text-mist-300">
        Connect the wallet that registers your agents or takes your jobs, describe yourself and sign the attestation.
        Signing is free, moves no funds and reveals no key. Your entry is listed immediately; to change it, come back with
        the same wallet and sign again. One entry per wallet: use a second wallet for a second role or agent.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="handle">Public handle (GitHub, X or a name)</label>
          <input id="handle" value={form.handle} onChange={(event) => set("handle", event.target.value)} className="field" placeholder="your-handle" maxLength={40} />
          {form.handle && !handleValid && <p className="mt-1 text-xs text-red-300">2 to 40 characters: letters, digits, dot, dash or underscore.</p>}
        </div>
        <div>
          <label className="label">Wallet</label>
          <p className="field font-mono text-xs text-mist-300">{address ? address : "Connect a wallet from the header first."}</p>
        </div>
        <div>
          <label className="label" htmlFor="kind">You are</label>
          <select id="kind" value={form.kind} onChange={(event) => set("kind", event.target.value as ParticipantKind)} className="field">
            {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </div>
        <div>
          <span className="label">This wallet</span>
          <div className="flex flex-wrap gap-3 pt-1">
            {ROLES.map((role) => (
              <label key={role.value} className="inline-flex items-center gap-2 text-sm text-mist-200" title={role.hint}>
                <input
                  type="checkbox"
                  checked={form.roles.includes(role.value)}
                  onChange={(event) => set("roles", event.target.checked ? [...form.roles, role.value] : form.roles.filter((r) => r !== role.value))}
                />
                {role.label}
              </label>
            ))}
          </div>
          {form.roles.length === 0 && <p className="mt-1 text-xs text-red-300">Pick at least one role.</p>}
        </div>
        <div>
          <label className="label" htmlFor="github">GitHub (optional)</label>
          <input id="github" value={form.github} onChange={(event) => set("github", event.target.value)} className="field" placeholder="https://github.com/you" maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="x">X (optional)</label>
          <input id="x" value={form.x} onChange={(event) => set("x", event.target.value)} className="field" placeholder="https://x.com/you" maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="website">Website (optional)</label>
          <input id="website" value={form.website} onChange={(event) => set("website", event.target.value)} className="field" placeholder="https://" maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="organization">Organization (optional)</label>
          <input id="organization" value={form.organization} onChange={(event) => set("organization", event.target.value)} className="field" placeholder="Your team or company" maxLength={80} />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="notes">What you build (optional, one line)</label>
          <input id="notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} className="field" placeholder="Research agents for Stacks DAOs" maxLength={200} />
        </div>
      </div>
      {message && (
        <pre className="mt-4 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 text-[11px] text-mist-300">{message}</pre>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void sign()} disabled={!ready} className="btn-primary disabled:opacity-40">
          {busy ? "Awaiting wallet…" : listed ? "Sign and update" : "Sign and register"}
        </button>
        {done && <span className="text-sm text-emerald-300">Listed at <a href={done} className="underline">{done.replace(/^https?:\/\//, "")}</a></span>}
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {fallback && (
        <div className="mt-4">
          <p className="text-sm text-amber-300">This deployment does not store registrations yet. Copy the signed entry and send it to the Nayori team.</p>
          <button type="button" onClick={() => void copy()} className="btn-ghost mt-2"><Copy className="h-4 w-4" /> Copy JSON</button>
          <textarea readOnly className="field mt-2 h-56 w-full font-mono text-[11px]" value={fallback} />
        </div>
      )}
    </section>
  );
}
