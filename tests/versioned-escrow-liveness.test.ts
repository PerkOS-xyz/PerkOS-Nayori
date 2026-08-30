import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const client = accounts.get("wallet_1")!;
const provider = accounts.get("wallet_2")!;
const evaluator = accounts.get("wallet_3")!;
const outsider = deployer;

const STX = "agentic-commerce-v4";
const SBTC = "sbtc-commerce-v3";
const REP = "reputation-registry-v3";
const TOKEN = "mock-sbtc-token";
const LEGACY_STX = "agentic-commerce-v3";
const LEGACY_SBTC = "sbtc-commerce-v2";

const STX_BUDGET = 1_000_000;
const SBTC_BUDGET = 100_000;
const SBTC_MINT = 5_000_000;
const REVIEW_WINDOW = 12;

const token = () => Cl.contractPrincipal(deployer, TOKEN);
const contract = (name: string) => Cl.contractPrincipal(deployer, name);

function stxTransfers(events: any[]) {
  return events.filter((event) => event.event === "stx_transfer_event");
}

function ftTransfers(events: any[]) {
  return events.filter((event) => event.event === "ft_transfer_event");
}

function readTuple(contractName: string, functionName: string, args: any[] = []) {
  const response: any = simnet.callReadOnlyFn(contractName, functionName, args, deployer).result;
  return response.value.value;
}

function job(contractName: string, jobId = 1) {
  return readTuple(contractName, "get-job", [Cl.uint(jobId)]);
}

function status(contractName: string, jobId = 1) {
  return Number(job(contractName, jobId).status.value);
}

function optionalUint(value: any) {
  return Number(value.value.value);
}

function reputation() {
  return readTuple(REP, "get-reputation", [Cl.principal(provider)]);
}

function whitelist(contractName: string) {
  return simnet.callPublicFn(REP, "add-protocol-caller", [contract(contractName)], deployer);
}

function createStx(expiresIn = 1000) {
  return simnet.callPublicFn(
    STX,
    "create-job",
    [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(simnet.blockHeight + expiresIn),
      Cl.stringAscii("Versioned STX job"),
    ],
    client
  );
}

function fundAssignSubmitStx(expiresIn = 1000) {
  createStx(expiresIn);
  simnet.callPublicFn(STX, "set-budget", [Cl.uint(1), Cl.uint(STX_BUDGET)], client);
  simnet.callPublicFn(STX, "fund-job", [Cl.uint(1)], client);
  simnet.callPublicFn(STX, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
  return simnet.callPublicFn(
    STX,
    "submit-work",
    [Cl.uint(1), Cl.bufferFromAscii("stx-deliverable")],
    provider
  );
}

function setupSbtc(allowReputation = true) {
  simnet.callPublicFn(SBTC, "set-payment-token", [token()], deployer);
  if (allowReputation) whitelist(SBTC);
  simnet.callPublicFn(TOKEN, "mint", [Cl.uint(SBTC_MINT), Cl.principal(client)], deployer);
}

function createSbtc(expiresIn = 1000) {
  return simnet.callPublicFn(
    SBTC,
    "create-job",
    [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(simnet.blockHeight + expiresIn),
      Cl.stringAscii("Versioned sBTC job"),
    ],
    client
  );
}

function fundAssignSubmitSbtc(expiresIn = 1000) {
  createSbtc(expiresIn);
  simnet.callPublicFn(SBTC, "set-budget", [Cl.uint(1), Cl.uint(SBTC_BUDGET)], client);
  simnet.callPublicFn(SBTC, "fund-job", [Cl.uint(1), token()], client);
  simnet.callPublicFn(SBTC, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
  return simnet.callPublicFn(
    SBTC,
    "submit-work",
    [Cl.uint(1), Cl.bufferFromAscii("sbtc-deliverable")],
    provider
  );
}

function tokenBalance(principal: string) {
  const response: any = simnet.callReadOnlyFn(
    TOKEN,
    "get-balance",
    [Cl.principal(principal)],
    deployer
  ).result;
  return Number(response.value.value);
}

describe("versioned escrow generations", () => {
  it("preserves the deployed v3/v2 contracts at 144 burn blocks", () => {
    expect(
      simnet.callReadOnlyFn(LEGACY_STX, "get-review-window", [], deployer).result
    ).toBeOk(Cl.uint(144));
    expect(
      simnet.callReadOnlyFn(LEGACY_SBTC, "get-review-window", [], deployer).result
    ).toBeOk(Cl.uint(144));
  });

  it("selects 12 burn blocks only through the new v4/v3 contracts", () => {
    expect(
      simnet.callReadOnlyFn(STX, "get-review-window", [], deployer).result
    ).toBeOk(Cl.uint(REVIEW_WINDOW));
    expect(
      simnet.callReadOnlyFn(SBTC, "get-review-window", [], deployer).result
    ).toBeOk(Cl.uint(REVIEW_WINDOW));
  });
});

describe("agentic-commerce-v4 – Bitcoin review window", () => {
  beforeEach(() => whitelist(STX));

  it("records a fixed 12 Bitcoin-block deadline at submission", () => {
    fundAssignSubmitStx();

    const stored = job(STX);
    const submittedAt = optionalUint(stored["submitted-at-burn"]);
    expect(optionalUint(stored["review-deadline"])).toBe(submittedAt + REVIEW_WINDOW);
    expect(
      simnet.callReadOnlyFn(STX, "get-review-window", [], deployer).result
    ).toBeOk(Cl.uint(REVIEW_WINDOW));
  });

  it("allows evaluator completion at the exact deadline", () => {
    fundAssignSubmitStx();
    // callPublicFn mines the block in which the call is evaluated. Mine 143
    // empty burn blocks so this transaction executes at submitted + 144.
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW - 1);

    const completed = simnet.callPublicFn(STX, "complete-job", [Cl.uint(1)], evaluator);
    expect(completed.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(completed.events)[0].data.recipient).toBe(provider);
    expect(status(STX)).toBe(3);
  });

  it("refuses permissionless timeout at the exact deadline", () => {
    fundAssignSubmitStx();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW - 1);
    expect(
      simnet.callPublicFn(STX, "settle-review-timeout", [Cl.uint(1)], outsider).result
    ).toBeErr(Cl.uint(618));
    expect(status(STX)).toBe(2);
  });

  it("allows any principal to pay the provider after the deadline", () => {
    fundAssignSubmitStx();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);

    expect(
      simnet.callPublicFn(STX, "complete-job", [Cl.uint(1)], evaluator).result
    ).toBeErr(Cl.uint(617));

    const timedOut = simnet.callPublicFn(STX, "settle-review-timeout", [Cl.uint(1)], outsider);
    expect(timedOut.result).toBeOk(Cl.bool(true));
    const payout = stxTransfers(timedOut.events);
    expect(payout).toHaveLength(1);
    expect(payout[0].data.recipient).toBe(provider);
    expect(payout[0].data.amount).toBe(String(STX_BUDGET));
    expect(status(STX)).toBe(6);
    expect(
      simnet.callReadOnlyFn(STX, "get-escrow-balance", [Cl.uint(1)], deployer).result
    ).toBeOk(Cl.uint(0));
  });

  it("keeps timeout payouts out of completion, ratings and reputation", () => {
    fundAssignSubmitStx();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    simnet.callPublicFn(STX, "settle-review-timeout", [Cl.uint(1)], outsider);

    expect(status(STX)).toBe(6);
    expect(reputation()["completed-jobs"]).toBeUint(0);
    expect(reputation()["disputed-jobs"]).toBeUint(0);
    expect(
      simnet.callPublicFn(
        STX,
        "rate-provider",
        [Cl.uint(1), Cl.uint(5), Cl.stringAscii("timeout is not completion")],
        client
      ).result
    ).toBeErr(Cl.uint(603));
    expect(
      simnet.callReadOnlyFn(STX, "get-reputation-sync", [Cl.uint(1)], deployer).result
    ).toBeErr(Cl.uint(623));
  });

  it("uses the review deadline after submission even if original expiry passes", () => {
    fundAssignSubmitStx(10);
    // Cross the original expiry while remaining inside the shorter 12-burn-block
    // evaluator window recorded at submission.
    simnet.mineEmptyBlocks(7);

    expect(simnet.blockHeight).toBeGreaterThan(Number(job(STX)["expired-at"].value));
    expect(
      simnet.callPublicFn(STX, "expire-job", [Cl.uint(1)], outsider).result
    ).toBeErr(Cl.uint(603));
    expect(
      simnet.callPublicFn(STX, "complete-job", [Cl.uint(1)], evaluator).result
    ).toBeOk(Cl.bool(true));
  });
});

describe("versioned escrow – durable reputation synchronization", () => {
  it("pays STX even when reputation fails, then permits a third-party retry", () => {
    fundAssignSubmitStx();

    const completed = simnet.callPublicFn(STX, "complete-job", [Cl.uint(1)], evaluator);
    expect(completed.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(completed.events)[0].data.recipient).toBe(provider);

    let sync = readTuple(STX, "get-reputation-sync", [Cl.uint(1)]);
    expect(sync.pending).toBeBool(true);
    expect(sync.outcome).toBeUint(1);
    expect(sync["last-error"]).toBeUint(501);
    expect(reputation()["completed-jobs"]).toBeUint(0);

    whitelist(STX);
    expect(
      simnet.callPublicFn(STX, "retry-reputation-sync", [Cl.uint(1)], outsider).result
    ).toBeOk(Cl.bool(true));

    sync = readTuple(STX, "get-reputation-sync", [Cl.uint(1)]);
    expect(sync.pending).toBeBool(false);
    expect(sync["last-error"]).toBeUint(0);
    expect(reputation()["completed-jobs"]).toBeUint(1);
    expect(
      simnet.callPublicFn(STX, "retry-reputation-sync", [Cl.uint(1)], outsider).result
    ).toBeErr(Cl.uint(623));
  });

  it("namespaces identical job IDs by protocol source and rejects duplicate outcomes", () => {
    simnet.callPublicFn(REP, "add-protocol-caller", [Cl.principal(client)], deployer);
    simnet.callPublicFn(REP, "add-protocol-caller", [Cl.principal(evaluator)], deployer);

    expect(
      simnet.callPublicFn(
        REP,
        "record-job-outcome",
        [Cl.principal(provider), Cl.uint(1), Cl.bool(true), Cl.bool(false)],
        client
      ).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(
        REP,
        "record-job-outcome",
        [Cl.principal(provider), Cl.uint(1), Cl.bool(true), Cl.bool(false)],
        client
      ).result
    ).toBeErr(Cl.uint(506));
    expect(
      simnet.callPublicFn(
        REP,
        "record-job-outcome",
        [Cl.principal(provider), Cl.uint(1), Cl.bool(true), Cl.bool(false)],
        evaluator
      ).result
    ).toBeOk(Cl.bool(true));

    expect(reputation()["completed-jobs"]).toBeUint(2);
    expect(
      simnet.callReadOnlyFn(
        REP,
        "get-job-outcome",
        [Cl.principal(client), Cl.uint(1)],
        deployer
      ).result
    ).toBeOk(
      Cl.tuple({ agent: Cl.principal(provider), completed: Cl.bool(true), disputed: Cl.bool(false) })
    );
  });

  it("rejects ambiguous reputation outcomes", () => {
    simnet.callPublicFn(REP, "add-protocol-caller", [Cl.principal(client)], deployer);
    expect(
      simnet.callPublicFn(
        REP,
        "record-job-outcome",
        [Cl.principal(provider), Cl.uint(1), Cl.bool(false), Cl.bool(false)],
        client
      ).result
    ).toBeErr(Cl.uint(505));
  });

  it("keeps ratings with the same job ID separate across STX and sBTC sources", () => {
    whitelist(STX);
    setupSbtc();

    fundAssignSubmitStx();
    simnet.callPublicFn(STX, "complete-job", [Cl.uint(1)], evaluator);
    fundAssignSubmitSbtc();
    simnet.callPublicFn(SBTC, "complete-job", [Cl.uint(1), token()], evaluator);

    expect(
      simnet.callPublicFn(
        STX,
        "rate-provider",
        [Cl.uint(1), Cl.uint(5), Cl.stringAscii("STX delivery")],
        client
      ).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(
        SBTC,
        "rate-provider",
        [Cl.uint(1), Cl.uint(4), Cl.stringAscii("sBTC delivery")],
        client
      ).result
    ).toBeOk(Cl.bool(true));

    expect(reputation()["rating-count"]).toBeUint(2);
    expect(
      simnet.callReadOnlyFn(
        REP,
        "get-rating",
        [contract(STX), Cl.principal(provider), Cl.principal(client), Cl.uint(1)],
        deployer
      ).result
    ).toBeOk(Cl.tuple({ score: Cl.uint(5), comment: Cl.stringAscii("STX delivery") }));
    expect(
      simnet.callReadOnlyFn(
        REP,
        "get-rating",
        [contract(SBTC), Cl.principal(provider), Cl.principal(client), Cl.uint(1)],
        deployer
      ).result
    ).toBeOk(Cl.tuple({ score: Cl.uint(4), comment: Cl.stringAscii("sBTC delivery") }));
  });
});

describe("sbtc-commerce-v3 – token pinning and timeout", () => {
  beforeEach(() => setupSbtc());

  it("pins the token at funding so later default rotation cannot brick settlement", () => {
    fundAssignSubmitSbtc();
    expect(
      simnet.callReadOnlyFn(SBTC, "get-job-payment-token", [Cl.uint(1)], deployer).result
    ).toBeOk(token());

    simnet.callPublicFn(SBTC, "set-payment-token", [contract("agent-registry")], deployer);
    const providerBefore = tokenBalance(provider);
    const completed = simnet.callPublicFn(
      SBTC,
      "complete-job",
      [Cl.uint(1), token()],
      evaluator
    );
    expect(completed.result).toBeOk(Cl.bool(true));
    expect(tokenBalance(provider)).toBe(providerBefore + SBTC_BUDGET);

    createSbtc();
    simnet.callPublicFn(SBTC, "set-budget", [Cl.uint(2), Cl.uint(SBTC_BUDGET)], client);
    expect(
      simnet.callPublicFn(SBTC, "fund-job", [Cl.uint(2), token()], client).result
    ).toBeErr(Cl.uint(711));
  });

  it("allows evaluator rejection at the exact Bitcoin deadline", () => {
    fundAssignSubmitSbtc();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW - 1);
    const clientBefore = tokenBalance(client);

    const rejected = simnet.callPublicFn(
      SBTC,
      "reject-job",
      [Cl.uint(1), token()],
      evaluator
    );
    expect(rejected.result).toBeOk(Cl.bool(true));
    expect(tokenBalance(client)).toBe(clientBefore + SBTC_BUDGET);
    expect(status(SBTC)).toBe(4);
  });

  it("pays only the provider in sBTC after the deadline", () => {
    fundAssignSubmitSbtc();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    const providerBefore = tokenBalance(provider);
    const clientBefore = tokenBalance(client);

    expect(
      simnet.callPublicFn(
        SBTC,
        "complete-job",
        [Cl.uint(1), token()],
        evaluator
      ).result
    ).toBeErr(Cl.uint(717));
    const timedOut = simnet.callPublicFn(
      SBTC,
      "settle-review-timeout",
      [Cl.uint(1), token()],
      outsider
    );
    expect(timedOut.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(timedOut.events)).toHaveLength(1);
    expect(tokenBalance(provider)).toBe(providerBefore + SBTC_BUDGET);
    expect(tokenBalance(client)).toBe(clientBefore);
    expect(status(SBTC)).toBe(6);
    expect(reputation()["completed-jobs"]).toBeUint(0);
    expect(reputation()["disputed-jobs"]).toBeUint(0);
  });

  it("records and retries an sBTC reputation failure without rolling back payout", () => {
    // Reset the test's allowlist entry, then create a separate job source that
    // is not authorized at settlement time.
    simnet.callPublicFn(REP, "remove-protocol-caller", [contract(SBTC)], deployer);
    fundAssignSubmitSbtc();
    const providerBefore = tokenBalance(provider);

    const completed = simnet.callPublicFn(
      SBTC,
      "complete-job",
      [Cl.uint(1), token()],
      evaluator
    );
    expect(completed.result).toBeOk(Cl.bool(true));
    expect(tokenBalance(provider)).toBe(providerBefore + SBTC_BUDGET);
    expect(readTuple(SBTC, "get-reputation-sync", [Cl.uint(1)]).pending).toBeBool(true);

    whitelist(SBTC);
    expect(
      simnet.callPublicFn(SBTC, "retry-reputation-sync", [Cl.uint(1)], outsider).result
    ).toBeOk(Cl.bool(true));
    expect(readTuple(SBTC, "get-reputation-sync", [Cl.uint(1)]).pending).toBeBool(false);
    expect(reputation()["completed-jobs"]).toBeUint(1);
  });
});

describe("versioned escrow – role and pre-submission expiry guards", () => {
  it("does not let the STX client reject submitted work", () => {
    whitelist(STX);
    fundAssignSubmitStx();
    expect(
      simnet.callPublicFn(STX, "reject-job", [Cl.uint(1)], client).result
    ).toBeErr(Cl.uint(609));
    expect(status(STX)).toBe(2);
  });

  it("does not let the sBTC client reject submitted work", () => {
    setupSbtc();
    fundAssignSubmitSbtc();
    expect(
      simnet.callPublicFn(SBTC, "reject-job", [Cl.uint(1), token()], client).result
    ).toBeErr(Cl.uint(709));
    expect(status(SBTC)).toBe(2);
  });

  it("still refunds funded STX and sBTC jobs that expire before submission", () => {
    createStx(50);
    simnet.callPublicFn(STX, "set-budget", [Cl.uint(1), Cl.uint(STX_BUDGET)], client);
    simnet.callPublicFn(STX, "fund-job", [Cl.uint(1)], client);

    setupSbtc();
    createSbtc(50);
    simnet.callPublicFn(SBTC, "set-budget", [Cl.uint(1), Cl.uint(SBTC_BUDGET)], client);
    simnet.callPublicFn(SBTC, "fund-job", [Cl.uint(1), token()], client);
    const clientSbtcBefore = tokenBalance(client);

    simnet.mineEmptyBlocks(100);
    const stxExpired = simnet.callPublicFn(STX, "expire-job", [Cl.uint(1)], outsider);
    const sbtcExpired = simnet.callPublicFn(
      SBTC,
      "expire-job",
      [Cl.uint(1), token()],
      outsider
    );

    expect(stxExpired.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(stxExpired.events)[0].data.recipient).toBe(client);
    expect(sbtcExpired.result).toBeOk(Cl.bool(true));
    expect(tokenBalance(client)).toBe(clientSbtcBefore + SBTC_BUDGET);
    expect(status(STX)).toBe(5);
    expect(status(SBTC)).toBe(5);
  });

  it("expires an unfunded sBTC job without requiring a pinned token", () => {
    setupSbtc();
    createSbtc(20);
    simnet.mineEmptyBlocks(30);

    const expired = simnet.callPublicFn(
      SBTC,
      "expire-job",
      [Cl.uint(1), token()],
      outsider
    );

    expect(expired.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(expired.events)).toHaveLength(0);
    expect(status(SBTC)).toBe(5);
    expect(
      simnet.callReadOnlyFn(SBTC, "get-job-payment-token", [Cl.uint(1)], deployer).result
    ).toBeErr(Cl.uint(724));
  });
});

describe("versioned contracts – two-step ownership", () => {
  it("requires the proposed registry owner to accept", () => {
    expect(
      simnet.callPublicFn(REP, "propose-owner", [Cl.principal(client)], deployer).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(REP, "accept-owner", [], provider).result
    ).toBeErr(Cl.uint(509));
    expect(
      simnet.callPublicFn(REP, "accept-owner", [], client).result
    ).toBeOk(Cl.bool(true));
    expect(simnet.callReadOnlyFn(REP, "get-owner", [], deployer).result).toBeOk(
      Cl.principal(client)
    );
    expect(
      simnet.callPublicFn(REP, "add-protocol-caller", [Cl.principal(provider)], deployer).result
    ).toBeErr(Cl.uint(500));
  });

  it("lets the current STX owner cancel a pending transfer", () => {
    simnet.callPublicFn(STX, "propose-owner", [Cl.principal(client)], deployer);
    expect(
      simnet.callPublicFn(STX, "cancel-owner-proposal", [], deployer).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(STX, "accept-owner", [], client).result
    ).toBeErr(Cl.uint(620));
  });

  it("moves sBTC token administration only after acceptance", () => {
    simnet.callPublicFn(SBTC, "propose-owner", [Cl.principal(client)], deployer);
    expect(
      simnet.callPublicFn(SBTC, "accept-owner", [], client).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(SBTC, "set-payment-token", [token()], deployer).result
    ).toBeErr(Cl.uint(700));
    expect(
      simnet.callPublicFn(SBTC, "set-payment-token", [token()], client).result
    ).toBeOk(Cl.bool(true));
  });
});
