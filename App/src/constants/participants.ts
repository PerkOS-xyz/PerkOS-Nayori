/**
 * Independent participants: developers and teams who operate their own wallets and agents on
 * Nayori without PerkOS holding their keys. Every entry carries a wallet-signed attestation that
 * anyone can verify (see `services/participant-attestation.ts`); the on-chain activity of the
 * listed wallets is then read live from the registry and escrow contracts. A wallet listed here
 * is classified `external-attested` in the public evidence, so the test suite verifies every
 * signature before an entry can ship.
 */
import { NETWORK_NAME } from "./network";

export const PARTICIPANT_ATTESTATION_VERSION = "nayori-participant-attestation-v1";

export type ParticipantKind = "independent-developer" | "ecosystem-team" | "community-member";
export type ParticipantRole = "agent-owner" | "client" | "provider";

export interface ParticipantAttestation {
  /** Exact string signed with `stx_signMessage` (SIP-018 string message). */
  message: string;
  /** 65-byte RSV signature, hex. */
  signature: string;
  /** Compressed secp256k1 public key of the signing wallet, hex. */
  publicKey: string;
  /** ISO date the participant signed. */
  signedAt: string;
}

export interface Participant {
  /** Public handle the participant chose (GitHub or X handle, or a name). */
  handle: string;
  kind: ParticipantKind;
  organization?: string;
  links?: { github?: string; x?: string; website?: string };
  /** The attested wallet and the roles it plays on Nayori. */
  wallet: { address: string; roles: ParticipantRole[] };
  /** Agent IDs registered by that wallet, for cross-checking against the registry. */
  agentIds: number[];
  attestation: ParticipantAttestation;
  /** Optional context, for example "AgentPay, Stacks x402 gateway". */
  notes?: string;
}

export function participantAttestationMessage(input: {
  handle: string;
  address: string;
  network: "mainnet" | "testnet";
  date: string;
}): string {
  return [
    PARTICIPANT_ATTESTATION_VERSION,
    `network: ${input.network}`,
    `wallet: ${input.address}`,
    `handle: ${input.handle}`,
    `date: ${input.date}`,
    "I operate this wallet and the Nayori agents it registers independently. I am not a member of the PerkOS team and PerkOS does not hold this wallet's keys.",
  ].join("\n");
}

/**
 * Mainnet participants, added one PR at a time with the attestation the participant sent.
 * Team-operated wallets never go here; they stay in `constants/evidence.ts` as `team`.
 */
export const mainnetParticipants: Participant[] = [];

export const testnetParticipants: Participant[] = [];

export const participants: readonly Participant[] =
  NETWORK_NAME === "mainnet" ? mainnetParticipants : testnetParticipants;
