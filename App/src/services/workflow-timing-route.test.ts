import { afterEach, describe, expect, it, vi } from "vitest";
import { Cl } from "@stacks/transactions";
const mock = vi.hoisted(() => ({ read: vi.fn(), job: vi.fn() }));
vi.mock("@stacks/transactions", async original => ({ ...await original<typeof import("@stacks/transactions")>(), fetchCallReadOnlyFunction: mock.read }));
vi.mock("./commerce", () => ({ getCommerceJob: mock.job }));
import { GET } from "../app/api/v1/workflow-timing/route";
import { NETWORK_NAME } from "../constants/network";
const networkId = NETWORK_NAME === "mainnet" ? 1 : 2147483648;
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("timing endpoint", () => {
  const request = (query: string) => new Request("https://example.test/api/v1/workflow-timing?" + query);
  const chain = () => {
    mock.read.mockImplementation(async ({ functionName }: { functionName: string }) => Cl.ok(Cl.uint(functionName === "get-review-window" ? 12 : 144)));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ network_id: networkId, burn_block_height: 101 })));
  };
  it("rejects invalid asset/id without chain calls", async () => {
    for (const q of ["", "asset=usdcx", "asset=stx&jobId=-1", "asset=sbtc&jobId=1.5", "asset=stx&jobId=9007199254740992"]) expect((await GET(request(q))).status).toBe(400);
    expect(mock.read).not.toHaveBeenCalled();
  });
  it("exposes chain windows, explicit baseline scope and no guaranteed SLA", async () => {
    chain(); const res = await GET(request("asset=sbtc")); const body = await res.json();
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.contractWindows).toMatchObject({ source: "on-chain", reviewWindowBurnBlocks: 12, appealWindowBurnBlocks: 144, configurablePerJob: false });
    expect(body.confirmationPolicy.scope).toBe("operator-baseline-not-wallet-enforcement"); expect(body.feedback.targetSeconds).toBeNull();
  });
  it("reports review boundary and removes active clocks after terminal settlement", async () => {
    chain(); mock.job.mockResolvedValue({ id: 15, status: 2, reviewDeadline: 101 });
    expect((await (await GET(request("asset=stx&jobId=15"))).json()).job.review.remainingBurnBlocks).toBe(1);
    mock.job.mockResolvedValue({ id: 15, status: 3, reviewDeadline: 101 });
    expect((await (await GET(request("asset=stx&jobId=15"))).json()).job.review).toBeNull();
  });
  it("fails closed on unavailable windows/height/job or invalid operator policy", async () => {
    chain(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ network_id: networkId, burn_block_height: 0 }))); expect((await GET(request("asset=sbtc"))).status).toBe(503);
    chain(); mock.job.mockResolvedValue(null); expect((await GET(request("asset=stx&jobId=15"))).status).toBe(503);
    chain(); mock.read.mockRejectedValue(Error("private detail")); const response = await GET(request("asset=stx"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private detail");
    chain(); vi.stubEnv("NAYORI_WORKFLOW_BURN_BLOCKS", "-1"); expect((await GET(request("asset=stx"))).status).toBe(503);
  });
  it("rejects cross-network observations and missing decision state", async () => {
    chain(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ network_id: networkId === 1 ? 2147483648 : 1, burn_block_height: 101 })));
    expect((await GET(request("asset=sbtc"))).status).toBe(503);
    chain(); mock.job.mockResolvedValue({ id: 15, status: 7 });
    expect((await GET(request("asset=sbtc&jobId=15"))).status).toBe(503);
  });
});
