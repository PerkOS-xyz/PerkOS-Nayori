import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const client = accounts.get("wallet_1")!;
const provider = accounts.get("wallet_2")!;
const evaluator = accounts.get("wallet_3")!;

const BUDGET = 1_000_000; // 1 STX in micro-STX
const C = "agentic-commerce";

function stxTransfers(events: any[]) {
  return events.filter((e) => e.event === "stx_transfer_event");
}

function createJob(sender = client) {
  return simnet.callPublicFn(
    C,
    "create-job",
    [
      Cl.none(), // provider (optional) – assigned later
      Cl.principal(evaluator),
      Cl.uint(simnet.blockHeight + 1000),
      Cl.stringAscii("Summarize the whitepaper"),
    ],
    sender
  );
}

/** create -> set-budget -> fund, returns nothing (job id is always u1 in a fresh simnet) */
function createAndFund() {
  createJob();
  simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);
  return simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client);
}

/**
 * complete-job / reject-job call into reputation-registry-v2, which only accepts
 * whitelisted protocol-callers. Register the commerce contract as one.
 */
function whitelistCommerce() {
  return simnet.callPublicFn(
    "reputation-registry-v2",
    "add-protocol-caller",
    [Cl.contractPrincipal(deployer, "agentic-commerce")],
    deployer
  );
}

function statusOf(jobId = 1): number {
  const job: any = simnet.callReadOnlyFn(C, "get-job", [Cl.uint(jobId)], deployer)
    .result;
  // (ok tuple) -> value.status.value (string)
  return Number(job.value.value.status.value);
}

describe("agentic-commerce – job lifecycle & escrow", () => {
  it("happy path: create -> fund (escrow) -> assign -> submit -> complete (payout)", () => {
    whitelistCommerce();

    // create
    expect(createJob().result).toBeOk(Cl.uint(1));
    expect(statusOf()).toBe(0); // OPEN

    // set budget
    expect(
      simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client)
        .result
    ).toBeOk(Cl.bool(true));

    // fund -> STX leaves client into the contract escrow
    const fund = simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client);
    expect(fund.result).toBeOk(Cl.bool(true));
    const fundXfer = stxTransfers(fund.events);
    expect(fundXfer.length).toBe(1);
    expect(fundXfer[0].data.amount).toBe(String(BUDGET));
    expect(fundXfer[0].data.sender).toBe(client);
    expect(statusOf()).toBe(1); // FUNDED
    expect(
      simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result
    ).toBeOk(Cl.uint(BUDGET));

    // assign provider (only client) + submit work (only provider)
    expect(
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client)
        .result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("deliverable")], provider)
        .result
    ).toBeOk(Cl.bool(true));
    expect(statusOf()).toBe(2); // SUBMITTED

    // complete (only evaluator) -> escrow pays the provider
    const complete = simnet.callPublicFn(C, "complete-job", [Cl.uint(1)], evaluator);
    expect(complete.result).toBeOk(Cl.bool(true));
    const payout = stxTransfers(complete.events);
    expect(payout.length).toBe(1);
    expect(payout[0].data.amount).toBe(String(BUDGET));
    expect(payout[0].data.recipient).toBe(provider);
    expect(statusOf()).toBe(3); // COMPLETED
    // escrow cleared
    expect(
      simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result
    ).toBeOk(Cl.uint(0));
  });

  it("completing a job records it on the provider's reputation", () => {
    whitelistCommerce();
    createAndFund();
    simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
    simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("deliverable")], provider);
    expect(
      simnet.callPublicFn(C, "complete-job", [Cl.uint(1)], evaluator).result
    ).toBeOk(Cl.bool(true));

    expect(
      simnet.callReadOnlyFn(
        "reputation-registry-v2",
        "get-reputation",
        [Cl.principal(provider)],
        deployer
      ).result
    ).toBeOk(
      Cl.tuple({
        "total-score": Cl.uint(0),
        "rating-count": Cl.uint(0),
        "average-score-x100": Cl.uint(0),
        "completed-jobs": Cl.uint(1),
        "disputed-jobs": Cl.uint(0),
      })
    );
  });

  it("reject on submitted work refunds the client", () => {
    whitelistCommerce();
    createAndFund();
    simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
    simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("bad")], provider);

    const reject = simnet.callPublicFn(C, "reject-job", [Cl.uint(1)], evaluator);
    expect(reject.result).toBeOk(Cl.bool(true));
    const refund = stxTransfers(reject.events);
    expect(refund.length).toBe(1);
    expect(refund[0].data.amount).toBe(String(BUDGET));
    expect(refund[0].data.recipient).toBe(client);
    expect(statusOf()).toBe(4); // REJECTED
  });

  it("expire refunds a funded job once past expiry", () => {
    // short-lived job
    simnet.callPublicFn(
      C,
      "create-job",
      [Cl.none(), Cl.principal(evaluator), Cl.uint(simnet.blockHeight + 5), Cl.stringAscii("short job")],
      client
    );
    simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);
    simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client);

    simnet.mineEmptyBlocks(10); // advance past expired-at

    const expire = simnet.callPublicFn(C, "expire-job", [Cl.uint(1)], deployer);
    expect(expire.result).toBeOk(Cl.bool(true));
    const refund = stxTransfers(expire.events);
    expect(refund.length).toBe(1);
    expect(refund[0].data.recipient).toBe(client);
    expect(statusOf()).toBe(5); // EXPIRED
  });

  describe("guards", () => {
    it("cannot fund a job with no budget (ERR_INVALID_BUDGET u205)", () => {
      createJob();
      expect(
        simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client).result
      ).toBeErr(Cl.uint(205));
    });

    it("cannot fund twice (ERR_ALREADY_FUNDED u210)", () => {
      createAndFund();
      // second fund: job is no longer OPEN -> ERR_INVALID_STATUS u203
      expect(
        simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client).result
      ).toBeErr(Cl.uint(203));
    });

    it("only the client can set the budget (ERR_NOT_CLIENT u207)", () => {
      createJob();
      expect(
        simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], provider)
          .result
      ).toBeErr(Cl.uint(207));
    });

    it("only the evaluator can complete (ERR_NOT_EVALUATOR u209)", () => {
      createAndFund();
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("x")], provider);
      expect(
        simnet.callPublicFn(C, "complete-job", [Cl.uint(1)], client).result
      ).toBeErr(Cl.uint(209));
    });
  });

  describe("expiry edge cases", () => {
    it("expire on a FUNDED job past expiry refunds the client and sets status EXPIRED (u5)", () => {
      // short-lived job
      simnet.callPublicFn(
        C,
        "create-job",
        [Cl.none(), Cl.principal(evaluator), Cl.uint(simnet.blockHeight + 5), Cl.stringAscii("short funded job")],
        client
      );
      simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);
      simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client);
      expect(
        simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result
      ).toBeOk(Cl.uint(BUDGET));

      simnet.mineEmptyBlocks(10); // advance past expired-at

      const expire = simnet.callPublicFn(C, "expire-job", [Cl.uint(1)], deployer);
      expect(expire.result).toBeOk(Cl.bool(true));

      const refund = stxTransfers(expire.events);
      expect(refund.length).toBe(1);
      expect(refund[0].data.amount).toBe(String(BUDGET));
      expect(refund[0].data.recipient).toBe(client);
      expect(statusOf()).toBe(5); // EXPIRED

      // escrow cleared after refund
      expect(
        simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result
      ).toBeOk(Cl.uint(0));
    });

    it("expire on an unfunded OPEN job past expiry just expires it (no STX transfer)", () => {
      simnet.callPublicFn(
        C,
        "create-job",
        [Cl.none(), Cl.principal(evaluator), Cl.uint(simnet.blockHeight + 5), Cl.stringAscii("short open job")],
        client
      );
      expect(statusOf()).toBe(0); // OPEN

      simnet.mineEmptyBlocks(10); // advance past expired-at

      const expire = simnet.callPublicFn(C, "expire-job", [Cl.uint(1)], deployer);
      expect(expire.result).toBeOk(Cl.bool(true));
      expect(stxTransfers(expire.events).length).toBe(0); // nothing was escrowed
      expect(statusOf()).toBe(5); // EXPIRED
    });

    it("cannot expire a job before its expiry (ERR_NOT_EXPIRED u216)", () => {
      // long-lived job (default createJob uses +1000 blocks)
      createJob();
      expect(
        simnet.callPublicFn(C, "expire-job", [Cl.uint(1)], deployer).result
      ).toBeErr(Cl.uint(216));
    });
  });

  describe("more guards", () => {
    it("set-budget on a non-OPEN job returns ERR_INVALID_STATUS (u203)", () => {
      createAndFund(); // now FUNDED, no longer OPEN
      expect(
        simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client).result
      ).toBeErr(Cl.uint(203));
    });

    it("assign-provider by a non-client returns ERR_NOT_CLIENT (u207)", () => {
      createAndFund(); // FUNDED so the status guard passes and we reach the client check
      expect(
        simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], provider)
          .result
      ).toBeErr(Cl.uint(207));
    });

    it("submit-work by a non-provider returns ERR_NOT_PROVIDER (u208)", () => {
      createAndFund();
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      // evaluator (not the assigned provider) tries to submit
      expect(
        simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("x")], evaluator)
          .result
      ).toBeErr(Cl.uint(208));
    });

    it("reject-job by a non-evaluator returns ERR_NOT_EVALUATOR (u209)", () => {
      whitelistCommerce();
      createAndFund();
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("work")], provider);
      expect(
        simnet.callPublicFn(C, "reject-job", [Cl.uint(1)], provider).result
      ).toBeErr(Cl.uint(209));
    });
  });

  describe("v2 hardening", () => {
    it("client cannot reject delivered work and reclaim escrow", () => {
      whitelistCommerce();
      createAndFund();
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("work")], provider);

      expect(
        simnet.callPublicFn(C, "reject-job", [Cl.uint(1)], client).result
      ).toBeErr(Cl.uint(209));
      expect(statusOf()).toBe(2);
      expect(
        simnet.callReadOnlyFn(C, "get-escrow-balance", [Cl.uint(1)], deployer).result
      ).toBeOk(Cl.uint(BUDGET));
    });

    it("client, provider and evaluator must be distinct", () => {
      expect(
        simnet.callPublicFn(
          C,
          "create-job",
          [
            Cl.none(),
            Cl.principal(client),
            Cl.uint(simnet.blockHeight + 100),
            Cl.stringAscii("self evaluated"),
          ],
          client
        ).result
      ).toBeErr(Cl.uint(213));

      expect(
        simnet.callPublicFn(
          C,
          "create-job",
          [
            Cl.some(Cl.principal(evaluator)),
            Cl.principal(evaluator),
            Cl.uint(simnet.blockHeight + 100),
            Cl.stringAscii("same provider and evaluator"),
          ],
          client
        ).result
      ).toBeErr(Cl.uint(213));
    });

    it("submit-work and complete-job are refused after expiry", () => {
      simnet.callPublicFn(
        C,
        "create-job",
        [
          Cl.none(),
          Cl.principal(evaluator),
          Cl.uint(simnet.blockHeight + 20),
          Cl.stringAscii("short settlement window"),
        ],
        client
      );
      simnet.callPublicFn(C, "set-budget", [Cl.uint(1), Cl.uint(BUDGET)], client);
      simnet.callPublicFn(C, "fund-job", [Cl.uint(1)], client);
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      simnet.mineEmptyBlocks(25);

      expect(
        simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("late")], provider)
          .result
      ).toBeErr(Cl.uint(204));

      simnet.callPublicFn(
        C,
        "create-job",
        [
          Cl.none(),
          Cl.principal(evaluator),
          Cl.uint(simnet.blockHeight + 20),
          Cl.stringAscii("short evaluation window"),
        ],
        client
      );
      simnet.callPublicFn(C, "set-budget", [Cl.uint(2), Cl.uint(BUDGET)], client);
      simnet.callPublicFn(C, "fund-job", [Cl.uint(2)], client);
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(2), Cl.principal(provider)], client);
      simnet.callPublicFn(C, "submit-work", [Cl.uint(2), Cl.bufferFromAscii("on time")], provider);
      simnet.mineEmptyBlocks(25);

      expect(
        simnet.callPublicFn(C, "complete-job", [Cl.uint(2)], evaluator).result
      ).toBeErr(Cl.uint(204));
    });

    it("only job parties can rate a completed provider, once per rater", () => {
      whitelistCommerce();
      createAndFund();
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("work")], provider);
      simnet.callPublicFn(C, "complete-job", [Cl.uint(1)], evaluator);

      expect(
        simnet.callPublicFn(
          C,
          "rate-provider",
          [Cl.uint(1), Cl.uint(5), Cl.stringAscii("excellent")],
          provider
        ).result
      ).toBeErr(Cl.uint(201));

      expect(
        simnet.callPublicFn(
          C,
          "rate-provider",
          [Cl.uint(1), Cl.uint(5), Cl.stringAscii("excellent")],
          client
        ).result
      ).toBeOk(Cl.bool(true));

      expect(
        simnet.callPublicFn(
          C,
          "rate-provider",
          [Cl.uint(1), Cl.uint(4), Cl.stringAscii("again")],
          client
        ).result
      ).toBeErr(Cl.uint(214));
    });

    it("settlement succeeds even when reputation is not allow-listed", () => {
      createAndFund();
      simnet.callPublicFn(C, "assign-provider", [Cl.uint(1), Cl.principal(provider)], client);
      simnet.callPublicFn(C, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("work")], provider);

      expect(
        simnet.callPublicFn(C, "complete-job", [Cl.uint(1)], evaluator).result
      ).toBeOk(Cl.bool(true));
      expect(statusOf()).toBe(3);
    });
  });
});
