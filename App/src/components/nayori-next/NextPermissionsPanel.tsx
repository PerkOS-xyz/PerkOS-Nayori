'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { NAYORI_NEXT } from "../../constants/nayori-next";
import { getNextAllowance } from "../../services/nayori-next/reads";
import {
  NEXT_ALLOWANCE_TARGETS,
  allowanceSummary,
  allowanceTargetContract,
  isNextContractPrincipal,
  parseExpiryBlock,
  type NextAllowanceTarget,
} from "../../services/nayori-next/permissions";
import { buildAllowContractCaller, buildDisallowContractCaller } from "../../services/nayori-next/transactions";
import { TxProgressBar } from "./ui";
import { useNextWallet } from "./useNextWallet";

/**
 * Allow or revoke a helper contract for the connected wallet on one Nayori contract (D4).
 * Allowances have no index, so the panel checks one helper and target at a time.
 */
export default function NextPermissionsPanel({ height }: { height: number }) {
  const recheck = useRef<() => void>(() => {});
  const wallet = useNextWallet(useCallback(() => recheck.current(), []));
  const [caller, setCaller] = useState("");
  const [target, setTarget] = useState<NextAllowanceTarget>("escrowSbtc");
  const [until, setUntil] = useState("");
  const [result, setResult] = useState<{ key: string; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const helper = caller.trim();
  const key = `${helper}|${target}`;
  const validHelper = isNextContractPrincipal(helper, NAYORI_NEXT.network);
  const disabled = Boolean(wallet.busy) || !wallet.connected;
  const prefix = NAYORI_NEXT.network === "mainnet" ? "SP" : "ST";

  const check = useCallback(async () => {
    if (!wallet.address || !isNextContractPrincipal(helper, NAYORI_NEXT.network)) return;
    setChecking(true);
    try {
      const allowance = await getNextAllowance(wallet.address, helper, allowanceTargetContract(target, NAYORI_NEXT));
      setResult({ key: `${helper}|${target}`, text: allowanceSummary(allowance, height) });
    } catch (reason) {
      console.error("Error reading the allowance:", reason);
      setResult({ key: `${helper}|${target}`, text: "Could not read this allowance. Try again." });
    } finally {
      setChecking(false);
    }
  }, [height, helper, target, wallet.address]);
  useEffect(() => {
    recheck.current = () => void check();
  }, [check]);

  function allow() {
    setInputError(null);
    let expiry: number | undefined;
    try {
      expiry = parseExpiryBlock(until, height);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : String(error));
      return;
    }
    void wallet.run("allow", "Allow helper", () =>
      buildAllowContractCaller({ caller: helper, target, ...(expiry !== undefined ? { until: expiry } : {}) })
    );
  }

  function revoke() {
    setInputError(null);
    void wallet.run("revoke", "Revoke helper", () => buildDisallowContractCaller({ caller: helper, target }));
  }

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-5 w-5 text-brand-300" /> Permissions
      </h2>
      <p className="mt-2 text-sm text-mist-400">
        An allowed helper contract can act for your wallet on the one Nayori contract you choose, until
        you revoke it or its expiry block passes.
      </p>
      <p className="mt-1 text-xs text-mist-500">
        Allow only helpers you trust, and prefer an expiry. Allowances are not listed here: check a
        helper to see whether it is allowed.
      </p>

      <div className="mt-4 grid gap-3">
        <div>
          <label className="label" htmlFor="next-helper">Helper contract</label>
          <input
            id="next-helper"
            className="field font-mono"
            value={caller}
            onChange={(e) => setCaller(e.target.value)}
            placeholder={`${prefix}....helper-name`}
          />
          {helper && !validHelper && (
            <p className="mt-1 text-xs text-amber-300">Enter a {NAYORI_NEXT.network} contract, like {prefix}...name.</p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="next-target">Nayori contract</label>
            <select
              id="next-target"
              className="field"
              value={target}
              onChange={(e) => setTarget(e.target.value as NextAllowanceTarget)}
            >
              {NEXT_ALLOWANCE_TARGETS.map((entry) => (
                <option key={entry.key} value={entry.key}>{entry.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="next-until">Expiry block (optional)</label>
            <input
              id="next-until"
              className="field"
              inputMode="numeric"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              placeholder={height ? String(height + 144) : "Bitcoin block"}
            />
            <p className="mt-1 text-xs text-mist-500">
              Empty means no expiry.{height ? ` Bitcoin block now: ${height.toLocaleString("en-US")}.` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => void check()} disabled={!validHelper || !wallet.connected || checking}>
          {checking ? "Checking" : "Check"}
        </button>
        <button className="btn-primary" onClick={allow} disabled={!validHelper || disabled}>
          {wallet.busy === "allow" ? "Waiting for the wallet" : "Allow"}
        </button>
        <button className="btn-ghost" onClick={revoke} disabled={!validHelper || disabled}>
          {wallet.busy === "revoke" ? "Waiting for the wallet" : "Revoke"}
        </button>
      </div>
      {inputError && <p className="mt-3 text-sm text-red-300">{inputError}</p>}
      {result && result.key === key && <p className="mt-3 text-sm text-mist-200">{result.text}</p>}
      <TxProgressBar progress={wallet.progress} />
    </section>
  );
}
