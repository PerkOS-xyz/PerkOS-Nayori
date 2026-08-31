import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const owner = accounts.get("deployer")!;
const client = accounts.get("wallet_1")!;
const provider = accounts.get("wallet_2")!;
const appealAuthority = accounts.get("wallet_3")!;

// Simnet exposes four principals. The deployer also acts as the evaluator in
// these contract tests; owner and evaluator are independently authorized roles
// in the protocol and production uses separate keys for them.
const evaluator = owner;
const outsider = provider;

const STX = "agentic-commerce-v5";
const SBTC = "sbtc-commerce-v4";
const REP = "reputation-registry-v3";
const TOKEN = "mock-sbtc-token";
const ALT_TOKEN = "mock-sbtc-token-alt";

const QA_APPEAL_WINDOW = 3;
const MAINNET_APPEAL_WINDOW = 144;
const REVIEW_WINDOW = 12;
const STX_BUDGET = 1_000_000;
const SBTC_BUDGET = 100_000;
const SBTC_MINT = 5_000_000;

const APPROVE = 1;
const REJECT = 2;
const evidenceHash = Cl.bufferFromHex("11".repeat(32));
const explanationHash = Cl.bufferFromHex("22".repeat(32));
const appealHash = Cl.bufferFromHex("33".repeat(32));
const resolutionHash = Cl.bufferFromHex("44".repeat(32));
const zeroHash = Cl.bufferFromHex("00".repeat(32));

const contract = (name: string) => Cl.contractPrincipal(owner, name);
const token = () => contract(TOKEN);

function readTuple(contractName: string, functionName: string, args: any[] = []) {
  const response: any = simnet.callReadOnlyFn(contractName, functionName, args, owner).result;
  return response.value.value;
}

function job(contractName: string, jobId = 1) {
  return readTuple(contractName, "get-job", [Cl.uint(jobId)]);
}

function decision(contractName: string, jobId = 1) {
  return readTuple(contractName, "get-decision", [Cl.uint(jobId)]);
}

function status(contractName: string, jobId = 1) {
  return Number(job(contractName, jobId).status.value);
}

function optionalUint(value: any) {
  return Number(value.value.value);
}

function escrow(contractName: string, jobId = 1) {
  const response: any = simnet.callReadOnlyFn(
    contractName,
    "get-escrow-balance",
    [Cl.uint(jobId)],
    owner
  ).result;
  return Number(response.value.value);
}

function reputation() {
  return readTuple(REP, "get-reputation", [Cl.principal(provider)]);
}

function stxTransfers(events: any[]) {
  return events.filter((event) => event.event === "stx_transfer_event");
}

function ftTransfers(events: any[]) {
  return events.filter((event) => event.event === "ft_transfer_event");
}

function tokenBalance(principal: string) {
  const response: any = simnet.callReadOnlyFn(
    TOKEN,
    "get-balance",
    [Cl.principal(principal)],
    owner
  ).result;
  return Number(response.value.value);
}

function initialize(contractName: string, appealWindow = QA_APPEAL_WINDOW) {
  return simnet.callPublicFn(
    contractName,
    "initialize-protocol",
    [Cl.uint(appealWindow), Cl.principal(appealAuthority)],
    owner
  );
}

function whitelist(contractName: string) {
  return simnet.callPublicFn(
    REP,
    "add-protocol-caller",
    [contract(contractName)],
    owner
  );
}

function setupSbtc(allowReputation = true) {
  initialize(SBTC);
  simnet.callPublicFn(SBTC, "set-payment-token", [token()], owner);
  if (allowReputation) whitelist(SBTC);
  simnet.callPublicFn(
    TOKEN,
    "mint",
    [Cl.uint(SBTC_MINT), Cl.principal(client)],
    owner
  );
}

function createStx(expiresIn = 1_000) {
  return simnet.callPublicFn(
    STX,
    "create-job",
    [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(simnet.blockHeight + expiresIn),
      Cl.stringAscii("Autonomous STX evaluation"),
    ],
    client
  );
}

function fundAssignSubmitStx() {
  createStx();
  simnet.callPublicFn(STX, "set-budget", [Cl.uint(1), Cl.uint(STX_BUDGET)], client);
  simnet.callPublicFn(STX, "fund-job", [Cl.uint(1)], client);
  simnet.callPublicFn(
    STX,
    "assign-provider",
    [Cl.uint(1), Cl.principal(provider)],
    client
  );
  return simnet.callPublicFn(
    STX,
    "submit-work",
    [Cl.uint(1), Cl.bufferFromAscii("stx-deliverable")],
    provider
  );
}

function recordStx(decisionValue = APPROVE) {
  return simnet.callPublicFn(
    STX,
    "record-decision",
    [Cl.uint(1), Cl.uint(decisionValue), evidenceHash, explanationHash],
    evaluator
  );
}

function createSbtc(expiresIn = 1_000) {
  return simnet.callPublicFn(
    SBTC,
    "create-job",
    [
      Cl.none(),
      Cl.principal(evaluator),
      Cl.uint(simnet.blockHeight + expiresIn),
      Cl.stringAscii("Autonomous sBTC evaluation"),
    ],
    client
  );
}

function fundAssignSubmitSbtc() {
  createSbtc();
  simnet.callPublicFn(SBTC, "set-budget", [Cl.uint(1), Cl.uint(SBTC_BUDGET)], client);
  simnet.callPublicFn(SBTC, "fund-job", [Cl.uint(1), token()], client);
  simnet.callPublicFn(
    SBTC,
    "assign-provider",
    [Cl.uint(1), Cl.principal(provider)],
    client
  );
  return simnet.callPublicFn(
    SBTC,
    "submit-work",
    [Cl.uint(1), Cl.bufferFromAscii("sbtc-deliverable")],
    provider
  );
}

function recordSbtc(decisionValue = APPROVE) {
  return simnet.callPublicFn(
    SBTC,
    "record-decision",
    [Cl.uint(1), Cl.uint(decisionValue), evidenceHash, explanationHash],
    evaluator
  );
}

describe("autonomous evaluator – one-time configuration", () => {
  it("blocks jobs until configured and restricts initialization to the owner", () => {
    expect(createStx().result).toBeErr(Cl.uint(824));
    expect(
      simnet.callPublicFn(
        STX,
        "initialize-protocol",
        [Cl.uint(QA_APPEAL_WINDOW), Cl.principal(appealAuthority)],
        client
      ).result
    ).toBeErr(Cl.uint(800));
    expect(initialize(STX, 12).result).toBeErr(Cl.uint(826));
    expect(
      simnet.callPublicFn(
        STX,
        "initialize-protocol",
        [Cl.uint(QA_APPEAL_WINDOW), Cl.principal(owner)],
        owner
      ).result
    ).toBeErr(Cl.uint(827));
    expect(initialize(STX).result).toBeOk(Cl.bool(true));
    expect(initialize(STX).result).toBeErr(Cl.uint(825));
  });

  it("accepts only the approved QA and mainnet appeal policies", () => {
    expect(initialize(STX, MAINNET_APPEAL_WINDOW).result).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn(STX, "get-appeal-window", [], owner).result
    ).toBeOk(Cl.uint(MAINNET_APPEAL_WINDOW));

    expect(initialize(SBTC, QA_APPEAL_WINDOW).result).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn(SBTC, "get-appeal-window", [], owner).result
    ).toBeOk(Cl.uint(QA_APPEAL_WINDOW));
  });

  it("rotates the authority in two steps and pins existing jobs", () => {
    initialize(STX);
    createStx();
    expect(job(STX)["appeal-authority"]).toBePrincipal(appealAuthority);

    expect(
      simnet.callPublicFn(
        STX,
        "propose-appeal-authority",
        [Cl.principal(client)],
        owner
      ).result
    ).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn(STX, "accept-appeal-authority", [], provider).result)
      .toBeErr(Cl.uint(840));
    expect(simnet.callPublicFn(STX, "accept-appeal-authority", [], client).result)
      .toBeOk(Cl.bool(true));

    expect(job(STX)["appeal-authority"]).toBePrincipal(appealAuthority);
    expect(simnet.callReadOnlyFn(STX, "get-appeal-authority", [], owner).result)
      .toBeOk(Cl.principal(client));
  });
});

describe("agentic-commerce-v5 – autonomous decision and appeal lifecycle", () => {
  beforeEach(() => {
    initialize(STX);
    whitelist(STX);
  });

  it("records a verifiable decision without moving escrow or reputation", () => {
    fundAssignSubmitStx();
    const before = escrow(STX);
    const result = recordStx(APPROVE);

    expect(result.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(result.events)).toHaveLength(0);
    expect(status(STX)).toBe(7);
    expect(escrow(STX)).toBe(before);
    expect(decision(STX)["original-decision"]).toBeUint(APPROVE);
    expect(Number(decision(STX)["appeal-deadline"].value))
      .toBe(Number(decision(STX)["decided-at-burn"].value) + QA_APPEAL_WINDOW);
    expect(reputation()["completed-jobs"]).toBeUint(0);
    expect(reputation()["disputed-jobs"]).toBeUint(0);
    expect(
      simnet.callPublicFn(
        STX,
        "rate-provider",
        [Cl.uint(1), Cl.uint(5), Cl.stringAscii("not final")],
        client
      ).result
    ).toBeErr(Cl.uint(803));
  });

  it("rejects unauthorized, invalid and unverifiable decisions", () => {
    fundAssignSubmitStx();
    expect(
      simnet.callPublicFn(
        STX,
        "record-decision",
        [Cl.uint(1), Cl.uint(APPROVE), evidenceHash, explanationHash],
        provider
      ).result
    ).toBeErr(Cl.uint(809));
    expect(
      simnet.callPublicFn(
        STX,
        "record-decision",
        [Cl.uint(1), Cl.uint(9), evidenceHash, explanationHash],
        evaluator
      ).result
    ).toBeErr(Cl.uint(828));
    expect(
      simnet.callPublicFn(
        STX,
        "record-decision",
        [Cl.uint(1), Cl.uint(APPROVE), zeroHash, explanationHash],
        evaluator
      ).result
    ).toBeErr(Cl.uint(834));
    expect(
      simnet.callPublicFn(
        STX,
        "record-decision",
        [Cl.uint(1), Cl.uint(APPROVE), evidenceHash, zeroHash],
        evaluator
      ).result
    ).toBeErr(Cl.uint(834));
    expect(status(STX)).toBe(2);
    expect(escrow(STX)).toBe(STX_BUDGET);
  });

  it("accepts an evaluator decision at the exact Bitcoin review deadline", () => {
    fundAssignSubmitStx();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW - 1);
    expect(recordStx(APPROVE).result).toBeOk(Cl.bool(true));

    // Once the evaluator has decided, the old review-timeout path is disabled.
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    expect(
      simnet.callPublicFn(STX, "settle-review-timeout", [Cl.uint(1)], outsider).result
    ).toBeErr(Cl.uint(803));
  });

  it("finalizes an unappealed approval only after the deadline and exactly once", () => {
    fundAssignSubmitStx();
    recordStx(APPROVE);
    // The failed transaction above still consumes one simulated burn block.
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW - 2);

    expect(
      simnet.callPublicFn(STX, "finalize-decision", [Cl.uint(1)], outsider).result
    ).toBeErr(Cl.uint(832));
    simnet.mineEmptyBurnBlocks(2);

    const settled = simnet.callPublicFn(STX, "finalize-decision", [Cl.uint(1)], outsider);
    expect(settled.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(settled.events)).toHaveLength(1);
    expect(stxTransfers(settled.events)[0].data.recipient).toBe(provider);
    expect(stxTransfers(settled.events)[0].data.amount).toBe(String(STX_BUDGET));
    expect(status(STX)).toBe(3);
    expect(escrow(STX)).toBe(0);
    expect(reputation()["completed-jobs"]).toBeUint(1);

    expect(
      simnet.callPublicFn(STX, "finalize-decision", [Cl.uint(1)], outsider).result
    ).toBeErr(Cl.uint(803));
    expect(reputation()["completed-jobs"]).toBeUint(1);
  });

  it("finalizes an unappealed rejection by refunding only the client", () => {
    fundAssignSubmitStx();
    recordStx(REJECT);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW + 1);

    const settled = simnet.callPublicFn(STX, "finalize-decision", [Cl.uint(1)], outsider);
    expect(settled.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(settled.events)).toHaveLength(1);
    expect(stxTransfers(settled.events)[0].data.recipient).toBe(client);
    expect(stxTransfers(settled.events)[0].data.amount).toBe(String(STX_BUDGET));
    expect(status(STX)).toBe(4);
    expect(escrow(STX)).toBe(0);
    expect(reputation()["disputed-jobs"]).toBeUint(1);
  });

  it("accepts the decision-specific appellant at the exact appeal boundary", () => {
    fundAssignSubmitStx();
    recordStx(APPROVE);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW - 1);
    expect(
      simnet.callPublicFn(
        STX,
        "appeal-decision",
        [Cl.uint(1), appealHash],
        client
      ).result
    ).toBeOk(Cl.bool(true));
    expect(status(STX)).toBe(8);
    expect(escrow(STX)).toBe(STX_BUDGET);
    expect(reputation()["completed-jobs"]).toBeUint(0);
  });

  it("rejects the wrong appellant and all appeals after the deadline", () => {
    fundAssignSubmitStx();
    recordStx(APPROVE);
    expect(
      simnet.callPublicFn(
        STX,
        "appeal-decision",
        [Cl.uint(1), zeroHash],
        client
      ).result
    ).toBeErr(Cl.uint(834));
    expect(
      simnet.callPublicFn(
        STX,
        "appeal-decision",
        [Cl.uint(1), appealHash],
        provider
      ).result
    ).toBeErr(Cl.uint(830));

    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW);
    expect(
      simnet.callPublicFn(
        STX,
        "appeal-decision",
        [Cl.uint(1), appealHash],
        client
      ).result
    ).toBeErr(Cl.uint(831));
    expect(status(STX)).toBe(7);
    expect(escrow(STX)).toBe(STX_BUDGET);
  });

  it("allows the pinned authority to resolve at the exact second deadline", () => {
    fundAssignSubmitStx();
    recordStx(APPROVE);
    simnet.callPublicFn(STX, "appeal-decision", [Cl.uint(1), appealHash], client);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW - 1);

    expect(
      simnet.callPublicFn(
        STX,
        "resolve-appeal",
        [Cl.uint(1), Cl.uint(REJECT), resolutionHash],
        appealAuthority
      ).result
    ).toBeOk(Cl.bool(true));
    expect(status(STX)).toBe(4);
    expect(escrow(STX)).toBe(0);
  });

  it("lets only the pinned human authority reverse an approval", () => {
    fundAssignSubmitStx();
    recordStx(APPROVE);
    simnet.callPublicFn(STX, "appeal-decision", [Cl.uint(1), appealHash], client);

    expect(
      simnet.callPublicFn(
        STX,
        "resolve-appeal",
        [Cl.uint(1), Cl.uint(REJECT), resolutionHash],
        client
      ).result
    ).toBeErr(Cl.uint(833));

    const resolved = simnet.callPublicFn(
      STX,
      "resolve-appeal",
      [Cl.uint(1), Cl.uint(REJECT), resolutionHash],
      appealAuthority
    );
    expect(resolved.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(resolved.events)).toHaveLength(1);
    expect(stxTransfers(resolved.events)[0].data.recipient).toBe(client);
    expect(status(STX)).toBe(4);
    expect(escrow(STX)).toBe(0);
    expect(decision(STX)["final-decision"]).toBeSome(Cl.uint(REJECT));
    expect(reputation()["disputed-jobs"]).toBeUint(1);
  });

  it("lets the provider appeal a rejection and the authority reverse it", () => {
    fundAssignSubmitStx();
    recordStx(REJECT);
    expect(
      simnet.callPublicFn(
        STX,
        "appeal-decision",
        [Cl.uint(1), appealHash],
        client
      ).result
    ).toBeErr(Cl.uint(830));
    expect(
      simnet.callPublicFn(
        STX,
        "appeal-decision",
        [Cl.uint(1), appealHash],
        provider
      ).result
    ).toBeOk(Cl.bool(true));

    const resolved = simnet.callPublicFn(
      STX,
      "resolve-appeal",
      [Cl.uint(1), Cl.uint(APPROVE), resolutionHash],
      appealAuthority
    );
    expect(resolved.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(resolved.events)[0].data.recipient).toBe(provider);
    expect(status(STX)).toBe(3);
    expect(reputation()["completed-jobs"]).toBeUint(1);
  });

  it("cannot lock disputed funds if the human authority is unavailable", () => {
    fundAssignSubmitStx();
    recordStx(REJECT);
    simnet.callPublicFn(STX, "appeal-decision", [Cl.uint(1), appealHash], provider);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW - 1);

    expect(
      simnet.callPublicFn(STX, "settle-appeal-timeout", [Cl.uint(1)], client).result
    ).toBeErr(Cl.uint(836));
    simnet.mineEmptyBurnBlocks(2);

    expect(
      simnet.callPublicFn(
        STX,
        "resolve-appeal",
        [Cl.uint(1), Cl.uint(APPROVE), resolutionHash],
        appealAuthority
      ).result
    ).toBeErr(Cl.uint(835));

    const settled = simnet.callPublicFn(
      STX,
      "settle-appeal-timeout",
      [Cl.uint(1)],
      client
    );
    expect(settled.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(settled.events)).toHaveLength(1);
    expect(stxTransfers(settled.events)[0].data.recipient).toBe(client);
    expect(status(STX)).toBe(4);
    expect(escrow(STX)).toBe(0);
    expect(reputation()["disputed-jobs"]).toBeUint(1);

    expect(
      simnet.callPublicFn(
        STX,
        "resolve-appeal",
        [Cl.uint(1), Cl.uint(APPROVE), resolutionHash],
        appealAuthority
      ).result
    ).toBeErr(Cl.uint(803));
  });

  it("preserves the permissionless provider payout when no decision arrives", () => {
    fundAssignSubmitStx();
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    const settled = simnet.callPublicFn(
      STX,
      "settle-review-timeout",
      [Cl.uint(1)],
      client
    );
    expect(settled.result).toBeOk(Cl.bool(true));
    expect(stxTransfers(settled.events)[0].data.recipient).toBe(provider);
    expect(status(STX)).toBe(6);
    expect(escrow(STX)).toBe(0);
    expect(reputation()["completed-jobs"]).toBeUint(0);
    expect(reputation()["disputed-jobs"]).toBeUint(0);
  });
});

describe("sbtc-commerce-v4 – autonomous settlement and token conservation", () => {
  beforeEach(() => setupSbtc());

  it("pins sBTC, records no-transfer evidence, then pays exactly once", () => {
    fundAssignSubmitSbtc();
    expect(
      simnet.callReadOnlyFn(SBTC, "get-job-payment-token", [Cl.uint(1)], owner).result
    ).toBeOk(token());
    const recorded = recordSbtc(APPROVE);
    expect(recorded.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(recorded.events)).toHaveLength(0);
    expect(escrow(SBTC)).toBe(SBTC_BUDGET);

    // Rotating the future default does not alter the token pinned to this job.
    simnet.callPublicFn(SBTC, "set-payment-token", [contract("agent-registry")], owner);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW + 1);
    const before = tokenBalance(provider);
    const settled = simnet.callPublicFn(
      SBTC,
      "finalize-decision",
      [Cl.uint(1), token()],
      outsider
    );
    expect(settled.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(settled.events)).toHaveLength(1);
    expect(tokenBalance(provider)).toBe(before + SBTC_BUDGET);
    expect(status(SBTC)).toBe(3);
    expect(escrow(SBTC)).toBe(0);
    expect(reputation()["completed-jobs"]).toBeUint(1);
    expect(
      simnet.callPublicFn(
        SBTC,
        "finalize-decision",
        [Cl.uint(1), token()],
        outsider
      ).result
    ).toBeErr(Cl.uint(903));
  });

  it("rejects a different SIP-010 token at settlement without moving funds", () => {
    fundAssignSubmitSbtc();
    recordSbtc(APPROVE);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW + 1);
    const providerBefore = tokenBalance(provider);

    expect(
      simnet.callPublicFn(
        SBTC,
        "finalize-decision",
        [Cl.uint(1), contract(ALT_TOKEN)],
        outsider
      ).result
    ).toBeErr(Cl.uint(911));
    expect(tokenBalance(provider)).toBe(providerBefore);
    expect(status(SBTC)).toBe(7);
    expect(escrow(SBTC)).toBe(SBTC_BUDGET);
  });

  it("supports a provider appeal that reverses rejection into exact sBTC payout", () => {
    fundAssignSubmitSbtc();
    recordSbtc(REJECT);
    expect(
      simnet.callPublicFn(
        SBTC,
        "appeal-decision",
        [Cl.uint(1), appealHash],
        provider
      ).result
    ).toBeOk(Cl.bool(true));

    const providerBefore = tokenBalance(provider);
    const clientBefore = tokenBalance(client);
    const resolved = simnet.callPublicFn(
      SBTC,
      "resolve-appeal",
      [Cl.uint(1), Cl.uint(APPROVE), resolutionHash, token()],
      appealAuthority
    );
    expect(resolved.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(resolved.events)).toHaveLength(1);
    expect(tokenBalance(provider)).toBe(providerBefore + SBTC_BUDGET);
    expect(tokenBalance(client)).toBe(clientBefore);
    expect(status(SBTC)).toBe(3);
    expect(escrow(SBTC)).toBe(0);
    expect(reputation()["completed-jobs"]).toBeUint(1);
  });

  it("falls back to the original sBTC decision after appeal-resolution timeout", () => {
    fundAssignSubmitSbtc();
    recordSbtc(APPROVE);
    simnet.callPublicFn(SBTC, "appeal-decision", [Cl.uint(1), appealHash], client);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW + 1);

    const providerBefore = tokenBalance(provider);
    const settled = simnet.callPublicFn(
      SBTC,
      "settle-appeal-timeout",
      [Cl.uint(1), token()],
      outsider
    );
    expect(settled.result).toBeOk(Cl.bool(true));
    expect(ftTransfers(settled.events)).toHaveLength(1);
    expect(tokenBalance(provider)).toBe(providerBefore + SBTC_BUDGET);
    expect(status(SBTC)).toBe(3);
    expect(escrow(SBTC)).toBe(0);
    expect(reputation()["completed-jobs"]).toBeUint(1);
  });

  it("keeps payout final when reputation synchronization initially fails", () => {
    simnet.callPublicFn(REP, "remove-protocol-caller", [contract(SBTC)], owner);
    fundAssignSubmitSbtc();
    recordSbtc(APPROVE);
    simnet.mineEmptyBurnBlocks(QA_APPEAL_WINDOW + 1);
    const providerBefore = tokenBalance(provider);

    expect(
      simnet.callPublicFn(
        SBTC,
        "finalize-decision",
        [Cl.uint(1), token()],
        outsider
      ).result
    ).toBeOk(Cl.bool(true));
    expect(tokenBalance(provider)).toBe(providerBefore + SBTC_BUDGET);
    expect(readTuple(SBTC, "get-reputation-sync", [Cl.uint(1)]).pending).toBeBool(true);

    whitelist(SBTC);
    expect(
      simnet.callPublicFn(SBTC, "retry-reputation-sync", [Cl.uint(1)], client).result
    ).toBeOk(Cl.bool(true));
    expect(readTuple(SBTC, "get-reputation-sync", [Cl.uint(1)]).pending).toBeBool(false);
    expect(reputation()["completed-jobs"]).toBeUint(1);
  });
});
