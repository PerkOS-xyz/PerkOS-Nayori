"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classifyEvidenceWallet } from "../constants/evidence";
import { NETWORK_NAME } from "../constants/network";
import { formatAtomicAmount, parseDirectPayments, type DirectPaymentSnapshot } from "../services/direct-payments";

export default function DirectPaymentEvidence() {
  const [snapshot, setSnapshot] = useState<DirectPaymentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/payments.json", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Unavailable");
      setSnapshot(parseDirectPayments(await response.json()));
    } catch { setSnapshot({ schemaVersion: 1, network: NETWORK_NAME === "mainnet" ? "stacks:1" : "stacks:2147483648", dataStatus: "unavailable" }); }
    finally { inFlight.current = false; setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 60_000); return () => clearInterval(timer); }, [load]);
  const live = snapshot?.dataStatus === "live" ? snapshot : null;
  return <section className="mt-12" aria-labelledby="direct-payments">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="direct-payments" className="text-xl font-semibold">x402 / MPP payments</h2>
        <p className="mt-1 text-sm text-mist-500">Confirmed direct payments for Nayori public resources, verified against Stacks. Separate from escrow jobs and grant adoption.</p></div>
      <div className="flex gap-3 text-xs"><button type="button" onClick={() => void load()} className="text-brand-300">Refresh payments</button><a href="/api/payments.json" className="text-brand-300">Payments JSON</a></div>
    </div>
    <div className="mt-4 rounded-xl border border-brand/20 bg-brand/[0.03] p-4">
      {loading ? <p role="status" className="text-sm text-mist-300">Loading verified payments…</p> : !live ?
        <p role="status" className="text-sm text-amber-200">Payment evidence is temporarily unavailable. Escrow data is independent; no zero total is inferred.</p> : <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist-300">
            <span>{live.payments.length} verified payments in the latest window</span>
            {(["STX", "sBTC", "USDCx"] as const).map(asset => <span key={asset}>
              {formatAtomicAmount(live.payments.filter(p => p.asset === asset).reduce((sum, p) => sum + BigInt(p.amountAtomic), BigInt(0)).toString(), asset === "sBTC" ? 8 : 6)} {asset}
            </span>)}
          </div>
          <p className="mt-2 text-xs text-mist-500">Up to {live.limit} latest settlements · refreshed every minute · {new Date(live.generatedAt).toLocaleString()}. {live.hasMore && "Older payments exist; these are not lifetime totals."} {live.excludedCount > 0 && `${live.excludedCount} record(s) excluded after chain verification.`}</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
            <thead className="text-xs uppercase text-mist-500"><tr>{["Protocol", "Amount", "Payer", "Recipient", "Classification", "Delivery", "Block", "Transaction"].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/[0.06]">
              {live.payments.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-mist-500">No verified direct payments in this window.</td></tr>}
              {live.payments.map(p => <tr key={p.txid} className="text-mist-300">
                <td className="px-3 py-3 uppercase text-brand-300">{p.protocol}</td>
                <td className="px-3 py-3 font-mono">{formatAtomicAmount(p.amountAtomic, p.decimals)} {p.asset}</td>
                <td className="px-3 py-3 font-mono" title={p.payer}>{p.payer.slice(0, 7)}…{p.payer.slice(-6)}</td>
                <td className="px-3 py-3 font-mono" title={p.payTo}>{p.payTo.slice(0, 7)}…{p.payTo.slice(-6)}</td>
                <td className="px-3 py-3">{classifyEvidenceWallet(p.payer) === "team" ? "Internal · PerkOS" : "Unattested"}</td>
                <td className="px-3 py-3">{p.deliveryStatus.replace(/_/g, " ")}</td>
                <td className="px-3 py-3 font-mono">{p.blockHeight.toLocaleString()}</td>
                <td className="px-3 py-3"><a className="text-brand-300" href={`https://explorer.hiro.so/txid/${p.txid}?chain=${NETWORK_NAME}`} target="_blank" rel="noopener noreferrer" title={p.txid}>{p.txid.slice(0, 10)}…{p.txid.slice(-6)} ↗</a></td>
              </tr>)}
            </tbody>
          </table></div>
          <p className="mt-3 text-xs text-mist-500">Team-operated tests are not external adoption or independent customer revenue. Unknown wallets are not assumed external.</p>
        </>}
    </div>
  </section>;
}
