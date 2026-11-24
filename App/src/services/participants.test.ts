import { describe, expect, it } from "vitest";

import type { Participant } from "../constants/participants";
import { buildParticipantDirectory, participantActivity } from "./participants";
import type { TransparencySnapshot } from "./transparency";

const WALLET = "SP000000000000000000002Q6VF78";
const participant: Participant = {
  handle: "example-dev",
  kind: "independent-developer",
  wallet: { address: WALLET, roles: ["agent-owner", "provider"] },
  agentIds: [7],
  attestation: { message: "not signed", signature: "00", publicKey: "00", signedAt: "2026-09-24T00:00:00.000Z" },
};
const snapshot = {
  dataStatus: { chain: "live", source: "test" },
  agents: [
    { id: null, contractSet: "nayori", href: `https://explorer.hiro.so/address/${WALLET}?chain=mainnet`, name: "Nayori agent", creator: WALLET, wallet: WALLET, active: true, classification: "external-attested" },
    { id: 7, contractSet: "earlier", href: "/agents/7", name: "Example", creator: WALLET, wallet: WALLET, active: true, classification: "external-attested" },
    { id: 8, contractSet: "earlier", href: "/agents/8", name: "Other", creator: "SPOTHER", wallet: "SPOTHER", active: true, classification: "unattested" },
  ],
  jobs: [
    { id: 2, contractSet: "nayori", href: "/jobs/next/2?asset=stx", currency: "stx", status: 7, statusLabel: "Completed", completed: true, budget: 2_000_000, client: WALLET, provider: "SPOTHER" },
    { id: 3, contractSet: "earlier", href: "/jobs/3?currency=sbtc", currency: "sbtc", status: 3, statusLabel: "Completed", completed: true, budget: 1000, client: "SPCLIENT", provider: WALLET },
    { id: 4, contractSet: "earlier", href: "/jobs/4?currency=stx", currency: "stx", status: 1, statusLabel: "Funded", completed: false, budget: 5, client: WALLET, provider: undefined },
    { id: 5, contractSet: "earlier", href: "/jobs/5?currency=sbtc", currency: "sbtc", status: 3, statusLabel: "Completed", completed: true, budget: 1000, client: "SPCLIENT", provider: "SPOTHER" },
  ],
} as unknown as TransparencySnapshot;

describe("participant directory", () => {
  it("joins a participant wallet with its live agents and jobs", () => {
    expect(participantActivity(participant, snapshot)).toEqual({
      agents: [
        { id: null, contractSet: "nayori", href: `https://explorer.hiro.so/address/${WALLET}?chain=mainnet`, name: "Nayori agent", active: true },
        { id: 7, contractSet: "earlier", href: "/agents/7", name: "Example", active: true },
      ],
      jobs: [
        { id: 2, contractSet: "nayori", href: "/jobs/next/2?asset=stx", currency: "stx", role: "client", status: 7, statusLabel: "Completed", budget: 2_000_000, completed: true },
        { id: 3, contractSet: "earlier", href: "/jobs/3?currency=sbtc", currency: "sbtc", role: "provider", status: 3, statusLabel: "Completed", budget: 1000, completed: true },
        { id: 4, contractSet: "earlier", href: "/jobs/4?currency=stx", currency: "stx", role: "client", status: 1, statusLabel: "Funded", budget: 5, completed: false },
      ],
      completedJobs: 2,
    });
    expect(participantActivity(participant, { ...snapshot, dataStatus: { chain: "unavailable", source: "test" } } as TransparencySnapshot)).toBeNull();
  });

  it("reports unverifiable attestations instead of hiding them", async () => {
    const directory = await buildParticipantDirectory(snapshot, [participant], "2026-09-24T00:00:00.000Z");
    expect(directory.totals).toEqual({ participants: 1, verifiedAttestations: 0, agentsRegistered: 2, completedJobs: 2 });
    expect(directory.participants[0]?.attestationVerification.valid).toBe(false);
    expect(directory.participants[0]?.explorer).toContain(WALLET);
    expect(() => JSON.stringify(directory)).not.toThrow();
  });
});
