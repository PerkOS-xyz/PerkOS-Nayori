/**
 * Public participant directory: each independent developer or team with the attestation they
 * signed, its verification result and the on-chain activity of their wallet, read live from the
 * registry and escrow contracts through the transparency snapshot. Everything here can be
 * re-derived by a third party: the signature from the message and public key, the address from
 * the public key, and the agents and jobs from the contracts.
 */
import { type Participant, participants } from "../constants/participants";
import { loadAttestedWallets } from "./participant-registry";
import { type ParticipantListQuery, type StoredParticipant, getParticipantStore } from "./participant-store";
import { NETWORK_NAME } from "../constants/network";
import { type AttestationVerification, verifyParticipantAttestation } from "./participant-attestation";
import { type TransparencySnapshot, loadTransparencySnapshot } from "./transparency";

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
  /** `pinned`: curated in the repository and verified on every request; `registry`: self-registered, verified when submitted. */
  source: "pinned" | "registry";
  verifiedAt?: string;
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
  /** Pagination over the self-registered entries; pinned entries are always on page 1. */
  page: number;
  pageSize: number;
  total: number;
  dataStatus: string;
  participants: ParticipantRecord[];
}

export interface DirectoryOptions {
  /** Self-registered entries for this page (already verified when stored). */
  stored?: StoredParticipant[];
  page?: number;
  pageSize?: number;
  /** Total self-registered entries matching the query. */
  storedTotal?: number;
  /** Every attested wallet (pinned + registry), for the activity totals over the whole snapshot. */
  attestedWallets?: Set<string>;
}

/** Activity totals over every attested wallet, one pass over the snapshot instead of one per participant. */
export function activityTotals(snapshot: TransparencySnapshot | null, wallets: Set<string>): { agentsRegistered: number; completedJobs: number } {
  if (!snapshot || snapshot.dataStatus.chain !== "live") return { agentsRegistered: 0, completedJobs: 0 };
  const has = (address?: string) => Boolean(address && wallets.has(address.toUpperCase()));
  return {
    agentsRegistered: snapshot.agents.filter((agent) => has(agent.wallet) || has(agent.creator)).length,
    completedJobs: snapshot.jobs.filter((job) => job.status === 3 && (has(job.client) || has(job.provider))).length,
  };
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
  options: DirectoryOptions = {},
): Promise<ParticipantDirectory> {
  const network = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  const stored = options.stored ?? [];
  const pinnedOnPage = page === 1 ? list : [];
  const pinned = await Promise.all(
    pinnedOnPage.map(async (participant): Promise<ParticipantRecord> => ({
      ...participant,
      source: "pinned",
      attestationVerification: await verifyParticipantAttestation(participant, network),
      activity: participantActivity(participant, snapshot),
      explorer: `https://explorer.hiro.so/address/${participant.wallet.address}?chain=${network}`,
    })),
  );
  const registered = stored.map((participant): ParticipantRecord => ({
    ...participant,
    source: "registry",
    attestationVerification: { valid: true, address: participant.wallet.address, reasons: [] },
    activity: participantActivity(participant, snapshot),
    explorer: `https://explorer.hiro.so/address/${participant.wallet.address}?chain=${network}`,
  }));
  const records = [...pinned, ...registered];
  const storedTotal = options.storedTotal ?? stored.length;
  const attested = options.attestedWallets ?? new Set([...list, ...stored].map((p) => p.wallet.address.toUpperCase()));
  const totals = activityTotals(snapshot, attested);
  return {
    schemaVersion: 1,
    network,
    generatedAt,
    attestationVersion: "nayori-participant-attestation-v1",
    policy: {
      classification:
        "A participant is a wallet whose owner signed the attestation with that wallet. PerkOS never holds participant keys and team-operated wallets are never listed here.",
      verification:
        "Recover the public key from the RSV signature over the SIP-018 hash of the message, derive the Stacks address, and compare both with the listed wallet. Self-registered entries are verified when submitted; pinned entries on every request. Anyone can re-run the check from the published fields.",
      counting:
        "Only listed wallets with a valid attestation count toward non-team adoption in the public evidence. Agents and completed jobs are read live from agent-registry and the escrow contracts.",
    },
    totals: {
      participants: list.length + storedTotal,
      verifiedAttestations: pinned.filter((record) => record.attestationVerification.valid).length + storedTotal,
      agentsRegistered: totals.agentsRegistered,
      completedJobs: totals.completedJobs,
    },
    page,
    pageSize,
    total: list.length + storedTotal,
    dataStatus: snapshot?.dataStatus.chain ?? "unavailable",
    participants: records,
  };
}

/** The directory as the API serves it: registry page + pinned entries + live chain activity. */
export async function loadParticipantDirectory(query: ParticipantListQuery): Promise<ParticipantDirectory> {
  const attestedWallets = await loadAttestedWallets();
  const store = await getParticipantStore().catch(() => null);
  const [snapshot, pageData] = await Promise.all([
    loadTransparencySnapshot({ attestedWallets }),
    store ? store.list(query).catch((error) => { console.error("Participant registry unavailable:", error); return { items: [], total: 0 }; }) : Promise.resolve({ items: [], total: 0 }),
  ]);
  const pinned = query.q ? participants.filter((p) => `${p.handle} ${p.wallet.address}`.toLowerCase().includes(query.q!.toLowerCase())) : participants;
  return buildParticipantDirectory(snapshot, pinned, new Date().toISOString(), {
    stored: pageData.items,
    storedTotal: pageData.total,
    page: query.page,
    pageSize: query.pageSize,
    attestedWallets,
  });
}
