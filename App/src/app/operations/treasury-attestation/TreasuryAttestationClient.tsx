"use client";

import { connect, request } from "@stacks/connect";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  FileKey2,
  Fingerprint,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  APPEAL_AUTHORITY_ADDRESS,
  createTreasuryAttestationDraft,
  createVerifiedTreasuryAttestationReceipt,
  DEPLOYER_ADDRESS,
  isReviewedMergeSha,
  serializeTreasuryAttestationReceipt,
  SERVICE_FEE_RELEASE,
  TREASURY_ADDRESS,
  TREASURY_ATTESTATION_DOMAIN,
  TreasuryAttestationDraft,
  TreasuryAttestationReceipt,
  treasuryAttestationClarityValues,
  treasuryAttestationFilename,
} from "../../../services/treasury-attestation";

const LEATHER_ONLY = ["LeatherProvider"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type Stage = "configure" | "review" | "signed";

function shorten(value: string, start = 8, end = 7) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function errorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/cancel|reject|denied/i.test(message)) return "The Leather request was cancelled.";
  return message;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/[0.07] py-3 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-mist-500">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs leading-5 text-mist-200">
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        ok
          ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200"
          : "border-amber-500/25 bg-amber-500/[0.08] text-amber-200"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

export default function TreasuryAttestationClient() {
  const [reviewedSha, setReviewedSha] = useState("");
  const [draft, setDraft] = useState<TreasuryAttestationDraft | null>(null);
  const [receipt, setReceipt] = useState<TreasuryAttestationReceipt | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    setIsLocal(LOCAL_HOSTS.has(hostname));
    setRuntimeChecked(true);

    const fromQuery = new URLSearchParams(window.location.search).get("reviewedSha") ?? "";
    if (isReviewedMergeSha(fromQuery)) setReviewedSha(fromQuery);
  }, []);

  const stage: Stage = receipt ? "signed" : draft ? "review" : "configure";
  const shaValid = isReviewedMergeSha(reviewedSha);
  const walletMatches = walletAddress === TREASURY_ADDRESS;
  const serializedReceipt = useMemo(
    () => (receipt ? serializeTreasuryAttestationReceipt(receipt) : ""),
    [receipt]
  );

  function resetSignedState() {
    setDraft(null);
    setReceipt(null);
    setCopied(false);
    setError(null);
  }

  function prepareReview() {
    setError(null);
    setReceipt(null);
    try {
      setDraft(createTreasuryAttestationDraft(reviewedSha));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function connectTreasury() {
    setBusy("connect");
    setError(null);
    setWalletAddress("");
    try {
      const response = await connect({
        network: "mainnet",
        approvedProviderIds: LEATHER_ONLY,
      });
      const address = response.addresses.find(
        (entry) => entry.address === TREASURY_ADDRESS
      )?.address;
      const selectedMainnetAddress =
        address ?? response.addresses.find((entry) => entry.address.startsWith("SP"))?.address ?? "";
      setWalletAddress(selectedMainnetAddress);
      if (selectedMainnetAddress !== TREASURY_ADDRESS) {
        throw new Error(
          selectedMainnetAddress
            ? `Leather connected ${selectedMainnetAddress}. Select the dedicated Nayori treasury account and reconnect.`
            : "Leather did not return a Stacks mainnet account."
        );
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  async function signAttestation() {
    if (!draft || !isLocal || !walletMatches) return;
    setBusy("sign");
    setError(null);
    setReceipt(null);
    try {
      const values = treasuryAttestationClarityValues(draft);
      const result = await request(
        { approvedProviderIds: LEATHER_ONLY },
        "stx_signStructuredMessage",
        values
      );
      const verified = await createVerifiedTreasuryAttestationReceipt(
        draft,
        result
      );
      setReceipt(verified);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  function downloadReceipt() {
    if (!receipt) return;
    const blob = new Blob([serializedReceipt], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = treasuryAttestationFilename(receipt.message.reviewedSha);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function copyReceipt() {
    if (!receipt) return;
    await navigator.clipboard.writeText(serializedReceipt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="relative overflow-hidden pb-20 pt-12">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[34rem] w-[58rem] -translate-x-1/2 rounded-full bg-brand/[0.08] blur-[120px]" />
      <div className="container-x">
        <header className="max-w-3xl">
          <div className="flex flex-wrap gap-2">
            <span className="kicker"><ShieldCheck className="h-3.5 w-3.5 text-brand-300" /> Operator-only</span>
            <span className="kicker"><KeyRound className="h-3.5 w-3.5 text-brand-300" /> Local workflow</span>
            <span className="kicker">No transaction</span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Treasury custody attestation
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-mist-300">
            Prove that the Leather account controls Nayori&apos;s mainnet treasury for the exact
            service-fee release. Leather remains the signing boundary; this workflow receives only a
            public key and signature and never broadcasts a transaction.
          </p>
        </header>

        <div className="mt-8 flex flex-wrap gap-2">
          <StatusPill ok={runtimeChecked && isLocal}>
            {!runtimeChecked ? "Checking runtime" : isLocal ? "Localhost verified" : "Signing disabled outside localhost"}
          </StatusPill>
          <StatusPill ok={walletMatches}>
            {walletMatches ? "Treasury account verified" : "Treasury not connected"}
          </StatusPill>
          <StatusPill ok={stage === "signed"}>
            {stage === "signed" ? "Signature verified" : stage === "review" ? "Payload ready for review" : "Payload not prepared"}
          </StatusPill>
        </div>

        {!isLocal && runtimeChecked && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <p>
              This operator control is intentionally inert on hosted environments. Run the reviewed
              application locally and open this route through <code className="font-mono">localhost</code>.
            </p>
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <section className="space-y-6" aria-labelledby="release-configuration">
            <div className="card nayori-glow-card p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand-300">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-300">Step 1</p>
                  <h2 id="release-configuration" className="mt-1 text-xl font-semibold text-white">Bind the reviewed release</h2>
                  <p className="mt-1 text-sm leading-6 text-mist-500">Use the exact 40-character lowercase SHA of the reviewed merge commit.</p>
                </div>
              </div>
              <label htmlFor="reviewed-sha" className="label mt-5">Reviewed merge SHA</label>
              <input
                id="reviewed-sha"
                className="field font-mono"
                value={reviewedSha}
                onChange={(event) => {
                  setReviewedSha(event.target.value.trim());
                  resetSignedState();
                }}
                placeholder="40 lowercase hexadecimal characters"
                spellCheck={false}
                autoComplete="off"
                disabled={busy !== null}
                aria-invalid={reviewedSha.length > 0 && !shaValid}
              />
              {reviewedSha.length > 0 && !shaValid && (
                <p className="mt-2 text-xs text-red-300">The SHA must contain exactly 40 lowercase hexadecimal characters.</p>
              )}
              <button
                type="button"
                className="btn-primary nayori-primary-glow mt-5 w-full"
                onClick={prepareReview}
                disabled={!shaValid || !isLocal || busy !== null}
              >
                <RefreshCw className="h-4 w-4" /> Generate fresh 24-hour challenge
              </button>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-3">
                <FileKey2 className="h-5 w-5 text-brand-300" />
                <div>
                  <h2 className="font-semibold text-white">Pinned release</h2>
                  <p className="text-xs text-mist-500">Read every value before authorizing Leather.</p>
                </div>
              </div>
              <dl className="mt-4">
                <Detail label="Treasury" value={TREASURY_ADDRESS} />
                <Detail label="Deployer" value={DEPLOYER_ADDRESS} />
                <Detail label="Appeal authority" value={APPEAL_AUTHORITY_ADDRESS} />
                <Detail label="STX contract" value={SERVICE_FEE_RELEASE.stxContract} />
                <Detail label="STX source SHA-256" value={SERVICE_FEE_RELEASE.stxSourceHash} />
                <Detail label="sBTC contract" value={SERVICE_FEE_RELEASE.sbtcContract} />
                <Detail label="sBTC source SHA-256" value={SERVICE_FEE_RELEASE.sbtcSourceHash} />
              </dl>
            </div>
          </section>

          <section className="card p-6 md:p-8" aria-labelledby="attestation-review">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-300">Steps 2–3</p>
                <h2 id="attestation-review" className="mt-1 text-xl font-semibold text-white">Review, connect and sign</h2>
                <p className="mt-1 text-sm leading-6 text-mist-500">The structured data shown here is exactly what Leather will sign.</p>
              </div>
              <ShieldCheck className="h-7 w-7 shrink-0 text-brand-300" />
            </div>

            {!draft ? (
              <div className="mt-8 rounded-xl border border-dashed border-white/[0.12] px-5 py-12 text-center">
                <FileKey2 className="mx-auto h-7 w-7 text-mist-500" />
                <p className="mt-3 text-sm font-medium text-mist-200">No signing payload exists yet</p>
                <p className="mt-1 text-xs text-mist-500">Enter the reviewed merge SHA and generate a fresh challenge.</p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-mist-500">SIP-018 domain</p>
                    <p className="mt-2 text-sm font-medium text-white">{TREASURY_ATTESTATION_DOMAIN.name}</p>
                    <p className="mt-1 font-mono text-xs text-mist-500">v{TREASURY_ATTESTATION_DOMAIN.version} · chain-id {TREASURY_ATTESTATION_DOMAIN.chainId}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-mist-500">Validity</p>
                    <p className="mt-2 text-sm font-medium text-white">24 hours</p>
                    <p className="mt-1 text-xs text-mist-500">Expires {new Date(draft.message.expiresAt).toLocaleString()}</p>
                  </div>
                </div>
                <dl className="mt-4 rounded-xl border border-white/[0.08] bg-ink-950/45 px-4">
                  <Detail label="Action" value={draft.message.action} />
                  <Detail label="Reviewed SHA" value={draft.message.reviewedSha} />
                  <Detail label="Random challenge" value={draft.message.challenge} />
                  <Detail label="Issued at (UTC)" value={draft.message.issuedAt} />
                  <Detail label="Expires at (UTC)" value={draft.message.expiresAt} />
                </dl>

                <div className="mt-5 rounded-xl border border-brand/20 bg-brand/[0.06] p-4 text-sm leading-6 text-mist-200">
                  <strong className="text-white">Signing is not a payment or economic-policy approval.</strong> It proves control of the pinned treasury for this exact reviewed release. It does not spend STX or sBTC and creates no on-chain transaction.
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void connectTreasury()}
                    disabled={!isLocal || busy !== null}
                  >
                    <WalletCards className="h-4 w-4" />
                    {busy === "connect" ? "Connecting…" : walletMatches ? "Reconnect Leather" : "Connect Leather"}
                  </button>
                  <button
                    type="button"
                    className="btn-primary nayori-primary-glow"
                    onClick={() => void signAttestation()}
                    disabled={!isLocal || !walletMatches || busy !== null || receipt !== null}
                  >
                    <KeyRound className="h-4 w-4" />
                    {busy === "sign" ? "Awaiting Leather…" : receipt ? "Signature verified" : "Sign custody proof"}
                  </button>
                </div>

                {walletAddress && (
                  <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-xs ${walletMatches ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200" : "border-red-500/20 bg-red-500/[0.06] text-red-200"}`}>
                    {walletMatches ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <span className="break-all">Connected: <span className="font-mono">{walletAddress}</span></span>
                  </div>
                )}
              </>
            )}

            {error && (
              <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <p>{error}</p>
              </div>
            )}

            {receipt && (
              <div className="mt-7 border-t border-white/[0.08] pt-7">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Custody proof verified locally</h3>
                    <p className="mt-1 text-sm leading-6 text-mist-500">The recovered signer derives to {shorten(TREASURY_ADDRESS)}. Save the strict JSON receipt for the guarded deployment gate.</p>
                  </div>
                </div>
                <pre className="mt-5 max-h-80 overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 font-mono text-[11px] leading-5 text-mist-300">{serializedReceipt}</pre>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" className="btn-primary" onClick={downloadReceipt}>
                    <Download className="h-4 w-4" /> Download verified JSON
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void copyReceipt()}>
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy JSON"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-mist-500">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-300" />
          The downloaded receipt contains only public attestation data. It contains no wallet secret and cannot move funds.
        </div>
      </div>
    </div>
  );
}
