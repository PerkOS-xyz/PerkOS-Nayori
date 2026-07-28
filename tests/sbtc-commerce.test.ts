import { Cl } from "@stacks/transactions";
import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const client = accounts.get("wallet_1")!;
const provider = accounts.get("wallet_2")!;
const evaluator = accounts.get("wallet_3")!;
// Simnet exposes deployer + wallet_1..3 only. The deployer plays the unrelated
// third party in tests, since it is never a client, provider or evaluator of a job.
const outsider = deployer;

const C = "sbtc-commerce";
const REP = "reputation-registry-v2";
const TOKEN = "mock-sbtc-token";

const BUDGET = 100_000; // 0.001 sBTC in sats
const MINT = 1_000_000; // 0.01 sBTC in sats

const token = () => Cl.contractPrincipal(deployer, TOKEN);

function ftTransfers(events: any[]) {
  return events.filter((e) => e.event === "ft_transfer_event");
}

/**
 * Simnet resets between tests, so every test re-runs the real post-deploy wiring:
 * point escrow at the sBTC token, whitelist escrow on reputation, fund the client.
 */
function setup() {
  simnet.callPublicFn(C, "set-payment-token", [token()], deployer);
  simnet.callPublicFn(REP, "add-protocol-caller", [Cl.contractPrincipal(deployer, C)], deployer);
  simnet.callPublicFn(TOKEN, "mint", [Cl.uint(MINT), Cl.principal(client)], deployer);
}

function createJob(expiresIn = 1000, sender = client) {
  return simnet.callPublicFn(
    C,
    "create-job",
    [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(simnet.blockHeight + expiresIn),
      Cl.stringAscii("Summarize the Bitcoin whitepaper"),
    ],
    sender
  );
}

/** create -> set-budget -> fund-job, leaving job u1 FUNDED with sBTC in escrow */
function createAndFund(expiresIn = 1000) {
  createJob(expiresIn);
  simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);
  return simnet.callPublicFn(C, "fund-job", [Cl.uint(1), token()], client);
}

/** full path up to SUBMITTED */
function fundAssignSubmit(expiresIn = 1000) {
  createAndFund(expiresIn);
  simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
  return simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("deliverable")], provider);
}

function statusOf(jobId = 1): number {
  const job: any = simnet.callReadOnlyFn(C, "get-job", [Cl.uint(jobId)], deployer).result;
  return Number(job.value.value.status.value);
}

function balanceOf(who: string): number {
  const r: any = simnet.callReadOnlyFn(TOKEN, "get-balance", [Cl.principal(who)], deployer).result;
  return Number(r.value.value);
}

function reputationOf(who: string): any {
  const r: any = simnet.callReadOnlyFn(REP, "get-reputation", [Cl.principal(who)], deployer).result;
  return r.value.value;
}

describe("sbtc-commerce – sBTC escrow lifecycle", () => {
  beforeEach(setup);

  it("happy path: create -> fund (sBTC escrowed) -> assign -> submit -> complete (provider paid in sBTC)", () => {
    createJob();
    expect(statusOf()).toBe(0);

    simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);

    const clientBefore = balanceOf(client);
    const funded = simnet.callPublicFn(C, "fund-job", [Cl.uint(1), token()], client);
    expect(funded.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(funded.events).length).toBe(1);
    expect(balanceOf(client)).toBe(clientBefore - BUDGET);
    expect(statusOf()).toBe(1);

    const escrow: any = simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result;
    expect(escrow.value).toBeUint(BUDGET);

    simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
    simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("deliverable")], provider);
    expect(statusOf()).toBe(2);

    const providerBefore = balanceOf(provider);
    const completed = simnet.callPublicFn(C, "complete-job", [Cl.uint(1), token()], evaluator);
    expect(completed.result).toBeOk(Cl.bool(true));

    // Provider actually received sBTC, escrow cleared, status COMPLETED.
    expect(balanceOf(provider)).toBe(providerBefore + BUDGET);
    expect(statusOf()).toBe(3);
    const escrowAfter: any = simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result;
    expect(escrowAfter.value).toBeUint(0);

    // Reputation updated at settlement.
    expect(reputationOf(provider)["completed-jobs"]).toBeUint(1);
  });

  it("emits print events for indexing on every transition", () => {
    const created = createJob();
    const printed = created.events.filter((e: any) => e.event === "print_event");
    expect(printed.length).toBeGreaterThan(0);
  });

  it("rejects a token that is not the configured sBTC contract", () => {
    createJob();
    simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);
    // Point the escrow at a different token, then try to fund with the mock.
    simnet.callPublicFn(C, "set-payment-token", [Cl.contractPrincipal(deployer, "agent-registry")], deployer);
    const funded = simnet.callPublicFn(C, "fund-job", [Cl.uint(1), token()], client);
    expect(funded.result).toBeErr(Cl.uint(311));
  });
});

describe("sbtc-commerce – hardening: unilateral client reject is impossible (C1)", () => {
  beforeEach(setup);

  it("client CANNOT reject delivered work and reclaim the escrow", () => {
    fundAssignSubmit();
    const rejected = simnet.callPublicFn(C, "reject-job", [Cl.uint(1), token()], client);
    expect(rejected.result).toBeErr(Cl.uint(309)); // ERR_NOT_EVALUATOR
    expect(statusOf()).toBe(2); // still SUBMITTED, funds still escrowed
  });

  it("evaluator can reject, refunding the client and flagging a dispute", () => {
    fundAssignSubmit();
    const clientBefore = balanceOf(client);
    const rejected = simnet.callPublicFn(C, "reject-job", [Cl.uint(1), token()], evaluator);
    expect(rejected.result).toBeOk(Cl.bool(true));
    expect(balanceOf(client)).toBe(clientBefore + BUDGET);
    expect(statusOf()).toBe(4);
    expect(reputationOf(provider)["disputed-jobs"]).toBeUint(1);
  });

  it("a client cannot name themselves evaluator", () => {
    const created = simnet.callPublicFn(
      C,
      "create-job",
      [Cl.none(), Cl.principal(client), Cl.uint(simnet.blockHeight + 100), Cl.stringAscii("self-dealt job")],
      client
    );
    expect(created.result).toBeErr(Cl.uint(313)); // ERR_INVALID_PARTY
  });

  it("provider cannot also be the evaluator", () => {
    createAndFund();
    const assigned = simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(evaluator)], client);
    expect(assigned.result).toBeErr(Cl.uint(313));
  });
});

describe("sbtc-commerce – hardening: expiry cannot race settlement (M1)", () => {
  beforeEach(setup);

  it("submit-work is refused after expiry", () => {
    createAndFund(10);
    simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
    simnet.mineEmptyBlocks(15);
    const submitted = simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("late")], provider);
    expect(submitted.result).toBeErr(Cl.uint(304)); // ERR_JOB_EXPIRED
  });

  it("complete-job is refused after expiry", () => {
    fundAssignSubmit(10);
    simnet.mineEmptyBlocks(15);
    const completed = simnet.callPublicFn(C, "complete-job", [Cl.uint(1), token()], evaluator);
    expect(completed.result).toBeErr(Cl.uint(304));
  });

  it("expire-job refunds escrowed sBTC to the client", () => {
    createAndFund(10);
    const clientBefore = balanceOf(client);
    simnet.mineEmptyBlocks(15);
    const expired = simnet.callPublicFn(C, "expire-job", [Cl.uint(1), token()], outsider);
    expect(expired.result).toBeOk(Cl.bool(true));
    expect(balanceOf(client)).toBe(clientBefore + BUDGET);
    expect(statusOf()).toBe(5);
  });

  it("expire-job before expiry is refused", () => {
    createAndFund(1000);
    const expired = simnet.callPublicFn(C, "expire-job", [Cl.uint(1), token()], outsider);
    expect(expired.result).toBeErr(Cl.uint(316)); // ERR_NOT_EXPIRED
  });
});

describe("sbtc-commerce – hardening: reputation cannot be farmed (C2)", () => {
  beforeEach(setup);

  function completeJob() {
    fundAssignSubmit();
    return simnet.callPublicFn(C, "complete-job", [Cl.uint(1), token()], evaluator);
  }

  it("an unrelated wallet cannot rate the provider", () => {
    completeJob();
    const rated = simnet.callPublicFn(
      C,
      "rate-provider",
      [Cl.uint(1), Cl.uint(5), Cl.stringAscii("shill")],
      outsider
    );
    expect(rated.result).toBeErr(Cl.uint(301)); // ERR_NOT_AUTHORIZED
    expect(reputationOf(provider)["rating-count"]).toBeUint(0);
  });

  it("the provider cannot rate themselves", () => {
    completeJob();
    const rated = simnet.callPublicFn(
      C,
      "rate-provider",
      [Cl.uint(1), Cl.uint(5), Cl.stringAscii("self")],
      provider
    );
    expect(rated.result).toBeErr(Cl.uint(301)); // ERR_NOT_AUTHORIZED
    expect(reputationOf(provider)["rating-count"]).toBeUint(0);
  });

  it("the client can rate once, and the average is scaled by 100", () => {
    completeJob();
    const rated = simnet.callPublicFn(
      C,
      "rate-provider",
      [Cl.uint(1), Cl.uint(5), Cl.stringAscii("great work")],
      client
    );
    expect(rated.result).toBeOk(Cl.bool(true));
    const rep = reputationOf(provider);
    expect(rep["rating-count"]).toBeUint(1);
    expect(rep["average-score-x100"]).toBeUint(500); // 5.00
  });

  it("the same rater cannot rate the same job twice", () => {
    completeJob();
    simnet.callPublicFn(C, "rate-provider", [Cl.uint(1), Cl.uint(5), Cl.stringAscii("a")], client);
    const again = simnet.callPublicFn(C, "rate-provider", [Cl.uint(1), Cl.uint(1), Cl.stringAscii("b")], client);
    expect(again.result).toBeErr(Cl.uint(314)); // ERR_ALREADY_RATED
  });

  it("client and evaluator ratings average correctly without truncation", () => {
    completeJob();
    simnet.callPublicFn(C, "rate-provider", [Cl.uint(1), Cl.uint(5), Cl.stringAscii("a")], client);
    simnet.callPublicFn(C, "rate-provider", [Cl.uint(1), Cl.uint(4), Cl.stringAscii("b")], evaluator);
    const rep = reputationOf(provider);
    expect(rep["rating-count"]).toBeUint(2);
    expect(rep["average-score-x100"]).toBeUint(450); // 4.50, not truncated to 4
  });

  it("rating a job that is not completed is refused", () => {
    fundAssignSubmit();
    const rated = simnet.callPublicFn(C, "rate-provider", [Cl.uint(1), Cl.uint(5), Cl.stringAscii("early")], client);
    expect(rated.result).toBeErr(Cl.uint(303)); // ERR_INVALID_STATUS
  });
});

describe("reputation-registry-v2 – access control", () => {
  beforeEach(setup);

  it("submit-rating is refused for a non protocol caller", () => {
    const r = simnet.callPublicFn(
      REP,
      "submit-rating",
      [Cl.principal(provider), Cl.principal(client), Cl.uint(5), Cl.uint(1), Cl.stringAscii("direct")],
      client
    );
    expect(r.result).toBeErr(Cl.uint(401)); // ERR_NOT_AUTHORIZED
  });

  it("update-job-stats is refused for a non protocol caller", () => {
    const r = simnet.callPublicFn(
      REP,
      "update-job-stats",
      [Cl.principal(provider), Cl.bool(true), Cl.bool(false)],
      client
    );
    expect(r.result).toBeErr(Cl.uint(401));
  });

  it("only the owner can register a protocol caller", () => {
    const r = simnet.callPublicFn(REP, "add-protocol-caller", [Cl.principal(client)], client);
    expect(r.result).toBeErr(Cl.uint(400)); // ERR_NOT_OWNER
  });

  it("unknown agents read back an empty reputation", () => {
    const rep = reputationOf(provider);
    expect(rep["rating-count"]).toBeUint(0);
    expect(rep["average-score-x100"]).toBeUint(0);
  });
});

describe("sbtc-commerce – admin", () => {
  beforeEach(setup);

  it("only the owner can set the payment token", () => {
    const r = simnet.callPublicFn(C, "set-payment-token", [token()], client);
    expect(r.result).toBeErr(Cl.uint(300)); // ERR_NOT_OWNER
  });

  it("payment token reads back after being set", () => {
    const r: any = simnet.callReadOnlyFn(C, "get-payment-token", [], deployer).result;
    expect(r.value).toBePrincipal(`${deployer}.${TOKEN}`);
  });
});
