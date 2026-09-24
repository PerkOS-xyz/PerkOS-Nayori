/**
 * Public participant directory: each independent developer or team with the attestation they
 * signed, its verification result and the on-chain activity of their wallet, read live from the
 * registry and escrow contracts through the transparency snapshot. Everything here can be
 * re-derived by a third party: the signature from the message and public key, the address from
 * the public key, and the agents and jobs from the contracts.
 */
import { type Participant, participants } from "../constants/participants";
import { NETWORK_NAME } from "../constants/network";
import { type AttestationVerification, verifyParticipantAttestation } from "./participant-attestation";
import type { TransparencySnapshot } from "./transparency";

export interface ParticipantActivity {
  agents: { id: number; name: string; active: boolean }[];
  jobs: {
    id: number;
    currency: "sbtc" | "stx";
    role: "client" | "provider";
    status: number;
    statusLabel: string;
    budget: number;
    completed: boolean;
  }[];
  completedJobs: number;
}

export interface ParticipantRecord extends Participant {
  attestationVerification: AttestationVerification;
  activity: ParticipantActivity | null;
  explorer: string;
}

export interface ParticipantDirectory {
  schemaVersion: 1;
  network: string;
  generatedAt: string;
  attestationVersion: string;
  policy: {
    classification: string;
    verification: string;
    counting: string;
  };
  totals: {
    participants: number;
    verifiedAttestations: number;
    agentsRegistered: number;
    completedJobs: number;
  };
  participants: ParticipantRecord[];
}

const sameAddress = (a?: string, b?: string) => Boolean(a && b && a.toUpperCase() === b.toUpperCase());

export function participantActivity(participant: Participant, snapshot: TransparencySnapshot | null): ParticipantActivity | null {
  if (!snapshot || snapshot.dataStatus.chain !== "live") return null;
  const address = participant.wallet.address;
  const agents = snapshot.agents
    .filter((agent) => sameAddress(agent.wallet, address) || sameAddress(agent.creator, address))
    .map((agent) => ({ id: agent.id, name: agent.name, active: agent.active }));
  const jobs = snapshot.jobs
    .filter((job) => sameAddress(job.client, address) || sameAddress(job.provider, address))
    .map((job) => ({
      id: job.id,
      currency: job.currency,
      role: sameAddress(job.client, address) ? ("client" as const) : ("provider" as const),
      status: job.status,
      statusLabel: job.statusLabel,
      budget: job.budget,
      completed: job.status === 3,
    }));
  return { agents, jobs, completedJobs: jobs.filter((job) => job.completed).length };
}

export async function buildParticipantDirectory(
  snapshot: TransparencySnapshot | null,
  list: readonly Participant[] = participants,
  generatedAt = new Date().toISOString(),
): Promise<ParticipantDirectory> {
  const network = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";
  const records = await Promise.all(
    list.map(async (participant) => ({
      ...participant,
      attestationVerification: await verifyParticipantAttestation(participant, network),
      activity: participantActivity(participant, snapshot),
      explorer: `https://explorer.hiro.so/address/${participant.wallet.address}?chain=${network}`,
    })),
  );
  return {
    schemaVersion: 1,
    network,
    generatedAt,
    attestationVersion: "nayori-participant-attestation-v1",
    policy: {
      classification:
        "A participant is a wallet whose owner signed the attestation with that wallet. PerkOS never holds participant keys and team-operated wallets are never listed here.",
      verification:
        "Recover the public key from the RSV signature over the SIP-018 hash of the message, derive the Stacks address, and compare both with the listed wallet. Then read the wallet's agents and jobs from the contracts.",
      counting:
        "Only listed wallets with a valid attestation count toward non-team adoption in the public evidence. Agents and completed jobs are read live from agent-registry and the escrow contracts.",
    },
    totals: {
      participants: records.length,
      verifiedAttestations: records.filter((record) => record.attestationVerification.valid).length,
      agentsRegistered: records.reduce((sum, record) => sum + (record.activity?.agents.length ?? 0), 0),
      completedJobs: records.reduce((sum, record) => sum + (record.activity?.completedJobs ?? 0), 0),
    },
    participants: records,
  };
}
