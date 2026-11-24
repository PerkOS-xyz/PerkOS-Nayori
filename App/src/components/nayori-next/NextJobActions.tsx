'use client';

import { useState } from "react";
import { NAYORI_NEXT, NEXT_LIMITS, nextEscrowContract } from "../../constants/nayori-next";
import { hasCriteriaCommitment } from "../../services/evaluable-jobs";
import { CommittedEvidenceForm } from "../EvaluableJob";
import type { NextJobDetail } from "../../services/nayori-next/reads";
import {
  appellantFor,
  formatNextAmount,
  nextJobActions,
  settlementPreview,
  type NextActionKey,
} from "../../services/nayori-next/status";
import {
  buildAcceptJob,
  buildAppeal,
  buildCloseUnfunded,
  buildFundJob,
  buildNameProvider,
  buildRateProvider,
  buildRecordDecision,
  buildRecordDefaultApproval,
  buildRefundNoDelivery,
  buildResolveAppeal,
  buildRetryReputation,
  buildSettleJob,
  buildSubmitWork,
  deliverableCommitment,
  evidenceHashFrom,
  type NextCallPayload,
} from "../../services/nayori-next/transactions";
import { shortAddr } from "../../utils/format";

type Run = (
  key: string,
  label: string,
  build: () => NextCallPayload | Promise<NextCallPayload>,
  after?: () => void
) => Promise<void>;

interface Props {
  detail: NextJobDetail;
  wallet: string;
  burnHeight: number;
  busy: string | null;
  run: Run;
}

/** The actions the connected wallet can take on this job now, one card each. */
export default function NextJobActions({ detail, wallet, burnHeight, busy, run }: Props) {
  const { job } = detail;
  const actions = nextJobActions({
    job,
    wallet,
    burnHeight,
    submission: detail.submission,
    decision: detail.decision,
    escrow: detail.escrow,
    rated: detail.rated,
    reputationPending: detail.reputationPending,
  });
  const [provider, setProvider] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [note, setNote] = useState("");
  const [score, setScore] = useState(5);
  const ref = { asset: job.asset, jobId: job.id };
  const amount = (value: number) => formatNextAmount(value, job.asset);
  const parties = [job.client, job.evaluator, job.treasury, job.appealAuthority];
  const isBusy = (key: NextActionKey) => busy === key;

  if (actions.length === 0) {
    return (
      <p className="text-sm text-mist-500">
        {wallet
          ? "Nothing for this wallet to do on this job right now."
          : "Connect a wallet to see the steps you can take."}
      </p>
    );
  }

  const button = (key: NextActionKey, label: string, build: () => NextCallPayload | Promise<NextCallPayload>, after?: () => void, tone = "btn-primary") => (
    <button
      key={`${key}-${label}`}
      className={tone}
      disabled={Boolean(busy)}
      onClick={() => void run(key, label, build, after)}
    >
      {isBusy(key) ? "Waiting for the wallet" : label}
    </button>
  );

  const cards: Record<NextActionKey, () => React.ReactNode> = {
    fund: () => (
      <Card title="Fund the budget" text={`Moves exactly ${amount(job.budget)} from your wallet into escrow. The wallet blocks any other transfer.`}>
        {button("fund", `Fund ${amount(job.budget)}`, () => buildFundJob({ ...ref, budget: job.budget, sender: wallet }))}
      </Card>
    ),
    "name-provider": () => (
      <Card
        title={job.provider ? "Change the offer" : "Offer the job to a provider"}
        text="Name the provider wallet. You can change the offer until the provider accepts. You can also offer the job to an applicant below."
      >
        <input
          className="field font-mono"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="Provider address"
          aria-label="Provider address"
        />
        {button("name-provider", "Offer job", () => buildNameProvider({ ...ref, provider: provider.trim(), parties }), () => setProvider(""))}
      </Card>
    ),
    accept: () => (
      <Card title="Accept the job" text={`Accepting starts your delivery window of ${job.deliveryBlocks} Bitcoin blocks.`}>
        {button("accept", "Accept job", () => buildAcceptJob(ref))}
      </Card>
    ),
    submit: () => hasCriteriaCommitment(job.description) ? (
      <Card title="Submit the work" text="This job has acceptance criteria, so Nayori's evaluator checks your evidence against them.">
        <CommittedEvidenceForm
          context={{
            network: NAYORI_NEXT.network,
            asset: job.asset,
            contract: nextEscrowContract(job.asset),
            client: job.client,
            evaluator: job.evaluator,
          }}
          scope={nextEscrowContract(job.asset)}
          jobId={job.id}
          description={job.description}
          provider={wallet}
          busy={Boolean(busy)}
          onSubmit={(bytes) => run("submit", "Submit work", () => buildSubmitWork({ ...ref, deliverable: bytes }))}
        />
      </Card>
    ) : (
      <Card title="Submit the work" text="Enter a link, CID or short description. Its SHA-256 hash is stored on-chain as your delivery commitment.">
        <input
          className="field"
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
          placeholder="https://... or ipfs://..."
          aria-label="Deliverable"
        />
        {button(
          "submit",
          "Submit work",
          async () => buildSubmitWork({ ...ref, deliverable: await deliverableCommitment(deliverable) }),
          () => setDeliverable("")
        )}
      </Card>
    ),
    decide: () => {
      const approve = settlementPreview(job, "approve");
      const reject = settlementPreview(job, "reject");
      return (
        <Card
          title="Record your decision"
          text={`Approve pays ${amount(approve.net)} to the provider. Reject returns ${amount(reject.net)} to the client. Either way ${amount(approve.fee)} goes to the treasury. The other side can appeal for ${NEXT_LIMITS.appealBlocks} Bitcoin blocks before settlement.`}
        >
          <EvidenceInput value={note} onChange={setNote} />
          <div className="flex flex-wrap gap-2">
            {button("decide", "Approve", async () => buildRecordDecision({ ...ref, decision: "approve", evidenceHash: await evidenceHashFrom(note) }), () => setNote(""))}
            {button("decide", "Reject", async () => buildRecordDecision({ ...ref, decision: "reject", evidenceHash: await evidenceHashFrom(note) }), () => setNote(""), "btn-ghost")}
          </div>
        </Card>
      );
    },
    "default-approval": () => (
      <Card title="Record the default approval" text="The review window passed without a decision. Anyone can record an approval now. It can still be appealed.">
        {button("default-approval", "Record default approval", () => buildRecordDefaultApproval(ref))}
      </Card>
    ),
    appeal: () => (
      <Card
        title="Appeal the decision"
        text={`You can appeal until the deadline shown above. The appeal authority ${shortAddr(job.appealAuthority)} then reviews the job.`}
      >
        <EvidenceInput value={note} onChange={setNote} />
        {button("appeal", "Appeal", async () => buildAppeal({ ...ref, evidenceHash: await evidenceHashFrom(note) }), () => setNote(""))}
      </Card>
    ),
    "resolve-appeal": () => (
      <Card title="Resolve the appeal" text={`Your decision settles the job in the same transaction. The escrow pays out exactly ${amount(job.budget)}.`}>
        <EvidenceInput value={note} onChange={setNote} />
        <div className="flex flex-wrap gap-2">
          {button("resolve-appeal", "Approve and pay the provider", async () =>
            buildResolveAppeal({ ...ref, budget: job.budget, decision: "approve", resolutionHash: await evidenceHashFrom(note) }), () => setNote(""))}
          {button("resolve-appeal", "Reject and return to the client", async () =>
            buildResolveAppeal({ ...ref, budget: job.budget, decision: "reject", resolutionHash: await evidenceHashFrom(note) }), () => setNote(""), "btn-ghost")}
        </div>
      </Card>
    ),
    settle: () => {
      const preview = detail.decision ? settlementPreview(job, detail.decision.decision) : null;
      return (
        <Card
          title="Settle the job"
          text={
            preview
              ? `The decision stands. ${shortAddr(preview.winner ?? "")} receives ${amount(preview.net)} and the treasury receives ${amount(preview.fee)}. Anyone can send this.`
              : "Anyone can settle the job now."
          }
        >
          {button("settle", "Settle job", () => buildSettleJob({ ...ref, budget: job.budget }))}
        </Card>
      );
    },
    refund: () => (
      <Card title="Refund the client" text={`Nothing was delivered by the deadline. The full ${amount(job.budget)} goes back to the client, with no fee. Anyone can send this.`}>
        {button("refund", "Refund client", () => buildRefundNoDelivery({ ...ref, budget: job.budget }))}
      </Card>
    ),
    close: () => (
      <Card title="Close the unfunded job" text="The job was never funded and its deadline passed. No funds move.">
        {button("close", "Close job", () => buildCloseUnfunded(ref), undefined, "btn-ghost")}
      </Card>
    ),
    rate: () => (
      <Card title="Rate the provider" text="One rating per completed job, from 1 to 5. It is added to the provider's on-chain record.">
        <select className="field w-32" value={score} onChange={(e) => setScore(Number(e.target.value))} aria-label="Rating">
          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {button("rate", "Save rating", () => buildRateProvider({ ...ref, score }))}
      </Card>
    ),
    "retry-reputation": () => (
      <Card title="Record the outcome" text="The reputation registry did not take this outcome at settlement. Anyone can record it again.">
        {button("retry-reputation", "Record outcome", () => buildRetryReputation(ref), undefined, "btn-ghost")}
      </Card>
    ),
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {actions.map((key) => (
        <div key={key}>{cards[key]()}</div>
      ))}
      {detail.decision && job.status === 5 && !actions.includes("appeal") && wallet && (
        <p className="text-xs text-mist-500 md:col-span-2">
          Only {shortAddr(appellantFor(job, detail.decision) ?? "")} can appeal this decision.
        </p>
      )}
    </div>
  );
}

function Card({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="card flex h-full flex-col gap-3 p-5">
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-mist-400">{text}</p>
      </div>
      <div className="mt-auto flex flex-col gap-2">{children}</div>
    </div>
  );
}

function EvidenceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <>
      <textarea
        className="field"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Reason or evidence link, or a 32-byte hex digest"
        aria-label="Evidence"
      />
      <p className="text-xs text-mist-500">Only the SHA-256 hash of this note is stored on-chain. Keep the note to show it later.</p>
    </>
  );
}
