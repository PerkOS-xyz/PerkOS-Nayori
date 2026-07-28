'use client';

import { useEffect, useState } from "react";
import { connect, disconnect, isConnected } from "@stacks/connect";
import { Wallet } from "lucide-react";
import { useToast } from "./Toast";
import { NETWORK_NAME } from "../constants/network";
import {
  getConnectedStxAddress,
  isStxAddressForNetwork,
} from "../services/wallet";

const shorten = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;

export default function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const toast = useToast();

  function refresh() {
    setAddress(getConnectedStxAddress() || null);
  }
  useEffect(() => {
    if (isConnected()) refresh();
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
          `Leather did not return a Stacks ${NETWORK_NAME} address.`
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
  return (
    <button onClick={onConnect} className="btn-primary" disabled={connecting}>
      <Wallet className="h-4 w-4" />
      <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect Wallet"}</span>
      <span className="sm:hidden">{connecting ? "Connecting…" : "Connect"}</span>
    </button>
  );
}
