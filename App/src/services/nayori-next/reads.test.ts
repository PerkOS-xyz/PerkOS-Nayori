import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cl } from "@stacks/transactions";

const { readOnly } = vi.hoisted(() => ({ readOnly: vi.fn() }));
vi.mock("@stacks/transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stacks/transactions")>();
  return { ...actual, fetchCallReadOnlyFunction: readOnly };
});

const DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const CLIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const EVALUATOR = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
const TREASURY = "ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND";
const AUTHORITY = "ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0";

const jobCv = (status: number) =>
  Cl.some(
    Cl.tuple({
      client: Cl.principal(CLIENT),
      evaluator: Cl.principal(EVALUATOR),
      provider: Cl.none(),
      treasury: Cl.principal(TREASURY),
      "appeal-authority": Cl.principal(AUTHORITY),
      budget: Cl.uint(50_000),
      description: Cl.stringAscii("Work"),
      "delivery-deadline": Cl.uint(1_000),
      "delivery-blocks": Cl.uint(144),
      "review-blocks": Cl.uint(36),
      status: Cl.uint(status),
    })
  );

async function loadReads() {
  vi.stubEnv("NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER", DEPLOYER);
  vi.stubEnv("NEXT_PUBLIC_NAYORI_NEXT_NETWORK", "testnet");
  vi.resetModules();
  return import("./reads");
}

describe("next contract reads", () => {
  beforeEach(() => {
    readOnly.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("refuses to read while the next generation is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER", "");
    vi.resetModules();
    const reads = await import("./reads");
    await expect(reads.getNextJobCount("sbtc")).rejects.toThrow(/not enabled/);
    expect(readOnly).not.toHaveBeenCalled();
  });

  it("reads jobs from the configured next escrow on the next network", async () => {
    const reads = await loadReads();
    readOnly.mockResolvedValue(jobCv(1));
    const job = await reads.getNextJob("sbtc", 4);
    expect(job?.statusName).toBe("funded");
    expect(readOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: DEPLOYER,
        contractName: "nayori-escrow-sbtc",
        functionName: "get-job",
        functionArgs: [Cl.uint(4)],
        senderAddress: DEPLOYER,
        network: expect.objectContaining({ chainId: 2147483648 }),
      })
    );
    await reads.getNextJob("stx", 4);
    expect(readOnly.mock.calls[1][0].contractName).toBe("nayori-escrow-stx");
  });

  it("pages jobs newest first and skips missing ids", async () => {
    const reads = await loadReads();
    readOnly.mockImplementation(async ({ functionName, functionArgs }) => {
      if (functionName === "get-job-count") return Cl.uint(5);
      const id = Number(functionArgs[0].value);
      return id === 4 ? Cl.none() : jobCv(0);
    });
    const page = await reads.getNextJobs("sbtc", { limit: 3, offset: 0 });
    expect(page.total).toBe(5);
    expect(page.jobs.map((job) => job.id)).toEqual([5, 3]);
    const last = await reads.getNextJobs("sbtc", { limit: 3, offset: 3 });
    expect(last.jobs.map((job) => job.id)).toEqual([2, 1]);
  });

  it("reads the detail bundle and whether a completed job was rated", async () => {
    const reads = await loadReads();
    readOnly.mockImplementation(async ({ contractName, functionName }) => {
      if (functionName === "get-job") return jobCv(7);
      if (functionName === "get-escrow-balance") return Cl.uint(0);
      if (functionName === "get-outcome") {
        expect(contractName).toBe("nayori-reputation");
        return Cl.some(
          Cl.tuple({
            provider: Cl.principal(CLIENT),
            client: Cl.principal(CLIENT),
            completed: Cl.bool(true),
            value: Cl.uint(50_000),
            rated: Cl.bool(true),
          })
        );
      }
      return Cl.none();
    });
    const detail = await reads.getNextJobDetail("sbtc", 2);
    expect(detail).toEqual(
      expect.objectContaining({ escrow: 0, rated: true, reputationPending: false, submission: null, decision: null })
    );
    const outcomeCall = readOnly.mock.calls.find(([options]) => options.functionName === "get-outcome")![0];
    expect(outcomeCall.functionArgs).toEqual([
      Cl.principal(`${DEPLOYER}.nayori-escrow-sbtc`),
      Cl.uint(2),
    ]);
  });

  it("reads applications, agents and provider stats from their contracts", async () => {
    const reads = await loadReads();
    readOnly.mockImplementation(async ({ functionName }) => {
      if (functionName === "get-applications") {
        return Cl.list([Cl.tuple({ applicant: Cl.principal(CLIENT), deposit: Cl.uint(700) })]);
      }
      if (functionName === "get-agent") return Cl.none();
      if (functionName === "get-agent-count") return Cl.uint(12);
      return Cl.tuple({
        completed: Cl.uint(1),
        rejected: Cl.uint(0),
        "not-delivered": Cl.uint(1),
        "completed-value-sbtc": Cl.uint(50_000),
        "completed-value-stx": Cl.uint(0),
        "distinct-clients": Cl.uint(1),
        "rating-sum": Cl.uint(5),
        "rating-count": Cl.uint(1),
      });
    });
    expect(await reads.getNextApplications(3)).toEqual([{ applicant: CLIENT, deposit: 700 }]);
    expect(await reads.getNextAgent(CLIENT)).toBeNull();
    expect(await reads.getNextAgentCount()).toBe(12);
    expect((await reads.getNextProviderStats(CLIENT)).notDelivered).toBe(1);
    expect(readOnly.mock.calls.map(([options]) => options.contractName)).toEqual([
      "nayori-applications",
      "nayori-agents",
      "nayori-agents",
      "nayori-reputation",
    ]);
  });

  it("checks one allowance on nayori-permissions", async () => {
    const reads = await loadReads();
    readOnly.mockResolvedValue(Cl.some(Cl.some(Cl.uint(905_000))));
    const helper = `${CLIENT}.helper` as const;
    const target = `${DEPLOYER}.nayori-escrow-sbtc` as const;
    expect(await reads.getNextAllowance(EVALUATOR, helper, target)).toEqual({ until: 905_000 });
    expect(readOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        contractName: "nayori-permissions",
        functionName: "get-allowance",
        functionArgs: [Cl.principal(EVALUATOR), Cl.principal(helper), Cl.principal(target)],
      })
    );
  });

  it("reads the Bitcoin height from the next network's API", async () => {
    const reads = await loadReads();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ burn_block_height: 905_123 }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await reads.getNextBurnHeight()).toBe(905_123);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.testnet.hiro.so/v2/info");
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await reads.getNextBurnHeight()).toBe(0);
  });
});
