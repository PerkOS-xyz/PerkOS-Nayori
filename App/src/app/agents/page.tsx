'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Power, Fingerprint, Star, BadgeCheck, Wallet, Search } from "lucide-react";
import { getAgent, getAgentCount, Agent } from "../../services/agent-registry";
import { getReputationV2 } from "../../services/reputation-v2";
import { isVerified } from "../../services/validation";
import { trackTx, txIdOf } from "../../services/tx";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";
import { request, getLocalStorage, isConnected } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { CONTRACT_ADDRESS } from "../../constants/contract";
import { NETWORK_NAME } from "../../constants/network";
import { humanizeContractError } from "../../services/contract-errors";
import { isValidStacksAddress } from "../../services/commerce";

const AGENT_REGISTRY = `${CONTRACT_ADDRESS}.agent-registry` as `${string}.${string}`;

const connectedStx = () => getLocalStorage()?.addresses?.stx?.[0]?.address ?? "";
const PAGE_SIZE = 24;

export default function AgentsPage() {
  const toast = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentPage, setAgentPage] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    wallet: "",
    endpointName: "",
    endpointUrl: "",
  });
  const [reps, setReps] = useState<Record<number, { avg: number; count: number; verified: boolean }>>({});
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => {
    const wallet = connectedStx();
    setConnected(isConnected() && Boolean(wallet));
    setAddress(wallet);
    const refreshWallet = () => {
      const next = connectedStx();
      setConnected(isConnected() && Boolean(next));
      setAddress(next);
    };
    window.addEventListener("perkos-wallet-change", refreshWallet);
    return () => window.removeEventListener("perkos-wallet-change", refreshWallet);
  }, []);

  useEffect(() => {
    void loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentPage]);

  async function loadAgents() {
    setLoading(true);
    setError(null);
    try {
      const count = await getAgentCount();
      setTotalAgents(count);
      const start = count - agentPage * PAGE_SIZE;
      const ids = Array.from(
        { length: Math.max(0, Math.min(PAGE_SIZE, start)) },
        (_, i) => start - i
      );
      const agentList = (await Promise.all(ids.map((i) => getAgent(i)))).filter(Boolean) as Agent[];
      setAgents(agentList);
      // Load on-chain reputation + verification per agent (keyed by wallet).
      const entries = await Promise.all(
        agentList.map(async (a) => {
          const [rep, verified] = await Promise.all([getReputationV2(a.wallet), isVerified(a.wallet)]);
          return [a.id, { avg: rep.averageScore, count: rep.ratingCount, verified }] as const;
        })
      );
      setReps(Object.fromEntries(entries));
    } catch (error) {
      console.error("Error loading agents:", error);
      setError("Failed to load agents. Please try again.");
    }
    setLoading(false);
  }

  // Submit a write, toast the result, poll the chain, then refresh on confirmation.
  async function submit(fn: string, args: any[], actionKey: string, after?: () => void) {
    setActiveAction(actionKey);
    try {
      const res = await request("stx_callContract", { contract: AGENT_REGISTRY, functionName: fn, functionArgs: args, network: NETWORK_NAME });
      const id = txIdOf(res);
      after?.();
      if (id) trackTx(id, toast, loadAgents);
      else toast.error("No transaction id returned");
    } catch (error) {
      console.error(`Error ${fn}:`, error);
      toast.error(humanizeContractError(error));
    } finally {
      setActiveAction(null);
    }
  }

  const resetForm = () => setFormData({ name: "", description: "", wallet: "", endpointName: "", endpointUrl: "" });

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!connected || !address) {
      toast.error("Connect the wallet that will control this agent.");
      return;
    }
    if (formData.wallet !== address || !isValidStacksAddress(formData.wallet)) {
      toast.error("The agent wallet must match the connected wallet.");
      return;
    }
    await submit("register-agent", [
      Cl.stringAscii(formData.name),
      Cl.stringAscii(formData.description),
      Cl.principal(formData.wallet),
      formData.endpointUrl
        ? Cl.list([Cl.tuple({ name: Cl.stringAscii(formData.endpointName || "web"), url: Cl.stringAscii(formData.endpointUrl) })])
        : Cl.list([]),
    ], "registering", () => { setShowForm(false); resetForm(); });
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAgent) return;
    await submit("update-agent", [
      Cl.uint(editingAgent.id),
      formData.name ? Cl.some(Cl.stringAscii(formData.name)) : Cl.none(),
      formData.description ? Cl.some(Cl.stringAscii(formData.description)) : Cl.none(),
      formData.wallet ? Cl.some(Cl.principal(formData.wallet)) : Cl.none(),
    ], `updating-${editingAgent.id}`, () => { setEditingAgent(null); resetForm(); });
  }

  const handleDeactivate = (agentId: number) =>
    submit("deactivate-agent", [Cl.uint(agentId)], `deactivating-${agentId}`);

  function startEdit(agent: Agent) {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      description: agent.description,
      wallet: agent.wallet,
      endpointName: agent.endpoints[0]?.name || "",
      endpointUrl: agent.endpoints[0]?.url || "",
    });
  }

  const submitting = activeAction === "registering" || activeAction?.startsWith("updating");
  const visibleAgents = agents.filter((agent) => {
    const q = query.trim().toLowerCase();
    if (q && ![agent.name, agent.description, agent.wallet, ...agent.endpoints.map((ep) => `${ep.name} ${ep.url}`)]
      .some((value) => value.toLowerCase().includes(q))) return false;
    if (verifiedOnly && !reps[agent.id]?.verified) return false;
    if (activeOnly && !agent.active) return false;
    return true;
  });

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Registry</h1>
          <p className="mt-1.5 text-mist-300">On-chain identity for autonomous agents on Stacks.</p>
        </div>
        <button
          onClick={() => {
            const opening = !showForm;
            setShowForm(opening);
            setEditingAgent(null);
            if (opening) setFormData((f) => ({ ...f, wallet: f.wallet || connectedStx() }));
          }}
          className={showForm ? "btn-ghost" : "btn-primary"}
          disabled={!connected || !!activeAction}
          title={!connected ? "Connect a wallet first" : undefined}
        >
          {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> Register Agent</>}
        </button>
      </div>

      {!connected && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm text-mist-300">
          <Wallet className="h-4 w-4 text-brand-300" /> Connect your wallet to register and rate agents.
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={loadAgents} className="font-medium underline underline-offset-2">Retry</button>
        </div>
      )}

      {(showForm || editingAgent) && (
        <form onSubmit={editingAgent ? handleUpdate : handleRegister} className="card mt-6 p-6">
          <h2 className="text-lg font-semibold">{editingAgent ? "Update Agent" : "Register New Agent"}</h2>
          {!editingAgent && (
            <p className="mt-1 text-sm text-mist-500">
              Connect your wallet, then register on Stacks {NETWORK_NAME} in seconds. Only a name and description are required.
            </p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="field" placeholder="My Agent" required />
            </div>
            <div>
              <label className="label">Agent Wallet</label>
              <input
                type="text"
                value={formData.wallet}
                readOnly
                onChange={(e) => setFormData({ ...formData, wallet: e.target.value })}
                className="field font-mono read-only:cursor-not-allowed read-only:opacity-70"
                placeholder="connect wallet to autofill"
                required
              />
              {!editingAgent && (
                <p className="mt-1.5 text-xs text-emerald-300">Bound to the connected wallet as proof of control.</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="field" rows={3} required />
            </div>
            <div>
              <label className="label">Endpoint Name (optional)</label>
              <input type="text" value={formData.endpointName} onChange={(e) => setFormData({ ...formData, endpointName: e.target.value })} className="field" placeholder="web, a2a, mcp" />
            </div>
            <div>
              <label className="label">Endpoint URL (optional)</label>
              <input type="url" value={formData.endpointUrl} onChange={(e) => setFormData({ ...formData, endpointUrl: e.target.value })} className="field" placeholder="https://…" />
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (editingAgent ? "Updating…" : "Registering…") : (editingAgent ? "Update Agent" : "Submit Registration")}
            </button>
            {editingAgent && (
              <button
                type="button"
                onClick={() => { setEditingAgent(null); setFormData({ name: "", description: "", wallet: "", endpointName: "", endpointUrl: "" }); }}
                className="btn-ghost"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="field pl-10" placeholder="Search name, wallet, capability or endpoint…" />
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-mist-300">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /> Verified
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-mist-300">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active
        </label>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Loading agents from chain…</p>
        </div>
      ) : visibleAgents.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <Fingerprint className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
          <p className="mt-3 text-mist-300">No agents registered yet. Be the first.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {visibleAgents.map((agent) => (
            <div key={agent.id} className="card card-hover p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand-300">
                    <Fingerprint className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <Link href={`/agents/${agent.id}`} className="text-base font-semibold text-white transition hover:text-brand-300">{agent.name}</Link>
                    <p className="mt-0.5 text-sm text-mist-300">{agent.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {reps[agent.id]?.verified && (
                    <span className="badge border-brand/30 text-brand-300">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                  {(reps[agent.id]?.count ?? 0) > 0 && (
                    <span className="badge border-amber-500/30 text-amber-300">
                      <Star className="h-3 w-3 fill-amber-300" /> {reps[agent.id].avg}/5
                      <span className="text-mist-500">({reps[agent.id].count})</span>
                    </span>
                  )}
                  <span className={`badge ${agent.active ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-mist-500"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${agent.active ? "bg-emerald-400" : "bg-mist-500"}`} />
                    {agent.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                <div className="flex gap-2"><dt className="text-mist-500">Creator</dt><dd className="truncate text-xs text-mist-300"><Addr value={agent.creator} /></dd></div>
                <div className="flex gap-2"><dt className="text-mist-500">Wallet</dt><dd className="truncate text-xs text-mist-300"><Addr value={agent.wallet} /></dd></div>
              </dl>
              {agent.endpoints.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {agent.endpoints.map((ep, i) => (
                    <span key={i} className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-mist-300">
                      <span className="text-mist-500">{ep.name}:</span> {ep.url}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                {agent.creator.toUpperCase() === address.toUpperCase() && (
                  <>
                    <button onClick={() => startEdit(agent)} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white" disabled={!!activeAction}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {agent.active && (
                      <button onClick={() => handleDeactivate(agent.id)} className="btn-sm border border-red-500/25 text-red-300 hover:bg-red-500/10" disabled={activeAction === `deactivating-${agent.id}`}>
                        <Power className="h-3.5 w-3.5" /> {activeAction === `deactivating-${agent.id}` ? "Deactivating…" : "Deactivate"}
                      </button>
                    )}
                  </>
                )}
                <Link href="/jobs?status=completed" className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white">
                  <Star className="h-3.5 w-3.5" /> Ratings come from completed jobs
                </Link>
              </div>
            </div>
          ))}
          {totalAgents > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <button className="btn-ghost" disabled={agentPage === 0} onClick={() => setAgentPage((value) => Math.max(0, value - 1))}>Previous</button>
              <span className="text-sm text-mist-500">Page {agentPage + 1} of {Math.ceil(totalAgents / PAGE_SIZE)}</span>
              <button className="btn-ghost" disabled={(agentPage + 1) * PAGE_SIZE >= totalAgents} onClick={() => setAgentPage((value) => value + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
