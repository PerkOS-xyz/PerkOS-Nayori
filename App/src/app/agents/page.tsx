'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Power, Fingerprint, Star, BadgeCheck, Wallet } from "lucide-react";
import { getAgent, getAgentCount, Agent } from "../../services/agent-registry";
import { getReputation, rateAgent } from "../../services/reputation";
import { isVerified } from "../../services/validation";
import { trackTx, txIdOf } from "../../services/tx";
import Addr from "../../components/Addr";
import { useToast } from "../../components/Toast";
import { request, getLocalStorage, isConnected } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { CONTRACT_ADDRESS } from "../../constants/contract";
import { NETWORK_NAME } from "../../constants/network";

const AGENT_REGISTRY = `${CONTRACT_ADDRESS}.agent-registry` as `${string}.${string}`;

const connectedStx = () => getLocalStorage()?.addresses?.stx?.[0]?.address ?? "";

export default function AgentsPage() {
  const toast = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connected, setConnected] = useState(false);
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
  const [ratingFor, setRatingFor] = useState<number | null>(null);
  const [ratingScore, setRatingScore] = useState(5);

  useEffect(() => {
    setConnected(isConnected());
    loadAgents();
  }, []);

  async function loadAgents() {
    setLoading(true);
    setError(null);
    try {
      const count = await getAgentCount();
      const ids = Array.from({ length: count }, (_, i) => i + 1);
      const agentList = (await Promise.all(ids.map((i) => getAgent(i)))).filter(Boolean) as Agent[];
      setAgents(agentList);
      // Load on-chain reputation + verification per agent (keyed by wallet).
      const entries = await Promise.all(
        agentList.map(async (a) => {
          const [rep, verified] = await Promise.all([getReputation(a.wallet), isVerified(a.wallet)]);
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
      toast.error("Transaction cancelled or failed");
    } finally {
      setActiveAction(null);
    }
  }

  const resetForm = () => setFormData({ name: "", description: "", wallet: "", endpointName: "", endpointUrl: "" });

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
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

  async function handleRate(agent: Agent, score: number) {
    setActiveAction(`rating-${agent.id}`);
    try {
      const res = await rateAgent(agent.wallet, score, 0, "Rated via PerkOS");
      setRatingFor(null);
      const id = txIdOf(res);
      if (id) trackTx(id, toast, loadAgents);
    } catch (error) {
      console.error("Error rating agent:", error);
      toast.error("Transaction cancelled or failed");
    } finally {
      setActiveAction(null);
    }
  }

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
          disabled={!!activeAction}
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
              <input type="text" value={formData.wallet} onChange={(e) => setFormData({ ...formData, wallet: e.target.value })} className="field font-mono" placeholder="connect wallet to autofill" required />
              {!editingAgent && (
                <button type="button" onClick={() => setFormData((f) => ({ ...f, wallet: connectedStx() }))} className="mt-1.5 text-xs text-brand-400 hover:text-brand-300">
                  Use my connected wallet
                </button>
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

      {loading ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="mt-3 text-sm text-mist-500">Loading agents from chain…</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <Fingerprint className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
          <p className="mt-3 text-mist-300">No agents registered yet. Be the first.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {agents.map((agent) => (
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

              {ratingFor === agent.id && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <span className="text-sm text-mist-300">Your rating</span>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setRatingScore(s)} className="p-0.5" aria-label={`${s} stars`}>
                      <Star className={`h-5 w-5 ${s <= ratingScore ? "fill-amber-300 text-amber-300" : "text-mist-500"}`} />
                    </button>
                  ))}
                  <button onClick={() => handleRate(agent, ratingScore)} className="btn-sm ml-auto bg-brand text-white hover:bg-brand-600" disabled={activeAction === `rating-${agent.id}`}>
                    {activeAction === `rating-${agent.id}` ? "Submitting…" : "Submit"}
                  </button>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                <button onClick={() => setRatingFor(ratingFor === agent.id ? null : agent.id)} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white" disabled={!!activeAction}>
                  <Star className="h-3.5 w-3.5" /> Rate
                </button>
                <button onClick={() => startEdit(agent)} className="btn-sm border border-white/[0.12] text-mist-300 hover:text-white" disabled={!!activeAction}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {agent.active && (
                  <button onClick={() => handleDeactivate(agent.id)} className="btn-sm border border-red-500/25 text-red-300 hover:bg-red-500/10" disabled={activeAction === `deactivating-${agent.id}`}>
                    <Power className="h-3.5 w-3.5" /> {activeAction === `deactivating-${agent.id}` ? "Deactivating…" : "Deactivate"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
