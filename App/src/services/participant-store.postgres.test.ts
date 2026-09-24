/**
 * Integration test for the Postgres adapter. Runs only when TEST_DATABASE_URL points at a
 * disposable database (CI service container or a local `docker run postgres`); skipped otherwise.
 */
import { getAddressFromPublicKey, privateKeyToPublic, randomPrivateKey, signMessageHashRsv } from "@stacks/transactions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Participant, participantAttestationMessage } from "../constants/participants";
import { stacksMessageHash } from "./participant-attestation";
import { PostgresParticipantStore } from "./participant-store";

const url = process.env.TEST_DATABASE_URL;
const network = "testnet" as const;

async function signed(handle: string, date = "2026-09-25"): Promise<Participant> {
  const privateKey = randomPrivateKey();
  const publicKey = privateKeyToPublic(privateKey) as unknown as string;
  const address = getAddressFromPublicKey(publicKey, network);
  const message = participantAttestationMessage({ handle, address, network, date });
  const signature = signMessageHashRsv({ messageHash: await stacksMessageHash(message), privateKey });
  return { handle, kind: "independent-developer", links: { github: `https://github.com/${handle}` }, wallet: { address, roles: ["provider"] }, agentIds: [2], attestation: { message, signature, publicKey, signedAt: `${date}T00:00:00.000Z` }, notes: "pg" };
}

describe.skipIf(!url)("postgres participant store", () => {
  let store: PostgresParticipantStore;
  beforeAll(async () => {
    store = await PostgresParticipantStore.connect(url!, network);
  });
  afterAll(async () => {
    await store.close();
  });

  it("creates the schema, upserts, edits, lists, searches and reports wallets", async () => {
    const a = await signed(`pg-a-${Date.now()}`);
    const b = await signed(`pg-b-${Date.now()}`);
    const first = await store.upsert(a, new Date().toISOString());
    expect(first.created).toBe(true);
    expect(first.participant).toMatchObject({ handle: a.handle, links: a.links, agentIds: [2], notes: "pg", wallet: { roles: ["provider"] } });
    expect(first.participant.verifiedAt).toMatch(/^\d{4}-/);
    const again = await store.upsert({ ...a, notes: "edited" }, new Date().toISOString());
    expect(again.created).toBe(false);
    expect(again.participant.notes).toBe("edited");
    expect(again.participant.createdAt).toBe(first.participant.createdAt);
    await store.upsert(b, new Date().toISOString());
    expect((await store.get(a.wallet.address.toLowerCase()))?.handle).toBe(a.handle);
    const page = await store.list({ page: 1, pageSize: 1, q: b.handle.slice(0, 12) });
    expect(page.total).toBe(1);
    expect(page.items[0]?.handle).toBe(b.handle);
    expect((await store.list({ page: 1, pageSize: 1, q: "%" })).total).toBe(0);
    const wallets = await store.wallets();
    expect(wallets.has(a.wallet.address.toUpperCase())).toBe(true);
    expect(wallets.has(b.wallet.address.toUpperCase())).toBe(true);
  });
});
