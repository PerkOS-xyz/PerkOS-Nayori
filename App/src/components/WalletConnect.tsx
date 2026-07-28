'use client';

import { useEffect, useState } from "react";
import { connect, disconnect, isConnected } from "@stacks/connect";
import { AlertTriangle, Wallet } from "lucide-react";
import { useToast } from "./Toast";
import { NETWORK_NAME } from "../constants/network";
import {
  getWalletNetworkState,
  isStxAddressForNetwork,
} from "../services/wallet";

const shorten = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;

export default function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null);
  const [networkMismatch, setNetworkMismatch] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const toast = useToast();

  function refresh() {
    const state = getWalletNetworkState();
    setAddress(state.address || null);
    setNetworkMismatch(isConnected() && state.mismatch);
  }
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  async function onConnect() {
    setConnecting(true);
    try {
      const response = await connect({ network: NETWORK_NAME });
      const networkAddress = response.addresses.find((item) =>
        isStxAddressForNetwork(item.address, NETWORK_NAME)
      )?.address;
      refresh();
      window.dispatchEvent(new Event("perkos-wallet-change"));
      if (!networkAddress) {
        throw new Error(
          `Leather is connected to a different Stacks network. Switch Leather to ${NETWORK_NAME} and reconnect.`
        );
      }
      toast.success("Wallet connected");
    } catch (e) {
      console.error("Wallet connection error:", e);
      const message = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(message)) {
        toast.error(
          /did not return a Stacks/.test(message)
            ? message
            : "Leather could not connect. Unlock the extension, allow access to localhost and try again."
        );
      }
    } finally {
      setConnecting(false);
    }
  }
  function onDisconnect() {
    disconnect();
    setAddress(null);
    setNetworkMismatch(false);
    window.dispatchEvent(new Event("perkos-wallet-change"));
  }

  if (address) {
    return (
      <button
        onClick={onDisconnect}
        className="group inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm transition hover:border-white/25"
        title="Disconnect"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="font-mono text-xs text-mist-100">{shorten(address)}</span>
      </button>
    );
  }
  if (networkMismatch) {
    return (
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 transition hover:bg-amber-500/15"
        disabled={connecting}
        title={`Leather must use Stacks ${NETWORK_NAME}`}
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="hidden sm:inline">
          {connecting ? "Reconnecting…" : `Switch to ${NETWORK_NAME}`}
        </span>
        <span className="sm:hidden">
          {connecting ? "Switching…" : "Wrong network"}
        </span>
      </button>
    );
  }
  return (
    <button onClick={onConnect} className="btn-primary" disabled={connecting}>
      <Wallet className="h-4 w-4" />
      <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect Wallet"}</span>
      <span className="sm:hidden">{connecting ? "Connecting…" : "Connect"}</span>
    </button>
  );
}
