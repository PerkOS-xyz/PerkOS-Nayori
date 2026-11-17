'use client';

import { useState } from "react";
import { Users } from "lucide-react";
import { NEXT_LIMITS } from "../../constants/nayori-next";
import type { NextApplication, NextJob } from "../../services/nayori-next/parse";
import {
  acceptsApplications,
  formatNextAmount,
  nextApplicationActions,
  nextApplicationEntryActions,
} from "../../services/nayori-next/status";
import {
  buildApplyToJob,
  buildDeclineApplication,
  buildNameProvider,
  buildRegisterAgent,
  buildReleaseApplication,
  buildWithdrawApplication,
  type NextCallPayload,
} from "../../services/nayori-next/transactions";
import { NextAddr } from "./ui";

type Run = (
  key: string,
  label: string,
  build: () => NextCallPayload | Promise<NextCallPayload>,
  after?: () => void
) => Promise<void>;

interface Props {
  job: NextJob;
  applications: NextApplication[];
  wallet: string;
  isAgent: boolean;
  burnHeight: number;
  busy: string | null;
  run: Run;
}

const sats = (value: number) => `${value.toLocaleString("en-US")} sats`;

/**
 * The capped application list of an sBTC job, highest deposit first. Every deposit goes back to
 * its applicant: on withdraw, decline, when displaced by a higher deposit, or once the job closes.
 */
export default function NextApplications({ job, applications, wallet, isAgent, burnHeight, busy, run }: Props) {
  const [deposit, setDeposit] = useState(String(NEXT_LIMITS.applicationDeposit.min * 10));
  const [agent, setAgent] = useState({ name: "", uri: "" });
  const actions = nextApplicationActions({ job, wallet, burnHeight, applications, isAgent });
  const mine = applications.find((entry) => entry.applicant.toUpperCase() === wallet.toUpperCase());
  const full = applications.length >= NEXT_LIMITS.maxApplications;
  const lowest = applications[applications.length - 1];
  const accepting = acceptsApplications(job, burnHeight);
  const parties = [job.client, job.evaluator, job.treasury, job.appealAuthority];
  const disabled = Boolean(busy);

  return (
    <section className="card mt-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-5 w-5 text-brand-300" />
        <h2 className="text-lg font-semibold">Applications</h2>
        <span className="text-sm text-mist-500">
          {applications.length} of {NEXT_LIMITS.maxApplications}, highest deposit first
        </span>
      </div>
      <p className="mt-1 text-sm text-mist-400">
        Registered agents apply with a deposit of {sats(NEXT_LIMITS.applicationDeposit.min)} to{" "}
        {sats(NEXT_LIMITS.applicationDeposit.max)}. Every deposit goes back to its applicant. The
        client can also offer the job to any provider without the list.
        {!accepting && " This job no longer takes applications, so anyone can return the remaining deposits."}
      </p>

      {actions.includes("register") && (
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input
            className="field"
            value={agent.name}
            maxLength={64}
            onChange={(e) => setAgent({ ...agent, name: e.target.value })}
            placeholder="Agent name"
            aria-label="Agent name"
          />
          <input
            className="field"
            value={agent.uri}
            maxLength={256}
            onChange={(e) => setAgent({ ...agent, uri: e.target.value })}
            placeholder="Profile link (optional)"
            aria-label="Agent profile link"
          />
          <button
            className="btn-primary"
            disabled={disabled}
            onClick={() => void run("register", "Register agent", () => buildRegisterAgent(agent))}
          >
            {busy === "register" ? "Waiting for the wallet" : "Register to apply"}
          </button>
          <p className="text-xs text-mist-500 md:col-span-3">Only registered agents can apply. Registration is one transaction per wallet.</p>
        </div>
      )}

      {actions.includes("apply") && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="next-deposit">Deposit (sats)</label>
            <input
              id="next-deposit"
              className="field w-40"
              type="number"
              min={NEXT_LIMITS.applicationDeposit.min}
              max={NEXT_LIMITS.applicationDeposit.max}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={disabled}
            onClick={() =>
              void run("apply", "Apply to job", () =>
                buildApplyToJob({ jobId: job.id, deposit: Number(deposit), sender: wallet })
              )
            }
          >
            {busy === "apply" ? "Waiting for the wallet" : "Apply"}
          </button>
          {full && lowest && (
            <p className="w-full text-xs text-amber-300">
              The list is full. Deposit more than {sats(lowest.deposit)} to join; the lowest application is refunded.
            </p>
          )}
        </div>
      )}

      {mine && actions.includes("withdraw") && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-mist-300">
          Your deposit: {sats(mine.deposit)}
          <button
            className="btn-ghost"
            disabled={disabled}
            onClick={() =>
              void run("withdraw", "Withdraw application", () =>
                buildWithdrawApplication({ jobId: job.id, applicant: wallet, deposit: mine.deposit })
              )
            }
          >
            Withdraw and take the deposit back
          </button>
        </div>
      )}

      {applications.length === 0 ? (
        <p className="mt-4 text-sm text-mist-500">No applications yet.</p>
      ) : (
        <ol className="mt-4 divide-y divide-white/[0.06]">
          {applications.map((entry, index) => {
            const entryActions = nextApplicationEntryActions({ job, wallet, burnHeight }, entry);
            const input = { jobId: job.id, applicant: entry.applicant, deposit: entry.deposit };
            return (
              <li key={entry.applicant} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-8 text-mist-500">#{index + 1}</span>
                <NextAddr value={entry.applicant} className="text-mist-200" />
                <span className="text-mist-300">{formatNextAmount(entry.deposit, "sbtc")}</span>
                <span className="ml-auto flex flex-wrap gap-2">
                  {entryActions.includes("offer") && (
                    <button
                      className="btn-primary"
                      disabled={disabled}
                      onClick={() =>
                        void run("name-provider", "Offer job", () =>
                          buildNameProvider({ asset: "sbtc", jobId: job.id, provider: entry.applicant, parties })
                        )
                      }
                    >
                      Offer job
                    </button>
                  )}
                  {entryActions.includes("decline") && (
                    <button
                      className="btn-ghost"
                      disabled={disabled}
                      onClick={() => void run("decline", "Decline application", () => buildDeclineApplication(input))}
                    >
                      Decline
                    </button>
                  )}
                  {entryActions.includes("release") && (
                    <button
                      className="btn-ghost"
                      disabled={disabled}
                      onClick={() => void run("release", "Return deposit", () => buildReleaseApplication(input))}
                    >
                      Return deposit
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
