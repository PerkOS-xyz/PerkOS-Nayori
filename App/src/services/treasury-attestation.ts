import {
  Cl,
  compressPublicKey,
  encodeStructuredDataBytes,
  publicKeyToAddressSingleSig,
  publicKeyFromSignatureRsv,
} from "@stacks/transactions";

export const TREASURY_ADDRESS =
  "SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8";
export const DEPLOYER_ADDRESS =
  "SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH";
export const APPEAL_AUTHORITY_ADDRESS =
  "SP2R584GC8W2A921080TY8CQ8P1GZ6JNXYXS65DA6";

export const TREASURY_ATTESTATION_DOMAIN = Object.freeze({
  name: "Nayori Mainnet Treasury Custody",
  version: "1",
  chainId: 1,
});

export const SERVICE_FEE_RELEASE = Object.freeze({
  stxContract: "agentic-commerce-v6",
  sbtcContract: "sbtc-commerce-v5",
  stxSourceHash:
    "8eb55eccf0421b35ec6ff87be3bc8e99a356be5a4b882d8a3e9585019f40a7b2",
  sbtcSourceHash:
    "132567979dc49ba5726465ee12e5590cf26329acb9a31f0596f92008d0052f53",
});

export const REVIEWED_SHA_PATTERN = /^[0-9a-f]{40}$/;
export const CHALLENGE_PATTERN = /^[0-9a-f]{64}$/;

export interface TreasuryAttestationMessage {
  action: "prove-control-of-nayori-mainnet-treasury";
  treasury: typeof TREASURY_ADDRESS;
  deployer: typeof DEPLOYER_ADDRESS;
  appealAuthority: typeof APPEAL_AUTHORITY_ADDRESS;
  stxContract: typeof SERVICE_FEE_RELEASE.stxContract;
  sbtcContract: typeof SERVICE_FEE_RELEASE.sbtcContract;
  stxSourceHash: typeof SERVICE_FEE_RELEASE.stxSourceHash;
  sbtcSourceHash: typeof SERVICE_FEE_RELEASE.sbtcSourceHash;
  reviewedSha: string;
  challenge: string;
  issuedAt: string;
  expiresAt: string;
}

export interface TreasuryAttestationDraft {
  domain: typeof TREASURY_ATTESTATION_DOMAIN;
  message: TreasuryAttestationMessage;
}

export interface TreasuryAttestationReceipt extends TreasuryAttestationDraft {
  schemaVersion: 1;
  scheme: "SIP-018-RSV";
  publicKey: string;
  signature: string;
}

function stripHexPrefix(value: string) {
  return value.startsWith("0x") || value.startsWith("0X")
    ? value.slice(2)
    : value;
}

function normalizedHex(value: string, bytes: number, label: string) {
  const normalized = stripHexPrefix(value.trim()).toLowerCase();
  if (
    normalized.length !== bytes * 2 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hexadecimal data.`);
  }
  return normalized;
}

function normalizePublicKey(publicKey: string) {
  const raw = stripHexPrefix(publicKey.trim()).toLowerCase();
  if (!/^[0-9a-f]+$/.test(raw) || ![66, 130].includes(raw.length)) {
    throw new Error("Leather returned an invalid public key.");
  }
  const compressed = compressPublicKey(raw).toLowerCase();
  if (!/^(02|03)[0-9a-f]{64}$/.test(compressed)) {
    throw new Error("Leather did not return a compressed secp256k1 public key.");
  }
  return compressed;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isReviewedMergeSha(value: string) {
  return REVIEWED_SHA_PATTERN.test(value);
}

export function createRandomChallenge() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function createTreasuryAttestationDraft(
  reviewedSha: string,
  options: { now?: Date; challenge?: string } = {}
): TreasuryAttestationDraft {
  if (!isReviewedMergeSha(reviewedSha)) {
    throw new Error("Reviewed merge SHA must be exactly 40 lowercase hexadecimal characters.");
  }

  const issuedAt = new Date(options.now?.getTime() ?? Date.now());
  if (Number.isNaN(issuedAt.getTime())) {
    throw new Error("The attestation issue time is invalid.");
  }

  const challenge = options.challenge ?? createRandomChallenge();
  if (!CHALLENGE_PATTERN.test(challenge)) {
    throw new Error("Challenge must be exactly 32 random bytes encoded as lowercase hexadecimal.");
  }

  return {
    domain: TREASURY_ATTESTATION_DOMAIN,
    message: {
      action: "prove-control-of-nayori-mainnet-treasury",
      treasury: TREASURY_ADDRESS,
      deployer: DEPLOYER_ADDRESS,
      appealAuthority: APPEAL_AUTHORITY_ADDRESS,
      ...SERVICE_FEE_RELEASE,
      reviewedSha,
      challenge,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

export function treasuryAttestationClarityValues(draft: TreasuryAttestationDraft) {
  const { domain, message } = draft;
  return {
    domain: Cl.tuple({
      name: Cl.stringAscii(domain.name),
      version: Cl.stringAscii(domain.version),
      "chain-id": Cl.uint(domain.chainId),
    }),
    message: Cl.tuple({
      action: Cl.stringAscii(message.action),
      treasury: Cl.stringAscii(message.treasury),
      deployer: Cl.stringAscii(message.deployer),
      "appeal-authority": Cl.stringAscii(message.appealAuthority),
      "stx-contract": Cl.stringAscii(message.stxContract),
      "sbtc-contract": Cl.stringAscii(message.sbtcContract),
      "stx-source-hash": Cl.stringAscii(message.stxSourceHash),
      "sbtc-source-hash": Cl.stringAscii(message.sbtcSourceHash),
      "reviewed-sha": Cl.stringAscii(message.reviewedSha),
      challenge: Cl.stringAscii(message.challenge),
      "issued-at": Cl.stringAscii(message.issuedAt),
      "expires-at": Cl.stringAscii(message.expiresAt),
    }),
  };
}

async function structuredMessageHash(draft: TreasuryAttestationDraft) {
  const values = treasuryAttestationClarityValues(draft);
  const encoded = encodeStructuredDataBytes(values);
  const encodedCopy = Uint8Array.from(encoded);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encodedCopy);
  return bytesToHex(new Uint8Array(digest));
}

function vrsToRsv(signature: string) {
  return `${signature.slice(2)}${signature.slice(0, 2)}`;
}

function recoveredPublicKey(messageHash: string, signatureRsv: string) {
  try {
    return normalizePublicKey(
      publicKeyFromSignatureRsv(messageHash, signatureRsv)
    );
  } catch {
    return null;
  }
}

export async function createVerifiedTreasuryAttestationReceipt(
  draft: TreasuryAttestationDraft,
  walletResult: { publicKey: string; signature: string },
  expectedAddress = TREASURY_ADDRESS
): Promise<TreasuryAttestationReceipt> {
  const publicKey = normalizePublicKey(walletResult.publicKey);
  const signature = normalizedHex(walletResult.signature, 65, "Signature");
  const messageHash = await structuredMessageHash(draft);

  const candidates = [signature, vrsToRsv(signature)];
  const signatureRsv = candidates.find(
    (candidate, index) =>
      (index === 0 || candidate !== candidates[0]) &&
      recoveredPublicKey(messageHash, candidate) === publicKey
  );

  if (!signatureRsv) {
    throw new Error("The Leather signature does not match the displayed SIP-018 payload.");
  }

  const signerAddress = publicKeyToAddressSingleSig(publicKey, "mainnet");
  if (signerAddress !== expectedAddress) {
    throw new Error(
      `The signing account resolves to ${signerAddress}, not the Nayori treasury.`
    );
  }

  return {
    schemaVersion: 1,
    scheme: "SIP-018-RSV",
    domain: draft.domain,
    message: draft.message,
    publicKey,
    signature: signatureRsv,
  };
}

export function serializeTreasuryAttestationReceipt(
  receipt: TreasuryAttestationReceipt
) {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export function treasuryAttestationFilename(reviewedSha: string) {
  if (!isReviewedMergeSha(reviewedSha)) {
    throw new Error("Cannot name an attestation for an invalid reviewed merge SHA.");
  }
  return `nayori-mainnet-treasury-attestation-${reviewedSha}.json`;
}
