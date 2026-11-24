'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Pencil } from "lucide-react";
import { getNextAgent } from "../../services/nayori-next/reads";
import type { NextAgent } from "../../services/nayori-next/parse";
import { buildRegisterAgent, buildUpdateAgent } from "../../services/nayori-next/transactions";
import { TxProgressBar } from "./ui";
import { useNextWallet } from "./useNextWallet";

const isWebLink = (value: string) => /^https?:\/\//i.test(value);

/** The connected wallet's agent on nayori-agents: its registration, with register or update. */
export default function NextAgentPanel() {
  const reload = useRef<() => void>(() => {});
  const wallet = useNextWallet(useCallback(() => reload.current(), []));
  const [agent, setAgent] = useState<NextAgent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", uri: "" });

  const load = useCallback(async () => {
    if (!wallet.address) return;
    setState("loading");
    try {
      const next = await getNextAgent(wallet.address);
      setAgent(next);
      setForm({ name: next?.name ?? "", uri: next?.uri ?? "" });
      setState("ready");
    } catch (reason) {
      console.error("Error loading the Nayori agent:", reason);
      setState("error");
    }
  }, [wallet.address]);

  useEffect(() => {
    reload.current = () => void load();
    void load();
  }, [load]);

  const unchanged = agent !== null && form.name.trim() === agent.name && form.uri.trim() === agent.uri;
  const disabled = Boolean(wallet.busy);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (agent) {
      void wallet.run("update-agent", "Update agent", () => buildUpdateAgent(form), () => setEditing(false));
    } else {
      void wallet.run("register", "Register agent", () => buildRegisterAgent(form));
    }
  }

  const fields = (
    <form onSubmit={submit} className="mt-4 grid gap-2">
      <input
        className="field"
        value={form.name}
        maxLength={64}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Agent name"
        aria-label="Agent name"
        required
      />
      <input
        className="field"
        value={form.uri}
        maxLength={256}
        onChange={(e) => setForm({ ...form, uri: e.target.value })}
        placeholder="Profile link (optional)"
        aria-label="Agent profile link"
      />
      <p className="text-xs text-mist-500">Plain ASCII: a name up to 64 characters and a link up to 256.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={disabled || unchanged}>
          {wallet.busy === "update-agent" || wallet.busy === "register"
            ? "Waiting for the wallet"
            : agent
              ? "Save changes"
              : "Register agent"}
        </button>
        {agent && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setEditing(false);
              setForm({ name: agent.name, uri: agent.uri });
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Bot className="h-5 w-5 text-brand-300" /> Your agent
      </h2>
      {state === "loading" && <p className="mt-2 text-sm text-mist-500">Loading your agent registration</p>}
      {state === "error" && (
        <p className="mt-2 text-sm text-red-300">
          Could not load your agent registration.{" "}
          <button onClick={() => void load()} className="font-medium underline underline-offset-2">Retry</button>
        </p>
      )}
      {state === "ready" && agent && (
        <>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-mist-500">Name</dt>
              <dd className="break-words text-white">{agent.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-mist-500">Profile link</dt>
              <dd className="break-all text-mist-300">
                {!agent.uri ? (
                  "None"
                ) : isWebLink(agent.uri) ? (
                  <a href={agent.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand-300">
                    {agent.uri}
                  </a>
                ) : (
                  agent.uri
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-mist-500">Registered at</dt>
              <dd className="font-mono text-mist-300">Bitcoin block {agent.registeredAt.toLocaleString("en-US")}</dd>
            </div>
          </dl>
          {editing ? (
            fields
          ) : (
            <button className="btn-ghost mt-4" onClick={() => setEditing(true)} disabled={disabled}>
              <Pencil className="h-4 w-4" /> Update agent
            </button>
          )}
        </>
      )}
      {state === "ready" && !agent && (
        <>
          <p className="mt-2 text-sm text-mist-400">
            This wallet has no Nayori agent yet. Register one to apply to jobs. It is one
            transaction per wallet, and you can change the name and link later.
          </p>
          {fields}
        </>
      )}
      <TxProgressBar progress={wallet.progress} />
    </section>
  );
}
