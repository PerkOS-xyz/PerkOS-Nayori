import { Cl, getAddressFromPublicKey } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

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
const hash = Cl.bufferFromHex("11".repeat(32));
const explanation = Cl.bufferFromHex("22".repeat(32));
const fault = Cl.bufferFromHex("33".repeat(32));
const tokenName = "mock-sbtc-token-fees";
const token = Cl.contractPrincipal(owner, tokenName);
const rep = "reputation-registry-v3";

for (const asset of ["stx", "sbtc"] as const) {
  const ft = asset === "sbtc";
  const name = ft ? "sbtc-commerce-v5" : "agentic-commerce-v6";
  const base = ft ? 900 : 800;
  const assetArgs = ft ? [token] : [];
  const call = (fn: string, args: any[] = [], sender = owner) =>
    simnet.callPublicFn(name, fn, args, sender);
  const read = (fn: string, args: any[] = []): any =>
    simnet.callReadOnlyFn(name, fn, args, owner).result;
  const fee = () => read("get-job-service-fee", [Cl.uint(1)]).value.value;
  const job = () => read("get-job", [Cl.uint(1)]).value.value;
  const settlement = () => fee().settlement.value.value;
  const escrow = () => read("get-escrow-balance", [Cl.uint(1)]);
  const transfers = (result: any) => result.events.filter((e: any) =>
    e.event === (ft ? "ft_transfer_event" : "stx_transfer_event"));
  const balance = (principal: string): bigint => ft
    ? (simnet.callReadOnlyFn(tokenName, "get-balance", [Cl.principal(principal)], owner).result as any).value.value
    : simnet.getAssetsMap().get("STX")!.get(principal) ?? 0n;

  function initialize() {
    expect(call("initialize-protocol", [Cl.uint(3), Cl.principal(authority), Cl.principal(treasury)]).result)
      .toBeOk(Cl.bool(true));
    if (ft) {
      expect(call("set-payment-token", [token]).result).toBeOk(Cl.bool(true));
      simnet.callPublicFn(tokenName, "mint", [Cl.uint(1_000_000), Cl.principal(client)], owner);
    }
    simnet.callPublicFn(rep, "add-protocol-caller", [Cl.contractPrincipal(owner, name)], owner);
  }
  function create(expiresIn = 1000, assigned: string | null = provider) {
    return call("create-job", [assigned ? Cl.some(Cl.principal(assigned)) : Cl.none(),
      Cl.principal(owner), Cl.uint(simnet.blockHeight + expiresIn), Cl.stringAscii("Earned service fee test")], client);
  }
  function prepare(amount = 1000, submitted = true, expiresIn = 1000) {
    expect(create(expiresIn).result).toBeOk(Cl.uint(1));
    expect(call("set-budget", [Cl.uint(1), Cl.uint(amount)], client).result).toBeOk(Cl.bool(true));
    expect(call("fund-job", [Cl.uint(1), ...assetArgs], client).result).toBeOk(Cl.bool(true));
    if (submitted) expect(call("submit-work", [Cl.uint(1), Cl.bufferFromAscii("delivered artifact")], provider).result)
      .toBeOk(Cl.bool(true));
  }
  const record = (decision = 1) => call("record-decision", [Cl.uint(1), Cl.uint(decision), hash, explanation]);
  function finish() {
    simnet.mineEmptyBurnBlocks(5);
    return call("finalize-decision", [Cl.uint(1), ...assetArgs], provider);
  }
  function expectSplit(result: any, recipient: string, gross = 1000, charged = Math.floor(gross / 50)) {
    expect(result.result).toBeOk(Cl.bool(true));
    expect(transfers(result).map((e: any) => [e.data.recipient, e.data.amount]))
      .toEqual(charged > 0 ? [[recipient, String(gross - charged)], [treasury, String(charged)]]
        : [[recipient, String(gross)]]);
    expect(escrow()).toBeOk(Cl.uint(0));
    expect(settlement().gross).toBeUint(gross);
    expect(settlement().net).toBeUint(gross - charged);
    expect(settlement()["charged-fee"]).toBeUint(charged);
    expect(settlement().recipient).toBePrincipal(recipient);
    expect(settlement()["refunded-fee"]).toBeUint(0);
  }

  describe(`${name}: configuration and transparent pricing`, () => {
    it("requires a separate treasury, explicit initialization, owner authority and a fixed 2%", () => {
      expect(create().result).toBeErr(Cl.uint(ft ? 925 : 824));
      const args = [Cl.uint(3), Cl.principal(authority), Cl.principal(treasury)];
      expect(call("initialize-protocol", args, client).result).toBeErr(Cl.uint(base));
      for (const invalid of [owner, authority, `${owner}.${name}`]) {
        expect(call("initialize-protocol", [Cl.uint(3), Cl.principal(authority), Cl.principal(invalid)]).result)
          .toBeErr(Cl.uint(base + 41));
      }
      initialize();
      expect(call("initialize-protocol", args).result).toBeErr(Cl.uint(ft ? 926 : 825));
      const config = read("get-protocol-config").value.value;
      expect(config["service-fee-bps"]).toBeUint(200);
      expect(config.treasury).toBePrincipal(treasury);
    });

    it.each([0n, 1n, 49n, 50n, 51n, 99n, 100n, 1000n, (1n << 128n) - 1n])(
      "quotes exact integer conservation without overflow: %s", amount => {
        expect(read("get-service-fee-for-amount", [Cl.uint(amount)])).toBeOk(Cl.tuple({
          gross: Cl.uint(amount), fee: Cl.uint(amount / 50n), net: Cl.uint(amount - amount / 50n),
          "basis-points": Cl.uint(200),
        }));
      },
    );

    it("prevents treasury from being an economic/evaluation party", () => {
      initialize();
      expect(create(1000, treasury).result).toBeErr(Cl.uint(base + 13));
      expect(call("create-job", [Cl.some(Cl.principal(provider)), Cl.principal(treasury),
        Cl.uint(simnet.blockHeight + 100), Cl.stringAscii("invalid evaluator")], client).result)
        .toBeErr(Cl.uint(base + 13));
      expect(call("create-job", [Cl.some(Cl.principal(provider)), Cl.principal(owner),
        Cl.uint(simnet.blockHeight + 100), Cl.stringAscii("invalid client")], treasury).result)
        .toBeErr(Cl.uint(base + 13));
      expect(call("propose-appeal-authority", [Cl.principal(treasury)]).result)
        .toBeErr(Cl.uint(ft ? 928 : 827));
      create(1000, null);
      call("set-budget", [Cl.uint(1), Cl.uint(1000)], client);
      call("fund-job", [Cl.uint(1), ...assetArgs], client);
      expect(call("assign-provider", [Cl.uint(1), Cl.principal(treasury)], client).result)
        .toBeErr(Cl.uint(base + 13));
    });

    it.each(["owner-first", "authority-first"])("keeps owner/authority/treasury separate during concurrent rotation: %s", order => {
      initialize();
      expect(call("propose-owner", [Cl.principal(treasury)]).result).toBeErr(Cl.uint(base + 22));
      expect(call("propose-owner", [Cl.principal(client)]).result).toBeOk(Cl.bool(true));
      expect(call("propose-appeal-authority", [Cl.principal(client)]).result).toBeOk(Cl.bool(true));
      if (order === "owner-first") {
        expect(call("accept-owner", [], client).result).toBeOk(Cl.bool(true));
        expect(call("accept-appeal-authority", [], client).result).toBeErr(Cl.uint(ft ? 928 : 827));
      } else {
        expect(call("accept-appeal-authority", [], client).result).toBeOk(Cl.bool(true));
        expect(call("accept-owner", [], client).result).toBeErr(Cl.uint(base + 22));
      }
    });
  });

  describe(`${name}: earned service fee lifecycle`, () => {
    beforeEach(initialize);

    it.each([1, 2])("does not collect on funding/recording; splits after decision %s exactly once", decision => {
      const before = balance(treasury);
      prepare();
      expect(balance(treasury)).toBe(before);
      expect(fee()["service-recorded"]).toBeBool(false);
      const result = record(decision);
      expect(result.result).toBeOk(Cl.bool(true));
      expect(transfers(result)).toHaveLength(0);
      expect(fee()["service-recorded"]).toBeBool(true);
      expect(fee().settlement).toBeNone();
      expect(balance(treasury)).toBe(before);
      expect(call("finalize-decision", [Cl.uint(1), ...assetArgs], provider).result)
        .toBeErr(Cl.uint(ft ? 933 : 832));
      expectSplit(finish(), decision === 1 ? provider : client);
      expect(balance(treasury)).toBe(before + 20n);
      expect(job().status).toBeUint(decision === 1 ? 3 : 4);
      const replay = call("finalize-decision", [Cl.uint(1), ...assetArgs], client);
      expect(replay.result).toBeErr(Cl.uint(base + 3));
      expect(balance(treasury)).toBe(before + 20n);
    });

    it.each([1, 49, 50, 51, 99, 100, 1001])("settles rounded fee for budget %s, skips zero transfers", amount => {
      prepare(amount); record();
      expectSplit(finish(), provider, amount);
    });

    it("rejects zero funding and short/zero decision evidence", () => {
      create();
      expect(call("set-budget", [Cl.uint(1), Cl.uint(0)], client).result).toBeErr(Cl.uint(base + 5));
      call("set-budget", [Cl.uint(1), Cl.uint(1000)], client);
      call("fund-job", [Cl.uint(1), ...assetArgs], client);
      call("submit-work", [Cl.uint(1), Cl.bufferFromAscii("work")], provider);
      for (const bad of [Cl.bufferFromHex("11"), Cl.bufferFromHex("00".repeat(32)), Cl.bufferFromHex("")]) {
        expect(call("record-decision", [Cl.uint(1), Cl.uint(1), bad, explanation]).result)
          .toBeErr(Cl.uint(ft ? 935 : 834));
      }
      expect(fee()["service-recorded"]).toBeBool(false);
    });

    it.each([1, 2])("appeal reversal of %s still charges for a performed service, not success", original => {
      prepare(); record(original);
      const appeal = call("appeal-decision", [Cl.uint(1), hash], original === 1 ? client : provider);
      expect(appeal.result).toBeOk(Cl.bool(true));
      expect(transfers(appeal)).toHaveLength(0); // No hidden appeal fee or payment prerequisite.
      expectSplit(call("resolve-appeal", [Cl.uint(1), Cl.uint(original === 1 ? 2 : 1), fault, ...assetArgs], authority),
        original === 1 ? client : provider);
    });

    it.each([1, 2])("appeal-resolution timeout preserves decision %s and charges only the base fee", original => {
      prepare(); record(original);
      call("appeal-decision", [Cl.uint(1), hash], original === 1 ? client : provider);
      simnet.mineEmptyBurnBlocks(5);
      expectSplit(call("settle-appeal-timeout", [Cl.uint(1), ...assetArgs], provider), original === 1 ? provider : client);
    });

    it("review timeout pays 100% with no fee and no invented performed service", () => {
      prepare(); simnet.mineEmptyBurnBlocks(14);
      const result = call("settle-review-timeout", [Cl.uint(1), ...assetArgs], client);
      expect(result.result).toBeOk(Cl.bool(true));
      expect(transfers(result).map((e: any) => [e.data.recipient, e.data.amount]))
        .toEqual([[provider, "1000"]]);
      expect(fee()["service-recorded"]).toBeBool(false);
      expect(fee().settlement).toBeNone();
      expect(escrow()).toBeOk(Cl.uint(0));
      expect(job().status).toBeUint(6);
    });

    it.each([false, true])("expiration retains no fee (funded=%s)", funded => {
      if (funded) prepare(1000, false, 20); else create(20);
      simnet.mineEmptyBlocks(30);
      const result = call("expire-job", [Cl.uint(1), ...assetArgs], provider);
      expect(result.result).toBeOk(Cl.bool(true));
      expect(transfers(result).map((e: any) => [e.data.recipient, e.data.amount]))
        .toEqual(funded ? [[client, "1000"]] : []);
      expect(fee().settlement).toBeNone();
    });

    it.each([1, 2])("waives before settling decision %s without moving money", decision => {
      prepare(); record(decision);
      expect(call("waive-service-fee", [Cl.uint(1), fault], client).result)
        .toBeErr(Cl.uint(ft ? 934 : 833));
      const waiver = call("waive-service-fee", [Cl.uint(1), fault], authority);
      expect(waiver.result).toBeOk(Cl.bool(true));
      expect(transfers(waiver)).toHaveLength(0);
      expect(call("waive-service-fee", [Cl.uint(1), fault], authority).result)
        .toBeErr(Cl.uint(base + 46));
      expectSplit(finish(), decision === 1 ? provider : client, 1000, 0);
    });

    it("requires a real decision and full evidence for a waiver; cannot refund reserved or zero fees", () => {
      prepare(49);
      expect(call("waive-service-fee", [Cl.uint(1), fault], authority).result)
        .toBeErr(Cl.uint(ft ? 930 : 829));
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury).result)
        .toBeErr(Cl.uint(base + 42));
      record();
      for (const bad of [Cl.bufferFromHex("11"), Cl.bufferFromHex("00".repeat(32))]) {
        expect(call("waive-service-fee", [Cl.uint(1), bad], authority).result)
          .toBeErr(Cl.uint(ft ? 935 : 834));
      }
      finish();
      expect(call("waive-service-fee", [Cl.uint(1), fault], authority).result).toBeOk(Cl.bool(true));
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury).result)
        .toBeErr(Cl.uint(base + 44));
      expect(settlement()["refunded-fee"]).toBeUint(0);
    });

    it("does not mark a treasury refund as completed when its funds are unavailable", () => {
      prepare(); record(); finish();
      call("waive-service-fee", [Cl.uint(1), fault], authority);
      const drain = ft
        ? simnet.callPublicFn(tokenName, "transfer", [Cl.uint(20), Cl.principal(treasury), Cl.principal(owner), Cl.none()], treasury)
        : simnet.transferSTX(20, owner, treasury);
      expect(drain.result).toBeOk(Cl.bool(true));
      const before = balance(provider);
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury).result).toBeErr(Cl.uint(1));
      expect(balance(provider)).toBe(before);
      expect(settlement()["refunded-fee"]).toBeUint(0);
      expect(fee().waiver).toBeSome(fault);
      const replenish = ft
        ? simnet.callPublicFn(tokenName, "transfer", [Cl.uint(20), Cl.principal(owner), Cl.principal(treasury), Cl.none()], owner)
        : simnet.transferSTX(20, treasury, owner);
      expect(replenish.result).toBeOk(Cl.bool(true));
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury).result).toBeOk(Cl.bool(true));
      expect(balance(provider)).toBe(before + 20n);
    });

    it("does not spend or waive fees from a second job when settling the first", () => {
      prepare(); record();
      expect(create().result).toBeOk(Cl.uint(2));
      call("set-budget", [Cl.uint(2), Cl.uint(2000)], client);
      call("fund-job", [Cl.uint(2), ...assetArgs], client);
      call("waive-service-fee", [Cl.uint(1), fault], authority);
      expectSplit(finish(), provider, 1000, 0);
      expect(read("get-escrow-balance", [Cl.uint(2)])).toBeOk(Cl.uint(2000));
      expect(read("get-job-service-fee", [Cl.uint(2)]).value.value.waiver).toBeNone();
      call("submit-work", [Cl.uint(2), Cl.bufferFromAscii("second work")], provider);
      expect(call("record-decision", [Cl.uint(2), Cl.uint(1), hash, explanation]).result).toBeOk(Cl.bool(true));
      simnet.mineEmptyBurnBlocks(5);
      const result = call("finalize-decision", [Cl.uint(2), ...assetArgs], provider);
      expect(result.result).toBeOk(Cl.bool(true));
      expect(transfers(result).map((e: any) => [e.data.recipient, e.data.amount]))
        .toEqual([[provider, "1960"], [treasury, "40"]]);
      expect(read("get-escrow-balance", [Cl.uint(2)])).toBeOk(Cl.uint(0));
    });

    it.each([1, 2])("refunds an already charged fee for decision %s from treasury exactly once", decision => {
      prepare(); record(decision); finish();
      const recipient = decision === 1 ? provider : client;
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury).result)
        .toBeErr(Cl.uint(base + 43));
      call("waive-service-fee", [Cl.uint(1), fault], authority);
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], provider).result)
        .toBeErr(Cl.uint(base + 45));
      const before = balance(recipient);
      const result = call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury);
      expect(result.result).toBeOk(Cl.bool(true));
      expect(transfers(result).map((e: any) => [e.data.sender, e.data.recipient, e.data.amount]))
        .toEqual([[treasury, recipient, "20"]]);
      expect(balance(recipient)).toBe(before + 20n);
      expect(settlement()["refunded-fee"]).toBeUint(20);
      expect(escrow()).toBeOk(Cl.uint(0));
      expect(call("refund-service-fee", [Cl.uint(1), ...assetArgs], treasury).result)
        .toBeErr(Cl.uint(base + 44));
    });

    it("only the job-pinned authority can waive after authority rotation", () => {
      prepare(); record();
      call("propose-appeal-authority", [Cl.principal(client)]);
      call("accept-appeal-authority", [], client);
      expect(call("waive-service-fee", [Cl.uint(1), fault], client).result).toBeErr(Cl.uint(ft ? 934 : 833));
      expect(call("waive-service-fee", [Cl.uint(1), fault], authority).result).toBeOk(Cl.bool(true));
    });

    it("reputation retry never repeats the payout or fee", () => {
      simnet.callPublicFn(rep, "remove-protocol-caller", [Cl.contractPrincipal(owner, name)], owner);
      prepare(); record(); expectSplit(finish(), provider);
      const before = balance(treasury);
      expect(read("get-reputation-sync", [Cl.uint(1)]).value.value.pending).toBeBool(true);
      simnet.callPublicFn(rep, "add-protocol-caller", [Cl.contractPrincipal(owner, name)], owner);
      const result = call("retry-reputation-sync", [Cl.uint(1)], provider);
      expect(result.result).toBeOk(Cl.bool(true));
      expect(transfers(result)).toHaveLength(0);
      expect(balance(treasury)).toBe(before);
    });

    if (ft) {
      it.each(["fund", "provider", "review-timeout", "expire", "fee-refund"])("rejects ok-false token responses in %s without committing accounting", phase => {
        const rejected = phase === "fund" ? `${owner}.${name}` : phase === "expire" ? client : provider;
        if (phase === "fund") {
          create(); call("set-budget", [Cl.uint(1), Cl.uint(1000)], client);
        } else {
          prepare(1000, phase !== "expire", phase === "expire" ? 20 : 1000);
          if (phase === "provider" || phase === "fee-refund") record();
          if (phase === "fee-refund") {
            finish(); call("waive-service-fee", [Cl.uint(1), fault], authority);
          }
        }
        simnet.callPublicFn(tokenName, "set-rejected-recipient", [Cl.some(Cl.principal(rejected))], owner);
        simnet.callPublicFn(tokenName, "set-return-false", [Cl.bool(true)], owner);
        const before = balance(rejected);
        let result;
        if (phase === "fund") result = call("fund-job", [Cl.uint(1), token], client);
        else if (phase === "provider") result = finish();
        else if (phase === "fee-refund") result = call("refund-service-fee", [Cl.uint(1), token], treasury);
        else if (phase === "review-timeout") {
          simnet.mineEmptyBurnBlocks(14);
          result = call("settle-review-timeout", [Cl.uint(1), token], client);
        } else {
          simnet.mineEmptyBlocks(30);
          result = call("expire-job", [Cl.uint(1), token], provider);
        }
        expect(result.result).toBeErr(Cl.uint(948));
        expect(balance(rejected)).toBe(before);
        expect(escrow()).toBeOk(Cl.uint(phase === "fund" || phase === "fee-refund" ? 0 : 1000));
        if (phase === "fee-refund") expect(settlement()["refunded-fee"]).toBeUint(0);
        else expect(fee().settlement).toBeNone();
      });

      it.each([false, true])("rolls back both transfers/state if treasury transfer fails (ok-false=%s)", okFalse => {
        prepare(); record();
        simnet.callPublicFn(tokenName, "set-rejected-recipient", [Cl.some(Cl.principal(treasury))], owner);
        simnet.callPublicFn(tokenName, "set-return-false", [Cl.bool(okFalse)], owner);
        const before = balance(provider);
        const result = finish();
        expect(result.result).toBeErr(Cl.uint(okFalse ? 948 : 77));
        expect(balance(provider)).toBe(before);
        expect(escrow()).toBeOk(Cl.uint(1000));
        expect(fee().settlement).toBeNone();
        expect(job().status).toBeUint(7);
        simnet.callPublicFn(tokenName, "set-rejected-recipient", [Cl.none()], owner);
        expectSplit(finish(), provider);
      });

      it("pins the token for both payout legs and treasury refunds", () => {
        prepare(); record();
        const alt = Cl.contractPrincipal(owner, "mock-sbtc-token-alt");
        call("set-payment-token", [alt]);
        simnet.mineEmptyBurnBlocks(5);
        expect(call("finalize-decision", [Cl.uint(1), alt], provider).result).toBeErr(Cl.uint(911));
        expectSplit(finish(), provider);
        call("waive-service-fee", [Cl.uint(1), fault], authority);
        expect(call("refund-service-fee", [Cl.uint(1), alt], treasury).result).toBeErr(Cl.uint(911));
        expect(settlement()["refunded-fee"]).toBeUint(0);
        expect(call("refund-service-fee", [Cl.uint(1), token], treasury).result).toBeOk(Cl.bool(true));
      });
    }
  });
}
