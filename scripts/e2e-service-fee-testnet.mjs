// Twenty controlled contract paths: ten scenarios for each of STX and canonical sBTC.
// This does not exercise the browser, Hermes, LLM evaluator or hosted x402 service.
import { pathToFileURL } from "node:url";
import {
  Cl,
  ClarityType,
  cvToValue,
  deserializeCV,
} from "@stacks/transactions";
import {
  DEPLOYER,
  EVALUATOR,
  AUTHORITY,
  CONTRACTS,
  REPUTATION,
  SBTC,
  CALL_FEE,
  SafetyError,
  ensure,
  sha256,
  plain,
  guard,
  roles,
  release,
  signer,
  info,
  sources,
  read,
  ok,
  verifyConfig,
  account,
  nonce,
  Journal,
  call,
  callIntent,
  tokenArgs,
  verifyTransfers,
  get,
} from "./service-fee-testnet-core.mjs";

export const SCENARIOS = {
  "approve-no-appeal": { original: 1, final: 1, wait: "appeal" },
  "reject-no-appeal": { original: 2, final: 2, wait: "appeal" },
  "approve-appeal-resolve-reject": { original: 1, final: 2 },
  "reject-appeal-resolve-approve": { original: 2, final: 1 },
  "approve-appeal-timeout": { original: 1, final: 1, wait: "resolution" },
  "review-timeout": { wait: "review" },
  "waive-approve": { original: 2, final: 1, waiver: true },
  "waive-reject": { original: 1, final: 2, waiver: true },
  "refund-approve": { original: 2, final: 1, refund: true },
  "refund-reject": { original: 1, final: 2, refund: true },
};
export function scenario(asset, name) {
  ensure(
    Object.hasOwn(CONTRACTS, asset) && Object.hasOwn(SCENARIOS, name),
    "Unknown fee E2E asset/scenario",
  );
  return {
    ...SCENARIOS[name],
    asset,
    name,
    contract: CONTRACTS[asset],
    budget: asset === "stx" ? 100000n : 1000n,
  };
}
export function economics(spec, actors) {
  const charged =
    spec.wait === "review" || spec.waiver ? 0n : spec.budget / 50n;
  return {
    gross: spec.budget,
    charged,
    net: spec.budget - charged,
    refunded: spec.refund ? charged : 0n,
    recipient: spec.final === 2 ? actors.client : actors.provider,
    status: spec.wait === "review" ? 6 : spec.final === 1 ? 3 : 4,
  };
}
export function fundingRequirements(spec) {
  // Conservative role ceilings checked before opening a fresh escrow. No automatic top-ups.
  return {
    client: 6n * CALL_FEE + (spec.asset === "stx" ? spec.budget : 0n),
    provider: 2n * CALL_FEE,
    evaluator: spec.wait === "review" ? 0n : CALL_FEE,
    authority: spec.wait ? 0n : 2n * CALL_FEE,
    treasury: spec.refund ? CALL_FEE : 0n,
  };
}
export function deadlineGate(current, deadline) {
  ensure(deadline !== null && deadline !== undefined, "Missing burn deadline");
  const height = BigInt(current),
    limit = BigInt(deadline);
  return {
    ready: height > limit,
    blocksRemaining: String(height > limit ? 0n : limit - height + 1n),
    requiredBurnHeight: String(limit + 1n),
  };
}
export function verifyLedger(policy, spec, actors) {
  const e = economics(spec, actors);
  ensure(
    policy.treasury === actors.treasury &&
      policy["basis-points"] === "200" &&
      policy["fee-amount"] === String(spec.budget / 50n),
    "Job fee policy differs",
  );
  if (spec.wait === "review")
    ensure(
      policy["service-recorded"] === false &&
        policy.waiver === null &&
        policy.settlement === null,
      "No-service path fabricated a charge or waiver",
    );
  else {
    ensure(
      policy["service-recorded"] === true &&
        Boolean(policy.waiver) === (!!spec.waiver || !!spec.refund),
      "Service/waiver flags differ",
    );
    const s = policy.settlement;
    ensure(
      s &&
        s.gross === String(e.gross) &&
        s.recipient === e.recipient &&
        s.net === String(e.net) &&
        s["charged-fee"] === String(e.charged) &&
        s["refunded-fee"] === String(e.refunded),
      "Settlement ledger differs from approved scenario",
    );
  }
}
async function allEvents(tx) {
  ensure(
    Number.isSafeInteger(tx.event_count) &&
      tx.event_count >= 0 &&
      tx.event_count <= 2000,
    "Unexpected event count",
  );
  const events = [...(tx.events || [])];
  while (events.length < tx.event_count) {
    const page = await get(
      `/extended/v1/tx/${tx.tx_id}?event_limit=200&event_offset=${events.length}`,
    );
    ensure(
      page.canonical === true &&
        page.tx_id === tx.tx_id &&
        page.events?.length > 0,
      "Incomplete canonical event page",
    );
    events.push(...page.events);
  }
  ensure(
    events.length === tx.event_count &&
      new Set(events.map((e) => e.event_index)).size === events.length,
    "Incomplete or duplicate events",
  );
  return events;
}
function verifyPrint(events, contract, name, jobId) {
  const matches = events
    .filter(
      (e) =>
        e.event_type === "smart_contract_log" &&
        e.contract_log.contract_id === contract,
    )
    .map((e) => plain(cvToValue(deserializeCV(e.contract_log.value.hex))))
    .filter((e) => e.event === name && e["job-id"] === String(jobId));
  ensure(
    matches.length === 1,
    `Expected exactly one ${name} event for this job`,
  );
}
export async function preflight(spec, actors) {
  const chain = await info();
  await sources(true);
  for (const name of Object.values(CONTRACTS)) {
    verifyConfig(ok(await read(name, "get-protocol-config")), actors.treasury);
    ensure(
      ok(await read(name, "get-owner")) === DEPLOYER,
      "Unexpected candidate owner",
    );
    ensure(
      cvToValue(
        await read(REPUTATION, "is-registered-caller", [
          Cl.principal(`${DEPLOYER}.${name}`),
        ]),
      ) === true,
      "Candidate is not authorized for reputation",
    );
  }
  ensure(
    ok(await read(CONTRACTS.sbtc, "get-payment-token")) === SBTC,
    "Canonical testnet sBTC not configured",
  );
  const balances = {};
  for (const [role, address] of Object.entries(actors)) {
    const b = await account(address);
    balances[role] = {
      address,
      stx: String(b.stx),
      sbtc: String(b.sbtc),
      nonce: String(await nonce(address)),
    };
  }
  const required = fundingRequirements(spec);
  const ready =
    Object.entries(required).every(
      ([role, amount]) => BigInt(balances[role].stx) >= amount,
    ) &&
    (spec.asset !== "sbtc" || BigInt(balances.client.sbtc) >= spec.budget);
  return {
    network: "testnet",
    asset: spec.asset,
    scenario: spec.name,
    budget: String(spec.budget),
    maximumCalls: 14,
    maximumCallFeesMicroStx: String(14n * CALL_FEE),
    balances,
    requiredMicroStx: Object.fromEntries(
      Object.entries(required).map(([role, amount]) => [role, String(amount)]),
    ),
    ready,
    burnBlockHeight: chain.burn_block_height,
    stacksTipHeight: chain.stacks_tip_height,
  };
}
export async function main(env = process.env) {
  const action = guard(env, "run");
  const spec = scenario(env.SERVICE_FEE_ASSET, env.SERVICE_FEE_SCENARIO);
  const actors = roles(
    env.SERVICE_FEE_TREASURY_ADDRESS,
    env.SERVICE_FEE_PROVIDER_ADDRESS,
  );
  ensure(actors.provider, "An explicit persistent QA provider is required");
  const sha = release(env, action === "run");
  const report = await preflight(spec, actors);
  console.log(
    JSON.stringify({ action, sourceCommit: sha, ...report }, null, 2),
  );
  if (action === "preflight") return report;
  const journal = new Journal(env.SERVICE_FEE_RESULT_PATH, {
    kind: "e2e",
    sourceCommit: sha,
    network: "testnet",
    asset: spec.asset,
    scenario: spec.name,
    budget: String(spec.budget),
    actors,
  });
  try {
    journal.data.preflight = report;
    journal.save();
    if (!journal.data.transactions.create)
      ensure(
        report.ready,
        "Fund every required QA role before opening a new escrow; see preflight balances",
      );
    // Load only dedicated local signer inputs, after all public source/network/role checks.
    const keys = {
      client: signer(
        env.SERVICE_FEE_ACTORS_ENV_PATH,
        actors.client,
        "DEPLOYER_PRIVATE_KEY",
      ),
      evaluator: signer(
        env.SERVICE_FEE_ACTORS_ENV_PATH,
        actors.evaluator,
        "QA_EVALUATOR_PRIVATE_KEY",
      ),
      authority: signer(
        env.SERVICE_FEE_ACTORS_ENV_PATH,
        actors.authority,
        "QA_APPEAL_AUTHORITY_PRIVATE_KEY",
      ),
      provider: signer(
        env.SERVICE_FEE_PROVIDER_ENV_PATH,
        actors.provider,
        "QA_PROVIDER_PRIVATE_KEY",
      ),
      ...(spec.refund
        ? {
            treasury: signer(
              env.SERVICE_FEE_TREASURY_ENV_PATH,
              actors.treasury,
              "NAYORI_QA_TREASURY_PRIVATE_KEY",
            ),
          }
        : {}),
    };
    const name = spec.contract,
      contract = `${DEPLOYER}.${name}`;
    const digestHex = (label) =>
      sha256(
        `nayori-fee-qa:${sha}:${spec.asset}:${spec.name}:${journal.data.jobId || "new"}:${label}`,
      );
    const digest = (label) => Cl.bufferFromHex(digestHex(label));
    let jobId;
    const job = async () => ok(await read(name, "get-job", [Cl.uint(jobId)]));
    const fee = async () =>
      ok(await read(name, "get-job-service-fee", [Cl.uint(jobId)]));
    const escrow = async () =>
      BigInt(ok(await read(name, "get-escrow-balance", [Cl.uint(jobId)])));
    const decision = async () => {
      const value = ok(await read(name, "get-decision", [Cl.uint(jobId)]));
      ensure(
        value["original-decision"] === String(spec.original) &&
          String(value["evidence-hash"]).replace(/^0x/, "") ===
            digestHex("evidence") &&
          String(value["explanation-hash"]).replace(/^0x/, "") ===
            digestHex("explanation"),
        "Decision intent or evidence hashes differ",
      );
      return value;
    };
    async function identity() {
      const value = await job();
      ensure(
        value.client === actors.client &&
          value.evaluator === actors.evaluator &&
          value.treasury === actors.treasury &&
          value["appeal-authority"] === actors.authority &&
          (value.provider === null || value.provider === actors.provider),
        "Job role binding differs",
      );
      if (Number(value.status) >= 2)
        ensure(
          String(value.deliverable).replace(/^0x/, "") ===
            digestHex("deliverable"),
          "Deliverable hash differs from this run",
        );
      return value;
    }
    async function invoke(
      label,
      fn,
      args,
      role,
      { state, amount = 0n, from = contract, legs = [] } = {},
    ) {
      const existed = !!journal.data.transactions[label];
      if (!existed) {
        if (state !== undefined) {
          const current = await identity();
          ensure(
            Number(current.status) === state,
            `Unexpected state before ${label}`,
          );
          if (fn !== "set-budget")
            ensure(
              current.budget === String(spec.budget),
              "Live budget differs",
            );
          ensure(
            (await escrow()) ===
              ([1, 2, 7, 8].includes(state) ? spec.budget : 0n),
            "Live escrow differs before signing",
          );
          if (state >= 2)
            ensure(
              current.provider === actors.provider,
              "Provider not pinned before signing",
            );
        }
        const b = await account(actors[role]);
        const roleOutflow = from === actors[role] ? amount : 0n;
        ensure(
          b.stx >= CALL_FEE + (spec.asset === "stx" ? roleOutflow : 0n),
          `Insufficient testnet STX for ${role}`,
        );
        if (spec.asset === "sbtc")
          ensure(
            b.sbtc >= roleOutflow,
            `Insufficient canonical testnet sBTC for ${role}`,
          );
      }
      const intent = callIntent(
        name,
        fn,
        args,
        actors[role],
        amount ? { asset: spec.asset, sender: from, amount } : undefined,
      );
      const tx = await call(journal, label, intent, keys[role], args);
      ensure(
        fn === "create-job"
          ? /^\(ok u[1-9]\d*\)$/.test(tx.tx_result?.repr || "")
          : tx.tx_result?.repr === "(ok true)",
        "Contract call did not return expected success",
      );
      const events = await allEvents(tx);
      verifyTransfers(events, spec.asset, legs);
      journal.check(`${label}: canonical exact transfer events`, true);
      return { tx, events, fresh: !existed };
    }
    const e = economics(spec, actors);
    if (!journal.data.expiredAt) {
      journal.data.expiredAt = String(BigInt(report.stacksTipHeight) + 500n);
      journal.save();
    }
    const created = await invoke(
      "create",
      "create-job",
      [
        Cl.none(),
        Cl.principal(EVALUATOR),
        Cl.uint(journal.data.expiredAt),
        Cl.stringAscii(`Nayori internal fee QA ${spec.asset} ${spec.name}`),
      ],
      "client",
    );
    jobId = BigInt(created.tx.tx_result.repr.match(/^\(ok u(\d+)\)$/)[1]);
    ensure(
      !journal.data.jobId || journal.data.jobId === String(jobId),
      "Journal job ID differs",
    );
    journal.data.jobId = String(jobId);
    journal.save();
    await invoke(
      "budget",
      "set-budget",
      [Cl.uint(jobId), Cl.uint(spec.budget)],
      "client",
      { state: 0 },
    );
    if (!journal.data.transactions.fund) {
      const p = await fee();
      ensure(
        p.treasury === actors.treasury &&
          p["basis-points"] === "200" &&
          p["fee-amount"] === String(spec.budget / 50n) &&
          p.settlement === null &&
          p.waiver === null,
        "Funding terms differ",
      );
      journal.data.acceptedTerms = {
        gross: String(spec.budget),
        basisPoints: 200,
        treasury: actors.treasury,
        rejectionRefund: "net-after-evaluation",
      };
      journal.save();
    }
    await invoke(
      "fund",
      "fund-job",
      [Cl.uint(jobId), ...tokenArgs(spec.asset)],
      "client",
      {
        state: 0,
        amount: spec.budget,
        from: actors.client,
        legs: [
          {
            sender: actors.client,
            recipient: contract,
            amount: String(spec.budget),
          },
        ],
      },
    );
    if (spec.asset === "sbtc")
      ensure(
        ok(await read(name, "get-job-payment-token", [Cl.uint(jobId)])) ===
          SBTC,
        "Funded job token differs",
      );
    await invoke(
      "assign",
      "assign-provider",
      [Cl.uint(jobId), Cl.principal(actors.provider)],
      "client",
      { state: 1 },
    );
    if (!journal.data.transactions.submit) {
      const j = await identity(),
        p = await fee();
      ensure(
        j.provider === actors.provider &&
          j.budget === String(spec.budget) &&
          (await escrow()) === spec.budget &&
          p.settlement === null &&
          p.waiver === null,
        "Provider terms/escrow differ",
      );
      journal.data.providerAcceptedTerms = journal.data.acceptedTerms;
      journal.save();
    }
    await invoke(
      "submit",
      "submit-work",
      [Cl.uint(jobId), digest("deliverable")],
      "provider",
      { state: 1 },
    );
    let settleFunction,
      settleRole = "client",
      settleArgs;
    if (spec.wait !== "review") {
      const recorded = await invoke(
        "decision",
        "record-decision",
        [
          Cl.uint(jobId),
          Cl.uint(spec.original),
          digest("evidence"),
          digest("explanation"),
        ],
        "evaluator",
        { state: 2 },
      );
      if (recorded.fresh)
        journal.check(
          "Recording decision preserves escrow",
          (await escrow()) === spec.budget && (await fee()).settlement === null,
        );
      if (spec.wait !== "appeal") {
        if (!journal.data.transactions.appeal)
          ensure(
            BigInt((await info()).burn_block_height) <=
              BigInt((await decision())["appeal-deadline"]),
            "Appeal deadline passed; do not transmit",
          );
        const appealed = await invoke(
          "appeal",
          "appeal-decision",
          [Cl.uint(jobId), digest("appeal")],
          spec.original === 1 ? "client" : "provider",
          { state: 7 },
        );
        if (appealed.fresh)
          journal.check(
            "Appeal preserves escrow",
            (await escrow()) === spec.budget &&
              (await fee()).settlement === null,
          );
      }
    }
    if (spec.wait) {
      settleFunction =
        spec.wait === "review"
          ? "settle-review-timeout"
          : spec.wait === "resolution"
            ? "settle-appeal-timeout"
            : "finalize-decision";
      if (!journal.data.transactions.settle) {
        const j = await identity();
        ensure(
          Number(j.status) ===
            (spec.wait === "review" ? 2 : spec.wait === "resolution" ? 8 : 7) &&
            (await escrow()) === spec.budget,
          "Delayed job state/escrow differs",
        );
        const d = spec.wait === "review" ? null : await decision();
        if (d)
          ensure(
            d["original-decision"] === String(spec.original),
            "Original decision changed",
          );
        const deadline =
          spec.wait === "review"
            ? j["review-deadline"]
            : d[
                spec.wait === "resolution"
                  ? "resolution-deadline"
                  : "appeal-deadline"
              ];
        const gate = deadlineGate((await info()).burn_block_height, deadline);
        journal.data.deadline = gate;
        journal.save();
        if (!gate.ready) {
          journal.data.result = "awaiting-deadline";
          journal.save();
          console.log(JSON.stringify(gate));
          return journal.data;
        }
      }
      settleArgs = [Cl.uint(jobId), ...tokenArgs(spec.asset)];
    } else {
      if (spec.waiver)
        await invoke(
          "waiver",
          "waive-service-fee",
          [Cl.uint(jobId), digest("waiver")],
          "authority",
          { state: 8 },
        );
      if (!journal.data.transactions.settle)
        ensure(
          BigInt((await info()).burn_block_height) <=
            BigInt((await decision())["resolution-deadline"]),
          "Resolution deadline passed; do not transmit",
        );
      settleFunction = "resolve-appeal";
      settleRole = "authority";
      settleArgs = [
        Cl.uint(jobId),
        Cl.uint(spec.final),
        digest("resolution"),
        ...tokenArgs(spec.asset),
      ];
    }
    const legs = [
      { sender: contract, recipient: e.recipient, amount: String(e.net) },
      ...(e.charged
        ? [
            {
              sender: contract,
              recipient: actors.treasury,
              amount: String(e.charged),
            },
          ]
        : []),
    ];
    const settled = await invoke(
      "settle",
      settleFunction,
      settleArgs,
      settleRole,
      {
        state: spec.wait === "review" ? 2 : spec.wait === "appeal" ? 7 : 8,
        amount: spec.budget,
        legs,
      },
    );
    verifyPrint(
      settled.events,
      contract,
      spec.wait === "review" ? "review-timeout-paid" : "service-fee-settled",
      jobId,
    );
    if (spec.refund) {
      await invoke(
        "waiver",
        "waive-service-fee",
        [Cl.uint(jobId), digest("waiver")],
        "authority",
        { state: e.status },
      );
      if (!journal.data.transactions.refund)
        journal.check(
          "Waiver is an obligation, not a refund",
          (await fee()).settlement["refunded-fee"] === "0",
        );
      const refunded = await invoke(
        "refund",
        "refund-service-fee",
        [Cl.uint(jobId), ...tokenArgs(spec.asset)],
        "treasury",
        {
          state: e.status,
          amount: e.charged,
          from: actors.treasury,
          legs: [
            {
              sender: actors.treasury,
              recipient: e.recipient,
              amount: String(e.charged),
            },
          ],
        },
      );
      verifyPrint(refunded.events, contract, "service-fee-refunded", jobId);
    }
    journal.check(
      "Terminal status and exact zero escrow",
      Number((await identity()).status) === e.status && (await escrow()) === 0n,
    );
    verifyLedger(await fee(), spec, actors);
    if (spec.wait === "review") {
      const d = await read(name, "get-decision", [Cl.uint(jobId)]),
        r = await read(name, "get-reputation-sync", [Cl.uint(jobId)]);
      ensure(
        d.type === ClarityType.ResponseErr &&
          r.type === ClarityType.ResponseErr &&
          plain(cvToValue(d)) === (spec.asset === "stx" ? "829" : "930") &&
          plain(cvToValue(r)) === (spec.asset === "stx" ? "823" : "924"),
        "Timeout fabricated decision/reputation",
      );
    } else {
      const d = await decision(),
        r = ok(await read(name, "get-reputation-sync", [Cl.uint(jobId)]));
      ensure(
        d["original-decision"] === String(spec.original) &&
          d["final-decision"] === String(spec.final) &&
          r.pending === false &&
          r.outcome === String(spec.final),
        "Decision or reputation differs",
      );
    }
    journal.check("Final ledger, decision and reputation match", true);
    journal.check(
      "Every recorded operation has a distinct transaction",
      new Set(Object.values(journal.data.transactions).map((t) => t.txid))
        .size === Object.keys(journal.data.transactions).length,
    );
    journal.data.result = "passed";
    journal.data.completedAt = new Date().toISOString();
    journal.save();
    return journal.data;
  } finally {
    journal.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof SafetyError
        ? error.message
        : "Testnet E2E stopped; inspect public journal. No secret inputs logged.",
    );
    process.exitCode = 1;
  });
}
