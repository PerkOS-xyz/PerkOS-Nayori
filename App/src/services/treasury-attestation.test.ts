import {
  getAddressFromPrivateKey,
  privateKeyToPublic,
  publicKeyToHex,
  signStructuredData,
} from "@stacks/transactions";
import { describe, expect, it } from "vitest";

import {
  createTreasuryAttestationDraft,
  createVerifiedTreasuryAttestationReceipt,
  isReviewedMergeSha,
  serializeTreasuryAttestationReceipt,
  treasuryAttestationClarityValues,
  treasuryAttestationFilename,
} from "./treasury-attestation";

const REVIEWED_SHA = "f1534543e1efe9d0c56d8be4b94c7afb353a2890";
const CHALLENGE = "ab".repeat(32);
const PRIVATE_KEY = "11".repeat(32) + "01";

function fixture() {
  const draft = createTreasuryAttestationDraft(REVIEWED_SHA, {
    challenge: CHALLENGE,
    now: new Date("2026-09-13T12:00:00.000Z"),
  });
  const values = treasuryAttestationClarityValues(draft);
  const signature = signStructuredData({ ...values, privateKey: PRIVATE_KEY });
  const publicKey = publicKeyToHex(privateKeyToPublic(PRIVATE_KEY));
  const address = getAddressFromPrivateKey(PRIVATE_KEY, "mainnet");
  return { address, draft, publicKey, signature };
}

describe("treasury custody attestation", () => {
  it("builds an exact, expiring mainnet authorization payload", () => {
    const { draft } = fixture();

    expect(draft.domain).toEqual({
      name: "Nayori Mainnet Treasury Custody",
      version: "1",
      chainId: 1,
    });
    expect(draft.message).toMatchObject({
      action: "prove-control-of-nayori-mainnet-treasury",
      treasury: "SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8",
      deployer: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH",
      appealAuthority: "SP28DBK3Q89F4KRYGPF51QT0RYEZBPXS4BAQ0ETBH",
      stxContract: "agentic-commerce-v6",
      sbtcContract: "sbtc-commerce-v5",
      reviewedSha: REVIEWED_SHA,
      challenge: CHALLENGE,
      issuedAt: "2026-09-13T12:00:00.000Z",
      expiresAt: "2026-09-14T12:00:00.000Z",
    });
  });

  it("accepts an RSV wallet signature and emits only the strict receipt keys", async () => {
    const { address, draft, publicKey, signature } = fixture();
    const receipt = await createVerifiedTreasuryAttestationReceipt(
      draft,
      { publicKey: `0x${publicKey.toUpperCase()}`, signature: `0x${signature}` },
      address
    );

    expect(receipt.signature).toBe(signature);
    expect(Object.keys(receipt)).toEqual([
      "schemaVersion",
      "scheme",
      "domain",
      "message",
      "publicKey",
      "signature",
    ]);
    expect(serializeTreasuryAttestationReceipt(receipt).endsWith("\n")).toBe(true);
  });

  it("normalizes a legacy VRS wallet signature to canonical RSV", async () => {
    const { address, draft, publicKey, signature } = fixture();
    const vrs = `${signature.slice(-2)}${signature.slice(0, -2)}`;
    const receipt = await createVerifiedTreasuryAttestationReceipt(
      draft,
      { publicKey, signature: vrs },
      address
    );

    expect(receipt.signature).toBe(signature);
    expect(receipt.scheme).toBe("SIP-018-RSV");
  });

  it("rejects a signer that is not the expected treasury", async () => {
    const { draft, publicKey, signature } = fixture();
    await expect(
      createVerifiedTreasuryAttestationReceipt(
        draft,
        { publicKey, signature },
        "SP000000000000000000002Q6VF78"
      )
    ).rejects.toThrow("not the Nayori treasury");
  });

  it("rejects malformed merge SHAs and creates a deterministic filename", () => {
    expect(isReviewedMergeSha(REVIEWED_SHA)).toBe(true);
    expect(isReviewedMergeSha(REVIEWED_SHA.toUpperCase())).toBe(false);
    expect(isReviewedMergeSha(REVIEWED_SHA.slice(1))).toBe(false);
    expect(treasuryAttestationFilename(REVIEWED_SHA)).toBe(
      `nayori-mainnet-treasury-attestation-${REVIEWED_SHA}.json`
    );
  });
});
