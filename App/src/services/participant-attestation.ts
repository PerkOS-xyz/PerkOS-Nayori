/**
 * Verifies a participant's wallet-signed attestation.
 *
 * Wallets sign with `stx_signMessage` (SIP-018 string message): the hash is
 * sha256("\x17Stacks Signed Message:\n" + varint(len) + message). From the RSV signature we
 * recover the public key, compare it with the one the wallet returned and derive the Stacks
 * address, which must be the wallet named inside the message. The message itself must be the
 * canonical attestation text, so a signature over any other statement is rejected.
 */
import { getAddressFromPublicKey, publicKeyFromSignatureRsv } from "@stacks/transactions";

import {
  type Participant,
  PARTICIPANT_ATTESTATION_VERSION,
  participantAttestationMessage,
} from "../constants/participants";

const CHAIN_PREFIX = "\x17Stacks Signed Message:\n";

function varint(length: number): Uint8Array {
  if (length < 0xfd) return Uint8Array.from([length]);
  if (length <= 0xffff) return Uint8Array.from([0xfd, length & 0xff, (length >> 8) & 0xff]);
  return Uint8Array.from([0xfe, length & 0xff, (length >> 8) & 0xff, (length >> 16) & 0xff, (length >>> 24) & 0xff]);
}

/** SIP-018 string-message hash, hex. Matches `hashMessage` in @stacks/encryption. */
export async function stacksMessageHash(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(CHAIN_PREFIX);
  const body = encoder.encode(message);
  const bytes = new Uint8Array(prefix.length + 1 + body.length + (body.length >= 0xfd ? (body.length <= 0xffff ? 2 : 4) : 0));
  const length = varint(body.length);
  bytes.set(prefix, 0);
  bytes.set(length, prefix.length);
  bytes.set(body, prefix.length + length.length);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface AttestationVerification {
  valid: boolean;
  address?: string;
  reasons: string[];
}

export function parseAttestationMessage(message: string): { network: string; wallet: string; handle: string; date: string } | null {
  const lines = message.split("\n");
  if (lines[0] !== PARTICIPANT_ATTESTATION_VERSION || lines.length !== 6) return null;
  const field = (index: number, key: string) => {
    const prefix = `${key}: `;
    return lines[index]?.startsWith(prefix) ? lines[index]!.slice(prefix.length) : null;
  };
  const network = field(1, "network");
  const wallet = field(2, "wallet");
  const handle = field(3, "handle");
  const date = field(4, "date");
  if (!network || !wallet || !handle || !date) return null;
  return { network, wallet, handle, date };
}

export async function verifyParticipantAttestation(
  participant: Participant,
  network: "mainnet" | "testnet",
): Promise<AttestationVerification> {
  const reasons: string[] = [];
  const { attestation, wallet, handle } = participant;
  const fields = parseAttestationMessage(attestation.message);
  if (!fields) reasons.push("The message is not a canonical participant attestation.");
  if (fields && fields.network !== network) reasons.push(`The attestation names network ${fields.network}, expected ${network}.`);
  if (fields && fields.wallet !== wallet.address) reasons.push("The attestation names a different wallet.");
  if (fields && fields.handle !== handle) reasons.push("The attestation names a different handle.");
  if (fields && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) reasons.push("The attestation date is not YYYY-MM-DD.");
  if (fields && participantAttestationMessage({ handle, address: wallet.address, network, date: fields.date }) !== attestation.message) {
    reasons.push("The attestation text was altered.");
  }
  if (!/^[0-9a-f]{130}$/i.test(attestation.signature)) reasons.push("The signature is not a 65-byte RSV hex string.");
  if (!/^0[23][0-9a-f]{64}$/i.test(attestation.publicKey)) reasons.push("The public key is not a compressed secp256k1 key.");
  if (reasons.length > 0) return { valid: false, reasons };

  let address: string | undefined;
  try {
    const hash = await stacksMessageHash(attestation.message);
    const recovered = publicKeyFromSignatureRsv(hash, attestation.signature.toLowerCase());
    if (recovered.toLowerCase() !== attestation.publicKey.toLowerCase()) {
      reasons.push("The signature was not produced by the stated public key.");
    }
    address = getAddressFromPublicKey(attestation.publicKey.toLowerCase(), network);
    if (address !== wallet.address) reasons.push("The public key does not belong to the attested wallet.");
  } catch {
    reasons.push("The signature could not be verified.");
  }
  return { valid: reasons.length === 0, address, reasons };
}
