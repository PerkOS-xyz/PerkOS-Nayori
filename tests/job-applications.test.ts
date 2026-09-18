import { Cl, getAddressFromPublicKey } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const owner = accounts.get("deployer")!;
const client = accounts.get("wallet_1")!;
const provider = accounts.get("wallet_2")!;
const authority = accounts.get("wallet_3")!;
// Public secp256k1 generator, SIMNET fixture only. No keys or external funding.
const treasury = getAddressFromPublicKey(
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "testnet",
);
// Extra applicants: public secp256k1 multiples of the generator, SIMNET fixtures only.
const secondProvider = getAddressFromPublicKey(
  "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  "testnet",
);
const lateProvider = getAddressFromPublicKey(
  "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  "testnet",
);
const APP = "job-applications-v1";
const REGISTRY = "agent-registry";
const STX = "agentic-commerce-v6";
const SBTC = "sbtc-commerce-v5";
const tokenName = "mock-sbtc-token-fees";
const token = Cl.contractPrincipal(owner, tokenName);
const registryCv = Cl.contractPrincipal(owner, REGISTRY);
const ASSET = { [STX]: 1, [SBTC]: 2 } as const;

const app = (fn: string, args: any[], sender: string) => simnet.callPublicFn(APP, fn, args, sender);
const readApp = (fn: string, args: any[] = []): any => simnet.callReadOnlyFn(APP, fn, args, owner).result;

function configure(registry = REGISTRY, stx = STX, sbtc = SBTC) {
  return app("configure", [
    Cl.contractPrincipal(owner, registry),
    Cl.contractPrincipal(owner, stx),
    Cl.contractPrincipal(owner, sbtc),
  ], owner);
}

function initializeEscrow(name: string) {
  expect(simnet.callPublicFn(name, "initialize-protocol",
    [Cl.uint(3), Cl.principal(authority), Cl.principal(treasury)], owner).result).toBeOk(Cl.bool(true));
  if (name === SBTC) {
    expect(simnet.callPublicFn(name, "set-payment-token", [token], owner).result).toBeOk(Cl.bool(true));
    simnet.callPublicFn(tokenName, "mint", [Cl.uint(1_000_000), Cl.principal(client)], owner);
  }
}

function createJob(name: string, assigned: string | null = null) {
  return simnet.callPublicFn(name, "create-job", [
    assigned ? Cl.some(Cl.principal(assigned)) : Cl.none(),
    Cl.principal(owner),
    Cl.uint(simnet.blockHeight + 1000),
    Cl.stringAscii("Open marketplace job"),
  ], client);
}

function fund(name: string) {
  expect(simnet.callPublicFn(name, "set-budget", [Cl.uint(1), Cl.uint(1000)], client).result).toBeOk(Cl.bool(true));
  expect(simnet.callPublicFn(name, "fund-job", name === SBTC ? [Cl.uint(1), token] : [Cl.uint(1)], client).result)
    .toBeOk(Cl.bool(true));
}

function register(wallet: string, sender = wallet) {
  const result = simnet.callPublicFn(REGISTRY, "register-agent", [
    Cl.stringAscii("Marketplace agent"),
    Cl.stringAscii("Takes open jobs"),
    Cl.principal(wallet),
    Cl.list([]),
  ], sender).result as any;
  return Number(result.value.value);
}

const apply = (name: string, agentId: number, sender: string, jobId = 1, registry = registryCv) =>
  app("apply-to-job", [
    Cl.contractPrincipal(owner, name), registry, Cl.uint(jobId), Cl.uint(agentId), Cl.stringAscii("Ready to start today"),
  ], sender);

describe("job-applications-v1: configuration", () => {
  it("is pinned exactly once by the owner with three distinct contracts", () => {
    expect(configure().result).toBeOk(Cl.bool(true));
    expect(configure().result).toBeErr(Cl.uint(1001));
    const config = readApp("get-configuration").value.value;
    expect(config.configured).toBeBool(true);
    expect(config["stx-escrow"]).toBePrincipal(`${owner}.${STX}`);
    expect(config["sbtc-escrow"]).toBePrincipal(`${owner}.${SBTC}`);
    expect(config["agent-registry"]).toBePrincipal(`${owner}.${REGISTRY}`);
  });

  it("rejects other callers and duplicated principals", () => {
    expect(app("configure", [registryCv, Cl.contractPrincipal(owner, STX), Cl.contractPrincipal(owner, SBTC)], client).result)
      .toBeErr(Cl.uint(1000));
    expect(configure(REGISTRY, STX, STX).result).toBeErr(Cl.uint(1013));
    expect(configure(STX, STX, SBTC).result).toBeErr(Cl.uint(1013));
  });

  it("refuses applications until an escrow is pinned, and for escrows that are not pinned", () => {
    initializeEscrow(SBTC);
    expect(createJob(SBTC).result).toBeOk(Cl.uint(1));
    const agentId = register(provider);
    expect(apply(SBTC, agentId, provider).result).toBeErr(Cl.uint(1003));
    // Pin a different sBTC escrow principal: the real v5 is then unknown to this registry.
    expect(configure(REGISTRY, STX, tokenName).result).toBeOk(Cl.bool(true));
    expect(apply(SBTC, agentId, provider).result).toBeErr(Cl.uint(1003));
  });

  it("refuses an agent registry that is not the pinned one", () => {
    initializeEscrow(SBTC);
    expect(createJob(SBTC).result).toBeOk(Cl.uint(1));
    const agentId = register(provider);
    expect(configure(tokenName, STX, SBTC).result).toBeOk(Cl.bool(true));
    expect(apply(SBTC, agentId, provider).result).toBeErr(Cl.uint(1004));
  });
});

for (const name of [SBTC, STX] as const) {
  describe(`job-applications-v1 with ${name}`, () => {
    const asset = Cl.uint(ASSET[name]);
    const setup = () => {
      expect(configure().result).toBeOk(Cl.bool(true));
      initializeEscrow(name);
    };

    it("records an application for an open job and lists the applicant", () => {
      setup();
      expect(createJob(name).result).toBeOk(Cl.uint(1));
      const agentId = register(provider);
      const applied = apply(name, agentId, provider);
      expect(applied.result).toBeOk(Cl.bool(true));
      expect(applied.events.some((e: any) => e.event === "print_event")).toBe(true);
      expect(readApp("get-application-count", [asset, Cl.uint(1)])).toBeUint(1);
      const first = readApp("get-applicant-at", [asset, Cl.uint(1), Cl.uint(0)]).value.value;
      expect(first.applicant).toBePrincipal(provider);
      const stored = first.application.value.value;
      expect(stored["agent-id"]).toBeUint(agentId);
      expect(stored.active).toBeBool(true);
      expect(readApp("get-applicant-at", [asset, Cl.uint(1), Cl.uint(1)])).toBeNone();
    });

    it("accepts funded jobs, several applicants, and lets the client assign the chosen one", () => {
      setup();
      expect(createJob(name).result).toBeOk(Cl.uint(1));
      fund(name);
      expect(apply(name, register(provider), provider).result).toBeOk(Cl.bool(true));
      expect(apply(name, register(secondProvider), secondProvider).result).toBeOk(Cl.bool(true));
      expect(readApp("get-application-count", [asset, Cl.uint(1)])).toBeUint(2);
      expect(simnet.callPublicFn(name, "assign-provider", [Cl.uint(1), Cl.principal(secondProvider)], client).result)
        .toBeOk(Cl.bool(true));
      // Once a provider is assigned the job no longer takes applications.
      expect(apply(name, register(lateProvider), lateProvider).result).toBeErr(Cl.uint(1006));
    });

    it("prevents duplicates and supports withdraw then re-apply without growing the list", () => {
      setup();
      expect(createJob(name).result).toBeOk(Cl.uint(1));
      const agentId = register(provider);
      expect(apply(name, agentId, provider).result).toBeOk(Cl.bool(true));
      expect(apply(name, agentId, provider).result).toBeErr(Cl.uint(1010));
      expect(app("withdraw-application", [asset, Cl.uint(1)], provider).result).toBeOk(Cl.bool(true));
      expect(app("withdraw-application", [asset, Cl.uint(1)], provider).result).toBeErr(Cl.uint(1011));
      expect(app("withdraw-application", [asset, Cl.uint(1)], secondProvider).result).toBeErr(Cl.uint(1011));
      const stored = readApp("get-application", [asset, Cl.uint(1), Cl.principal(provider)]).value.value;
      expect(stored.active).toBeBool(false);
      expect(apply(name, agentId, provider).result).toBeOk(Cl.bool(true));
      expect(readApp("get-application-count", [asset, Cl.uint(1)])).toBeUint(1);
    });

    it("rejects job parties, foreign or inactive agents, and unknown jobs or agents", () => {
      setup();
      expect(createJob(name).result).toBeOk(Cl.uint(1));
      const clientAgent = register(client);
      const evaluatorAgent = register(owner);
      const authorityAgent = register(authority);
      const providerAgent = register(provider);
      expect(apply(name, clientAgent, client).result).toBeErr(Cl.uint(1007));
      expect(apply(name, evaluatorAgent, owner).result).toBeErr(Cl.uint(1007));
      expect(apply(name, authorityAgent, authority).result).toBeErr(Cl.uint(1007));
      expect(apply(name, providerAgent, secondProvider).result).toBeErr(Cl.uint(1008));
      expect(apply(name, 999, provider).result).toBeErr(Cl.uint(102));
      expect(apply(name, providerAgent, provider, 7).result).toBeErr(Cl.uint(name === SBTC ? 902 : 802));
      expect(simnet.callPublicFn(REGISTRY, "deactivate-agent", [Cl.uint(providerAgent)], provider).result)
        .toBeOk(Cl.bool(true));
      expect(apply(name, providerAgent, provider).result).toBeErr(Cl.uint(1009));
    });

    it("rejects jobs that already moved past funding", () => {
      setup();
      expect(createJob(name, provider).result).toBeOk(Cl.uint(1));
      fund(name);
      expect(simnet.callPublicFn(name, "submit-work", [Cl.uint(1), Cl.bufferFromAscii("delivered")], provider).result)
        .toBeOk(Cl.bool(true));
      expect(apply(name, register(secondProvider), secondProvider).result).toBeErr(Cl.uint(1005));
    });
  });
}
