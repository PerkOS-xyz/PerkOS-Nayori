import { request } from "@stacks/connect";
import { Cl, cvToValue, fetchCallReadOnlyFunction } from "@stacks/transactions";
import { NETWORK, NETWORK_NAME } from "../constants/network";
import {
  CONTRACT_ADDRESS,
  JOB_APPLICATIONS_CONTRACT,
  SBTC_COMMERCE_CONTRACT_NAME,
  STX_COMMERCE_CONTRACT_NAME,
} from "../constants/contract";
import { getAgent, getAgentCount, type Agent } from "./agent-registry";

export type ApplicationCurrency = "stx" | "sbtc";

export interface JobApplication {
  applicant: string;
  agentId: number;
  note: string;
  appliedAtBurn: number;
  active: boolean;
  agentName?: string;
}

// Asset identifiers fixed by job-applications-v1.
export const APPLICATION_ASSET: Record<ApplicationCurrency, number> = { stx: 1, sbtc: 2 };
export const MAX_NOTE_LENGTH = 140;
const MAX_AGENT_SCAN = 200;

const [appAddress, appName] = JOB_APPLICATIONS_CONTRACT.split(".");
const escrowName = (currency: ApplicationCurrency) =>
  currency === "sbtc" ? SBTC_COMMERCE_CONTRACT_NAME : STX_COMMERCE_CONTRACT_NAME;

async function read(functionName: string, functionArgs: any[]) {
  return fetchCallReadOnlyFunction({
    contractAddress: appAddress,
    contractName: appName,
    functionName,
    functionArgs,
    network: NETWORK,
    senderAddress: appAddress,
  });
}

// Clarity ASCII only; the contract stores at most 140 characters.
export function normalizeNote(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "").trim().slice(0, MAX_NOTE_LENGTH);
}

export function parseApplication(applicant: string, tuple: any): JobApplication {
  return {
    applicant,
    agentId: Number(tuple["agent-id"].value),
    note: tuple.note.value ?? "",
    appliedAtBurn: Number(tuple["applied-at-burn"].value),
    active: Boolean(tuple.active.value),
  };
}

export async function getApplicationCount(currency: ApplicationCurrency, jobId: number): Promise<number> {
  const cv = await read("get-application-count", [Cl.uint(APPLICATION_ASSET[currency]), Cl.uint(jobId)]);
  return Number(cvToValue(cv));
}

export async function getApplications(currency: ApplicationCurrency, jobId: number): Promise<JobApplication[]> {
  const count = await getApplicationCount(currency, jobId);
  const entries = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const cv = await read("get-applicant-at", [
        Cl.uint(APPLICATION_ASSET[currency]), Cl.uint(jobId), Cl.uint(index),
      ]);
      const value: any = cvToValue(cv);
      const entry = value?.value;
      const stored = entry?.application?.value?.value;
      if (!entry?.applicant?.value || !stored) return null;
      const application = parseApplication(entry.applicant.value, stored);
      const agent = await getAgent(application.agentId);
      return { ...application, agentName: agent?.name };
    })
  );
  return entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.active));
}

const agentCache = new Map<string, { at: number; agents: Agent[] }>();

// The registry has no wallet index, so scan the newest agents for the connected wallet.
export async function findAgentsByWallet(wallet: string): Promise<Agent[]> {
  const cached = agentCache.get(wallet);
  if (cached && Date.now() - cached.at < 60_000) return cached.agents;
  const count = await getAgentCount();
  const ids = Array.from({ length: Math.min(count, MAX_AGENT_SCAN) }, (_, i) => count - i);
  const agents = (await Promise.all(ids.map((id) => getAgent(id))))
    .filter((agent): agent is Agent => Boolean(agent && agent.active && agent.wallet === wallet));
  agentCache.set(wallet, { at: Date.now(), agents });
  return agents;
}

export function applyToJob(currency: ApplicationCurrency, jobId: number, agentId: number, note: string) {
  return request("stx_callContract", {
    contract: JOB_APPLICATIONS_CONTRACT as `${string}.${string}`,
    functionName: "apply-to-job",
    functionArgs: [
      Cl.contractPrincipal(CONTRACT_ADDRESS, escrowName(currency)),
      Cl.contractPrincipal(CONTRACT_ADDRESS, "agent-registry"),
      Cl.uint(jobId),
      Cl.uint(agentId),
      Cl.stringAscii(normalizeNote(note)),
    ],
    network: NETWORK_NAME,
  });
}

export function withdrawApplication(currency: ApplicationCurrency, jobId: number) {
  return request("stx_callContract", {
    contract: JOB_APPLICATIONS_CONTRACT as `${string}.${string}`,
    functionName: "withdraw-application",
    functionArgs: [Cl.uint(APPLICATION_ASSET[currency]), Cl.uint(jobId)],
    network: NETWORK_NAME,
  });
}
