'use client';

import { useCallback, useEffect, useState } from "react";
import { isConnected } from "@stacks/connect";
import { NAYORI_NEXT } from "../../constants/nayori-next";
import { humanizeNextError } from "../../services/nayori-next/errors";
import {
  getNextConnectedAddress,
  sendNextCall,
  type NextCallPayload,
} from "../../services/nayori-next/transactions";
import { trackTx, txIdOf } from "../../services/tx";
import { useToast } from "../Toast";

export type NextTxProgress = {
  state: "awaiting" | "submitted" | "pending" | "confirmed" | "failed";
  label: string;
  txid?: string;
};

/**
 * The connected wallet on the next deployment's network, and a runner that opens the wallet
 * with a deny-mode payload, then follows the transaction until it confirms.
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

  const run = useCallback(
    async (key: string, label: string, build: () => NextCallPayload | Promise<NextCallPayload>, after?: () => void) => {
      if (!connected || !address) {
        toast.error(`Connect a ${NAYORI_NEXT.network} wallet before signing.`);
        return;
      }
      setBusy(key);
      setProgress({ state: "awaiting", label });
      try {
        const payload = await build();
        if (getNextConnectedAddress() !== address) {
          throw new Error("The wallet account changed. Review the job again before signing.");
        }
        const response = await sendNextCall(payload);
        const txid = txIdOf(response);
        if (!txid) throw new Error("The wallet returned no transaction id.");
        after?.();
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

  return { address, connected, busy, progress, run };
}
