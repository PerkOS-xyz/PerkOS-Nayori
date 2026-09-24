import { getAddressFromPublicKey, privateKeyToPublic, randomPrivateKey, signMessageHashRsv } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

import { classifyEvidenceWallet } from "../constants/evidence";
import { type Participant, participantAttestationMessage, participants } from "../constants/participants";
import { NETWORK_NAME } from "../constants/network";
import { parseAttestationMessage, stacksMessageHash, verifyParticipantAttestation } from "./participant-attestation";

const network = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";

async function signedParticipant(handle = "example-dev", overrides: Partial<Participant> = {}): Promise<Participant> {
  const privateKey = randomPrivateKey();
  const publicKey = privateKeyToPublic(privateKey) as unknown as string;
  const address = getAddressFromPublicKey(publicKey, network);
  const message = participantAttestationMessage({ handle, address, network, date: "2026-09-24" });
  const signature = signMessageHashRsv({ messageHash: await stacksMessageHash(message), privateKey });
  return {
    handle,
    kind: "independent-developer",
    wallet: { address, roles: ["agent-owner", "provider"] },
    agentIds: [],
    attestation: { message, signature, publicKey, signedAt: "2026-09-24T00:00:00.000Z" },
    ...overrides,
  };
}

describe("participant attestation", () => {
  it("hashes SIP-018 string messages exactly like @stacks/encryption hashMessage", async () => {
    // Reference vectors computed with @stacks/encryption 7.x (`hashMessage`), including a
    // message above the 253-byte varint boundary and a real attestation text.
    expect(await stacksMessageHash("Hello World")).toBe("953a54a2525205a2272ec27770ede65f6687a1e20725203f3198674c10b28f73");
    expect(await stacksMessageHash("x".repeat(300))).toBe("19d5da9da21159528f1f51765b91fd2c547c45301a58b889b4f9c888d5b704c0");
    const attestation = participantAttestationMessage({ handle: "example-dev", address: "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH", network: "mainnet", date: "2026-09-24" });
    expect(await stacksMessageHash(attestation)).toBe("8fc55d1144160fd053a4f597f298a495daec9c0ca290275fd3fee1347e53f2c0");
  });

  it("accepts a wallet-signed canonical attestation and recovers the wallet", async () => {
    const participant = await signedParticipant();
    const result = await verifyParticipantAttestation(participant, network);
    expect(result).toEqual({ valid: true, address: participant.wallet.address, reasons: [] });
    expect(parseAttestationMessage(participant.attestation.message)).toMatchObject({ handle: "example-dev", wallet: participant.wallet.address, network });
  });

  it("rejects altered text, foreign keys, other wallets and other networks", async () => {
    const participant = await signedParticipant();
    const other = await signedParticipant("someone-else");
    const altered = { ...participant, attestation: { ...participant.attestation, message: participant.attestation.message.replace("independently", "for PerkOS") } };
    expect((await verifyParticipantAttestation(altered, network)).valid).toBe(false);
    const swappedKey = { ...participant, attestation: { ...participant.attestation, publicKey: other.attestation.publicKey } };
    expect((await verifyParticipantAttestation(swappedKey, network)).reasons.join(" ")).toMatch(/not produced by the stated public key|does not belong/);
    const swappedWallet = { ...participant, wallet: { ...participant.wallet, address: other.wallet.address } };
    expect((await verifyParticipantAttestation(swappedWallet, network)).reasons.join(" ")).toMatch(/different wallet/);
    const renamed = { ...participant, handle: "impostor" };
    expect((await verifyParticipantAttestation(renamed, network)).reasons.join(" ")).toMatch(/different handle/);
    expect((await verifyParticipantAttestation(participant, network === "mainnet" ? "testnet" : "mainnet")).valid).toBe(false);
    expect((await verifyParticipantAttestation({ ...participant, attestation: { ...participant.attestation, signature: "00" } }, network)).reasons.join(" ")).toMatch(/65-byte/);
  });

  it("classifies attested participant wallets as external-attested", async () => {
    for (const participant of participants) {
      expect(classifyEvidenceWallet(participant.wallet.address)).toBe("external-attested");
    }
    const unknown = await signedParticipant("not-listed");
    expect(classifyEvidenceWallet(unknown.wallet.address)).toBe("unattested");
  });

  it("ships only participants whose attestation verifies on this network", async () => {
    for (const participant of participants) {
      const result = await verifyParticipantAttestation(participant, network);
      expect(result, `${participant.handle}: ${result.reasons.join("; ")}`).toMatchObject({ valid: true });
      expect(participant.agentIds.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
    }
  });
});
