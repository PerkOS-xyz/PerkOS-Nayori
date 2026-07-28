'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Fingerprint, Star, BadgeCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { getAgent, Agent } from "../../../services/agent-registry";
import { getReputation, rateAgent, Reputation } from "../../../services/reputation";
import { getVerification, isVerified, Verification } from "../../../services/validation";
import { trackTx, txIdOf } from "../../../services/tx";
import Addr from "../../../components/Addr";
import { useToast } from "../../../components/Toast";

export default function AgentDetailPage() {
  const id = Number(useParams().id);
  const toast = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [rep, setRep] = useState<Reputation | null>(null);
  const [ver, setVer] = useState<Verification | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ratingScore, setRatingScore] = useState(5);
  const [rating, setRating] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    const a = await getAgent(id);
    setAgent(a);
    if (a) {
      const [r, v, isv] = await Promise.all([getReputation(a.wallet), getVerification(a.wallet), isVerified(a.wallet)]);
      setRep(r);
      setVer(v);
      setVerified(isv);
    }
    setLoading(false);
  }

  async function rate() {
    if (!agent) return;
    setRating(true);
    try {
      const res = await rateAgent(agent.wallet, ratingScore, 0, "Rated via PerkOS");
      const txid = txIdOf(res);
      if (txid) trackTx(txid, toast, load);
    } catch (e) {
      console.error(e);
      toast.error("Transaction cancelled or failed");
    } finally {
      setRating(false);
    }
  }

  if (loading) {
    return (
      <div className="container-x py-20 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container-x py-12">
        <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </Link>
        <p className="mt-8 text-mist-300">Agent #{id} not found.</p>
      </div>
    );
  }

  return (
    <div className="container-x py-12">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      <div className="mt-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand-300">
          <Fingerprint className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
            {verified && (
              <span className="badge border-brand/30 text-brand-300"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>
            )}
            <span className={`badge ${agent.active ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-mist-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${agent.active ? "bg-emerald-400" : "bg-mist-500"}`} />
              {agent.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-mist-300">{agent.description}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs text-mist-500">Creator</p>
          <p className="mt-1 text-sm"><Addr value={agent.creator} className="text-mist-200" /></p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-mist-500">Wallet</p>
          <p className="mt-1 text-sm"><Addr value={agent.wallet} className="text-mist-200" /></p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-mist-500">Agent ID</p>
          <p className="mt-1 font-mono text-sm text-mist-200">#{agent.id}</p>
        </div>
      </div>

      {agent.endpoints.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.endpoints.map((ep, i) => (
            <a key={i} href={ep.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-mist-300 hover:text-white">
              <span className="text-mist-500">{ep.name}:</span> {ep.url}
            </a>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* Reputation */}
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-mist-500">
            <Star className="h-4 w-4" /> Reputation
          </h2>
          {rep && rep.ratingCount > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Metric label="Average score" value={`${rep.averageScore}/5`} />
              <Metric label="Ratings" value={String(rep.ratingCount)} />
              <Metric label="Completed jobs" value={String(rep.completedJobs)} />
              <Metric label="Disputed jobs" value={String(rep.disputedJobs)} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-mist-500">No ratings yet. Be the first to rate this agent.</p>
          )}

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <p className="text-sm text-mist-300">Rate this agent</p>
            <div className="mt-2 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setRatingScore(s)} aria-label={`${s} stars`} className="p-0.5">
                  <Star className={`h-6 w-6 ${s <= ratingScore ? "fill-amber-300 text-amber-300" : "text-mist-500"}`} />
                </button>
              ))}
              <button onClick={rate} disabled={rating} className="btn-sm ml-auto bg-brand text-white hover:bg-brand-600">
                {rating ? "Submitting…" : "Submit rating"}
              </button>
            </div>
          </div>
        </div>

        {/* Validation */}
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-mist-500">
            <BadgeCheck className="h-4 w-4" /> Validation
          </h2>
          {verified && ver ? (
            <div className="mt-4 space-y-3">
              <p className="inline-flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Verified on-chain</p>
              <div>
                <p className="text-xs text-mist-500">Verified by</p>
                <p className="mt-0.5 text-sm"><Addr value={ver.verifiedBy} className="text-mist-200" /></p>
              </div>
              {ver.capabilities.length > 0 && (
                <div>
                  <p className="text-xs text-mist-500">Capabilities</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {ver.capabilities.map((c, i) => (
                      <span key={i} className="rounded-md border border-brand/25 bg-brand/10 px-2 py-0.5 text-xs text-brand-300">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-mist-500"><AlertCircle className="h-4 w-4" /> Not yet verified.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-mist-500">{label}</p>
    </div>
  );
}
