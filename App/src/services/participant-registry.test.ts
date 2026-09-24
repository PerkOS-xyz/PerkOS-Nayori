import { getAddressFromPublicKey, privateKeyToPublic, randomPrivateKey, signMessageHashRsv } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

import { type Participant, participantAttestationMessage } from "../constants/participants";
import { NETWORK_NAME } from "../constants/network";
import { stacksMessageHash } from "./participant-attestation";
import { ParticipantRegistryError, allowRegistration, parseParticipantSubmission, registerParticipant } from "./participant-registry";
import { MemoryParticipantStore } from "./participant-store";
import { activityTotals, buildParticipantDirectory } from "./participants";
import { classifyWithRegistry } from "./transparency";

const network = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";
const TODAY = "2026-09-25";
const NOW = new Date(`${TODAY}T12:00:00Z`);

async function signed(privateKey: string, date: string, overrides: Partial<Participant> = {}): Promise<Participant> {
  const publicKey = privateKeyToPublic(privateKey) as unknown as string;
  const address = getAddressFromPublicKey(publicKey, network);
  const handle = overrides.handle ?? "example-dev";
  const message = participantAttestationMessage({ handle, address, network, date });
  const signature = signMessageHashRsv({ messageHash: await stacksMessageHash(message), privateKey });
  return {
    handle,
    kind: "independent-developer",
    wallet: { address, roles: ["agent-owner", "provider"] },
    agentIds: [],
    attestation: { message, signature, publicKey, signedAt: `${date}T00:00:00.000Z` },
    ...overrides,
  };
}

describe("participant submissions", () => {
  it("accepts a well-formed entry and normalizes it", async () => {
    const entry = await signed(randomPrivateKey(), TODAY, { links: { github: "https://github.com/example", x: "https://x.com/example" }, organization: " Example Labs ", notes: "Research agents" });
    const parsed = parseParticipantSubmission({ ...entry, agentIds: [3, 3, 1] });
    expect(parsed.agentIds).toEqual([1, 3]);
    expect(parsed.organization).toBe("Example Labs");
    expect(parsed.links).toEqual({ github: "https://github.com/example", x: "https://x.com/example" });
    expect(parsed.attestation.signature).toBe(entry.attestation.signature.toLowerCase());
  });

  it("rejects bad handles, roles, links and oversized text", async () => {
    const entry = await signed(randomPrivateKey(), TODAY);
    const reject = (patch: Record<string, unknown>, pattern: RegExp) =>
      expect(() => parseParticipantSubmission({ ...entry, ...patch })).toThrow(pattern);
    reject({ handle: "a" }, /handle/);
    reject({ kind: "team" }, /kind/);
    reject({ wallet: { address: entry.wallet.address, roles: [] } }, /roles/);
    reject({ wallet: { address: entry.wallet.address, roles: ["ceo"] } }, /roles/);
    reject({ wallet: { address: "not-an-address", roles: ["client"] } }, /wallet.address/);
    reject({ links: { github: "http://github.com/x" } }, /https/);
    reject({ links: { github: "https://gitlab.com/x" } }, /github.com/);
    reject({ links: { linkedin: "https://linkedin.com/in/x" } }, /links/);
    reject({ notes: "n".repeat(201) }, /notes/);
    reject({ agentIds: [0] }, /agentIds/);
    reject({ attestation: { ...entry.attestation, signature: "zz" } }, /attestation/);
  });
});

describe("participant registry", () => {
  it("verifies the signature once, stores the entry and lets the same wallet edit with a newer date", async () => {
    const store = new MemoryParticipantStore();
    const key = randomPrivateKey();
    const first = await registerParticipant(store, await signed(key, "2026-09-20"), network, NOW);
    expect(first.created).toBe(true);
    expect(first.participant.verifiedAt).toBe(NOW.toISOString());
    expect(await store.wallets()).toEqual(new Set([first.participant.wallet.address.toUpperCase()]));

    const edited = await registerParticipant(store, await signed(key, TODAY, { handle: "example-dev", notes: "Now with notes", wallet: { address: first.participant.wallet.address, roles: ["client"] } }), network, NOW);
    expect(edited.created).toBe(false);
    expect((await store.get(first.participant.wallet.address))?.notes).toBe("Now with notes");
    expect((await store.get(first.participant.wallet.address))?.wallet.roles).toEqual(["client"]);

    await expect(registerParticipant(store, await signed(key, "2026-09-19"), network, NOW)).rejects.toMatchObject({ status: 409 });
    expect((await store.list({ page: 1, pageSize: 10 })).total).toBe(1);
  });

  it("rejects foreign signatures, other networks and stale or future dates", async () => {
    const store = new MemoryParticipantStore();
    const key = randomPrivateKey();
    const entry = await signed(key, TODAY);
    const impostor = { ...entry, wallet: { ...entry.wallet, address: (await signed(randomPrivateKey(), TODAY)).wallet.address } };
    await expect(registerParticipant(store, impostor, network, NOW)).rejects.toBeInstanceOf(ParticipantRegistryError);
    await expect(registerParticipant(store, entry, network === "mainnet" ? "testnet" : "mainnet", NOW)).rejects.toMatchObject({ status: 401 });
    await expect(registerParticipant(store, await signed(key, "2026-08-01"), network, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(registerParticipant(store, await signed(key, "2026-10-15"), network, NOW)).rejects.toMatchObject({ status: 400 });
    expect((await store.list({ page: 1, pageSize: 10 })).total).toBe(0);
  });

  it("paginates and searches the store, newest first", async () => {
    const store = new MemoryParticipantStore();
    for (let i = 0; i < 7; i++) {
      await registerParticipant(store, await signed(randomPrivateKey(), TODAY, { handle: `dev-${i}` }), network, new Date(NOW.getTime() + i * 1000));
    }
    const page1 = await store.list({ page: 1, pageSize: 3 });
    expect(page1.total).toBe(7);
    expect(page1.items.map((p) => p.handle)).toEqual(["dev-6", "dev-5", "dev-4"]);
    const page3 = await store.list({ page: 3, pageSize: 3 });
    expect(page3.items.map((p) => p.handle)).toEqual(["dev-0"]);
    expect((await store.list({ page: 1, pageSize: 10, q: "DEV-3" })).items.map((p) => p.handle)).toEqual(["dev-3"]);
  });

  it("classifies registered wallets as external-attested and counts their activity in one pass", async () => {
    const store = new MemoryParticipantStore();
    const { participant } = await registerParticipant(store, await signed(randomPrivateKey(), TODAY), network, NOW);
    const wallets = await store.wallets();
    const classify = classifyWithRegistry(wallets);
    expect(classify(participant.wallet.address)).toBe("external-attested");
    expect(classify(participant.wallet.address.toLowerCase())).toBe("external-attested");
    expect(classify("SP000000000000000000002Q6VF78")).toBe("unattested");

    const snapshot = {
      dataStatus: { chain: "live" },
      agents: [{ id: 1, wallet: participant.wallet.address, creator: participant.wallet.address, name: "A", active: true }],
      jobs: [
        { id: 1, currency: "sbtc", client: "SP000000000000000000002Q6VF78", provider: participant.wallet.address, status: 3, statusLabel: "completed", budget: 1000 },
        { id: 2, currency: "sbtc", client: "SP000000000000000000002Q6VF78", provider: participant.wallet.address, status: 2, statusLabel: "submitted", budget: 1000 },
      ],
    } as never;
    expect(activityTotals(snapshot, wallets)).toEqual({ agentsRegistered: 1, completedJobs: 1 });
    const directory = await buildParticipantDirectory(snapshot, [], NOW.toISOString(), { stored: (await store.list({ page: 1, pageSize: 50 })).items, storedTotal: 1, attestedWallets: wallets });
    expect(directory.totals).toEqual({ participants: 1, verifiedAttestations: 1, agentsRegistered: 1, completedJobs: 1 });
    expect(directory.participants[0]).toMatchObject({ source: "registry", attestationVerification: { valid: true }, activity: { completedJobs: 1 } });
  });

  it("limits registrations per address and window", () => {
    const t = 1_000_000;
    for (let i = 0; i < 10; i++) expect(allowRegistration("10.0.0.1", t)).toBe(true);
    expect(allowRegistration("10.0.0.1", t)).toBe(false);
    expect(allowRegistration("10.0.0.2", t)).toBe(true);
    expect(allowRegistration("10.0.0.1", t + 61_000)).toBe(true);
  });
});
