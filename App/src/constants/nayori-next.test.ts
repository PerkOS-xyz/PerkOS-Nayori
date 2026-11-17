import { afterEach, describe, expect, it, vi } from "vitest";
import { NEXT_SBTC_TOKENS, resolveNextConfig } from "./nayori-next";

const TESTNET_DEPLOYER = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const MAINNET_DEPLOYER = "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";

describe("next contract generation switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off by default, so the current pages behave as before", () => {
    const config = resolveNextConfig({}, "mainnet");
    expect(config.enabled).toBe(false);
    expect(config.network).toBe("mainnet");
  });

  it("is off when the deployer variable is unset at module load", async () => {
    vi.stubEnv("NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER", "");
    vi.resetModules();
    const module = await import("./nayori-next");
    expect(module.NAYORI_NEXT_ENABLED).toBe(false);
    expect(() => module.assertNextEnabled()).toThrow(/not enabled/);
  });

  it("derives every contract id from the deployer and pins the network's sBTC", () => {
    const config = resolveNextConfig({ deployer: TESTNET_DEPLOYER, network: "testnet" }, "mainnet");
    expect(config.enabled).toBe(true);
    expect(config.network).toBe("testnet");
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
    expect(resolveNextConfig({ deployer: MAINNET_DEPLOYER }, "mainnet").sbtcToken).toBe(
      NEXT_SBTC_TOKENS.mainnet
    );
  });

  it("follows the app network unless a next network is set", () => {
    expect(resolveNextConfig({ deployer: TESTNET_DEPLOYER }, "testnet").network).toBe("testnet");
    expect(() => resolveNextConfig({ deployer: TESTNET_DEPLOYER }, "mainnet")).toThrow(/does not match mainnet/);
  });

  it("rejects invalid deployers and networks", () => {
    expect(() => resolveNextConfig({ network: "devnet" }, "mainnet")).toThrow(/must be "mainnet" or "testnet"/);
    expect(() => resolveNextConfig({ deployer: "not-an-address" }, "mainnet")).toThrow(/standard Stacks address/);
    expect(() =>
      resolveNextConfig({ deployer: `${MAINNET_DEPLOYER}.nayori-escrow-sbtc` }, "mainnet")
    ).toThrow(/standard Stacks address/);
    expect(() => resolveNextConfig({ deployer: "SP000000000000000000002Q6VF78" }, "mainnet")).toThrow(/placeholder/);
    expect(() =>
      resolveNextConfig({ deployer: "ST000000000000000000002AMW42H", network: "testnet" }, "mainnet")
    ).toThrow(/placeholder/);
  });
});
