'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Hand, Users } from "lucide-react";
import Addr from "./Addr";
import { JOB_APPLICATIONS_ENABLED } from "../constants/contract";
import type { Agent } from "../services/agent-registry";
import {
  applyToJob,
  findAgentsByWallet,
  getApplications,
  MAX_NOTE_LENGTH,
  withdrawApplication,
  type ApplicationCurrency,
  type JobApplication,
} from "../services/job-applications";

type RunTx = (
  fn: () => Promise<any>,
  actionKey: string,
  label: string,
  after?: () => void,
  onStatus?: (status: "pending" | "success" | "failed") => void
) => Promise<void> | void;

interface Props {
  job: {
    id: number;
    status: number;
    client: string;
    evaluator: string;
    provider?: string | null;
    appealAuthority?: string;
    treasury?: string;
  };
  currency: ApplicationCurrency;
  address: string;
  connected: boolean;
  busy: boolean;
  run: RunTx;
  onAssign: (provider: string) => void;
}

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toUpperCase() === b.toUpperCase());

// Open marketplace flow: a provider agent applies on-chain, the client assigns the winner.
export default function JobApplications({ job, currency, address, connected, busy, run, onAssign }: Props) {
  const takesApplications = JOB_APPLICATIONS_ENABLED && (job.status === 0 || job.status === 1) && !job.provider;
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!takesApplications) return;
    try {
      setApplications(await getApplications(currency, job.id));
    } catch (error) {
      console.error("Error loading job applications:", error);
    }
  }, [takesApplications, currency, job.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!takesApplications || !open || !address) return;
    let cancelled = false;
    findAgentsByWallet(address)
      .then((found) => {
        if (cancelled) return;
        setAgents(found);
        setAgentId(found[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setAgents([]); });
    return () => { cancelled = true; };
  }, [takesApplications, open, address]);

  if (!takesApplications) return null;

  const isClient = same(job.client, address);
  const isParty = isClient || same(job.evaluator, address) ||
    same(job.appealAuthority, address) || same(job.treasury, address);
  const mine = applications.find((entry) => same(entry.applicant, address));
  const refreshOnSuccess = (status: "pending" | "success" | "failed") => {
    if (status !== "success") return;
    void load();
    setTimeout(() => void load(), 6_000);
  };

  return (
    <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-mist-300">
          <Users className="h-4 w-4" />
          Open to provider agents · {applications.length} {applications.length === 1 ? "application" : "applications"}
        </span>
        {connected && !isParty && !mine && (
          <button type="button" disabled={busy} onClick={() => setOpen((value) => !value)}
            className="btn-sm inline-flex items-center gap-1.5 bg-brand text-white hover:bg-brand-600 disabled:opacity-50">
            <Hand className="h-3.5 w-3.5" /> Take this job
          </button>
        )}
        {mine && (
          <button type="button" disabled={busy}
            onClick={() => void run(() => withdrawApplication(currency, job.id), `withdrawing-application-${job.id}`,
              "Withdraw application", undefined, refreshOnSuccess)}
            className="btn-sm border border-white/10 text-mist-300 hover:bg-white/[0.04] disabled:opacity-50">
            Applied · Withdraw
          </button>
        )}
      </div>

      {open && !mine && !isParty && (
        <div className="mt-3 space-y-2">
          {agents === null && <p className="text-xs text-mist-500">Looking for agents registered to this wallet…</p>}
          {agents?.length === 0 && (
            <p className="text-xs text-amber-200">
              This wallet has no active registered agent. <Link href="/agents" className="underline">Register your agent</Link> first,
              then come back to take the job.
            </p>
          )}
          {agents && agents.length > 0 && (
            <>
              <select value={agentId ?? ""} onChange={(event) => setAgentId(Number(event.target.value))} className="field">
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>#{agent.id} · {agent.name}</option>
                ))}
              </select>
              <input type="text" value={note} maxLength={MAX_NOTE_LENGTH} onChange={(event) => setNote(event.target.value)}
                className="field" placeholder="Short note to the client (optional, stored on-chain)" />
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || agentId === null}
                  onClick={() => agentId !== null && void run(() => applyToJob(currency, job.id, agentId, note),
                    `applying-${job.id}`, "Apply to job", () => setOpen(false), refreshOnSuccess)}
                  className="btn-sm bg-brand text-white hover:bg-brand-600 disabled:opacity-50">
                  Submit application
                </button>
                <span className="text-xs text-mist-500">
                  Applying moves no funds. The client confirms by assigning you on the escrow.
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {applications.length > 0 && (
        <ul className="mt-3 space-y-2">
          {applications.map((entry) => (
            <li key={entry.applicant} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] px-3 py-2">
              <div className="min-w-0">
                <div className="text-mist-200">
                  {entry.agentName ?? "Agent"} <span className="text-mist-500">#{entry.agentId}</span>
                </div>
                <div className="truncate text-xs text-mist-400"><Addr value={entry.applicant} /></div>
                {entry.note && <p className="mt-1 text-xs text-mist-400">{entry.note}</p>}
              </div>
              {isClient && (
                job.status === 1 ? (
                  <button type="button" disabled={busy} onClick={() => onAssign(entry.applicant)}
                    className="btn-sm bg-brand text-white hover:bg-brand-600 disabled:opacity-50">
                    Assign
                  </button>
                ) : (
                  <span className="text-xs text-mist-500">Fund the job to assign</span>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
