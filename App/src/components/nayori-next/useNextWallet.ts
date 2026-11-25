'use client';

import { useCallback, useEffect, useState } from "react";
import { isConnected } from "@stacks/connect";
import { NAYORI_NEXT, isMultisigAddress } from "../../constants/nayori-next";
import { humanizeNextError } from "../../services/nayori-next/errors";
import { LEATHER_MULTISIG_URL, proposalNotice, walletOutcome } from "../../services/nayori-next/multisig";
import {
  getNextConnectedAddress,
  sendNextCall,
  type NextCallPayload,
} from "../../services/nayori-next/transactions";
import { trackTx } from "../../services/tx";
import { useToast } from "../Toast";

export type NextTxProgress = {
  state: "awaiting" | "submitted" | "pending" | "proposed" | "confirmed" | "failed";
  label: string;
  /** The action that started this transaction, so the page can show its proposal state. */
  key?: string;
  txid?: string;
  /** Extra plain text, used for multisig proposals waiting for the members and the broadcast. */
  note?: string;
};

export type NextRunOptions = {
  /** Bitcoin block by which the call must land, shown to multisig signers. */
  deadline?: number;
  /** Current Bitcoin height, so the deadline is only shown while it is ahead. */
  height?: number;
};

export type NextRun = (
  key: string,
  label: string,
  build: () => NextCallPayload | Promise<NextCallPayload>,
  after?: () => void,
  options?: NextRunOptions
) => Promise<void>;

// A multisig proposal may wait for the second member for a while; keep following it longer.
const PROPOSAL_MAX_POLLS = 90;

/**
 * The connected wallet on the Nayori contracts' network, and a runner that opens the wallet
 * with a deny-mode payload, then follows the transaction until it confirms. A Leather multisig
 * account (SM or SN) gets a proposal instead: the runner says that every member approves it at
 * leather.io/multisig (Activity), that one member then presses Broadcast, and keeps following it
 * until it appears on chain.
 */
export function useNextWallet(onConfirmed: () => void) {
  const toast = useToast();
  const [address, setAddress] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<NextTxProgress | null>(null);

  const refresh = useCallback(() => {
    const next = getNextConnectedAddress();
    setAddress(next);
    setConnected(isConnected() && Boolean(next));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("perkos-wallet-change", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("perkos-wallet-change", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const run = useCallback<NextRun>(
    async (key, label, build, after, options) => {
      if (!connected || !address) {
        toast.error(`Connect a ${NAYORI_NEXT.network} wallet before signing.`);
        return;
      }
      setBusy(key);
      setProgress({ state: "awaiting", label, key });
      try {
        const payload = await build();
        if (getNextConnectedAddress() !== address) {
          throw new Error("The wallet account changed. Review the job again before signing.");
        }
        const response = await sendNextCall(payload);
        const outcome = walletOutcome(address, response);
        if (outcome.kind === "missing") throw new Error("The wallet returned no transaction id.");
        after?.();

        if (outcome.kind === "proposal") {
          const ahead = options?.deadline && (!options.height || options.deadline >= options.height);
          const note = proposalNotice(label, ahead ? { block: options!.deadline!, height: options?.height ?? 0 } : undefined);
          setProgress({ state: "proposed", label, key, txid: outcome.txid, note });
          toast.info("Proposal created. Approve it in Leather multisig, then Broadcast", LEATHER_MULTISIG_URL);
          if (outcome.txid) {
            const txid = outcome.txid;
            // Quiet follow-up: only the final result is announced.
            const quiet = { info: () => {}, success: toast.success, error: toast.error };
            void trackTx(
              txid,
              quiet,
              onConfirmed,
              (state) =>
                setProgress(
                  state === "success"
                    ? { state: "confirmed", label, key, txid }
                    : state === "failed"
                      ? { state: "failed", label, key, txid }
                      : { state: "proposed", label, key, txid, note }
                ),
              { network: NAYORI_NEXT.network, maxPolls: PROPOSAL_MAX_POLLS }
            );
          }
          return;
        }

        const txid = outcome.txid;
        setProgress({ state: "submitted", label, txid });
        void trackTx(
          txid,
          toast,
          onConfirmed,
          (state) =>
            setProgress({
              state: state === "success" ? "confirmed" : state === "failed" ? "failed" : "pending",
              label,
              txid,
            }),
          { network: NAYORI_NEXT.network }
        );
      } catch (error) {
        const message = humanizeNextError(error);
        setProgress({ state: "failed", label: message });
        toast.error(message);
      } finally {
        setBusy(null);
      }
    },
    [address, connected, onConfirmed, toast]
  );

  return { address, connected, multisig: isMultisigAddress(address), busy, progress, run };
}
