import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_DEPLOYERS,
  NEXT_ROLE_HOLDERS,
  NEXT_SBTC_TOKENS,
  isMultisigAddress,
  nextEscrowAsset,
  resolveNextConfig,
} from "./nayori-next";

const TESTNET_DEPLOYER = "ST3MRPNX0VNWYRSJ07PNTASE5BZ9K5XE57ARZ39DY";
const MAINNET_DEPLOYER = "SP2BM4WCNQM286PFHPGA1BG2YXER0PCG1PKQ5MF1X";

describe("Nayori contract configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("pins the live deployer of each network", () => {
    expect(NEXT_DEPLOYERS).toEqual({ mainnet: MAINNET_DEPLOYER, testnet: TESTNET_DEPLOYER });
    expect(resolveNextConfig({}, "mainnet").deployer).toBe(MAINNET_DEPLOYER);
    expect(resolveNextConfig({}, "testnet").deployer).toBe(TESTNET_DEPLOYER);
  });

  it("needs no variable at module load and follows the app network", async () => {
    vi.stubEnv("NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER", "");
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "testnet");
    vi.resetModules();
    const config = await import("./nayori-next");
    expect(config.NAYORI_NEXT.network).toBe("testnet");
    expect(config.NAYORI_NEXT.contracts.escrowSbtc).toBe(`${TESTNET_DEPLOYER}.nayori-escrow-sbtc`);
  });

  it("derives every contract id from the pinned deployer and pins the network's sBTC", () => {
    const config = resolveNextConfig({}, "testnet");
    expect(config.contracts).toEqual({
      permissions: `${TESTNET_DEPLOYER}.nayori-permissions`,
      roles: `${TESTNET_DEPLOYER}.nayori-roles`,
      reputation: `${TESTNET_DEPLOYER}.nayori-reputation`,
      escrowSbtc: `${TESTNET_DEPLOYER}.nayori-escrow-sbtc`,
      escrowStx: `${TESTNET_DEPLOYER}.nayori-escrow-stx`,
      agents: `${TESTNET_DEPLOYER}.nayori-agents`,
      applications: `${TESTNET_DEPLOYER}.nayori-applications`,
    });
    expect(config.sbtcToken).toBe(NEXT_SBTC_TOKENS.testnet);
    expect(resolveNextConfig({}, "mainnet").sbtcToken).toBe(NEXT_SBTC_TOKENS.mainnet);
  });

  it("accepts the deployer variable only when it equals the pinned deployer", () => {
    expect(resolveNextConfig({ deployer: MAINNET_DEPLOYER }, "mainnet").deployer).toBe(MAINNET_DEPLOYER);
    expect(() => resolveNextConfig({ deployer: TESTNET_DEPLOYER }, "mainnet")).toThrow(/not the reviewed mainnet deployer/);
    expect(() =>
      resolveNextConfig({ deployer: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH" }, "mainnet")
    ).toThrow(/not the reviewed mainnet deployer/);
    expect(() => resolveNextConfig({ deployer: "not-an-address" }, "mainnet")).toThrow(/standard Stacks address/);
    expect(() =>
      resolveNextConfig({ deployer: `${MAINNET_DEPLOYER}.nayori-escrow-sbtc` }, "mainnet")
    ).toThrow(/standard Stacks address/);
  });

  it("refuses a module load with a different deployer", async () => {
    vi.stubEnv("NEXT_PUBLIC_STACKS_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER", "SP000000000000000000002Q6VF78");
    vi.resetModules();
    await expect(import("./nayori-next")).rejects.toThrow(/not the reviewed mainnet deployer/);
  });

  it("names the multisig role holders and recognises multisig accounts", () => {
    expect(isMultisigAddress(NEXT_ROLE_HOLDERS.mainnet.appealAuthority)).toBe(true);
    expect(isMultisigAddress(NEXT_ROLE_HOLDERS.mainnet.treasury)).toBe(true);
    expect(isMultisigAddress("SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1")).toBe(true);
    expect(isMultisigAddress(NEXT_ROLE_HOLDERS.testnet.appealAuthority)).toBe(false);
    expect(isMultisigAddress(MAINNET_DEPLOYER)).toBe(false);
    expect(isMultisigAddress("")).toBe(false);
  });

  it("recognises the live escrow contracts and their assets", () => {
    expect(nextEscrowAsset(`${MAINNET_DEPLOYER}.nayori-escrow-sbtc`, "mainnet")).toBe("sbtc");
    expect(nextEscrowAsset(`${TESTNET_DEPLOYER}.nayori-escrow-stx`, "testnet")).toBe("stx");
    expect(nextEscrowAsset(`${TESTNET_DEPLOYER}.nayori-escrow-stx`, "mainnet")).toBeNull();
    expect(nextEscrowAsset("SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH.nayori-escrow-sbtc", "mainnet")).toBeNull();
    expect(nextEscrowAsset(`${MAINNET_DEPLOYER}.nayori-agents`, "mainnet")).toBeNull();
  });
});
