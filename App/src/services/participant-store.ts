/**
 * Where self-registered participants live. One row per wallet and network; the attestation is
 * verified once, when the participant submits it (see `participant-registry.ts`), and the row
 * records when. Reads are paginated and indexed so the directory and the evidence classification
 * cost the same with ten participants or ten thousand.
 *
 * Two adapters behind one interface: Postgres for QA and production (`DATABASE_URL`), memory for
 * tests and local development (`PARTICIPANT_STORE=memory`). Without either, the registry is off
 * and the API says so instead of pretending to store anything.
 */
import type { Participant } from "../constants/participants";
import { NETWORK_NAME } from "../constants/network";

export interface StoredParticipant extends Participant {
  /** When the signature was verified by this app, before the row was written. */
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantListQuery {
  page: number;
  pageSize: number;
  /** Case-insensitive match on handle or wallet. */
  q?: string;
}

export interface ParticipantPage {
  items: StoredParticipant[];
  total: number;
}

export interface ParticipantStore {
  readonly kind: "memory" | "postgres";
  get(wallet: string): Promise<StoredParticipant | null>;
  list(query: ParticipantListQuery): Promise<ParticipantPage>;
  upsert(participant: Participant, verifiedAt: string, now?: string): Promise<{ created: boolean; participant: StoredParticipant }>;
  /** Every listed wallet, upper-cased, for the evidence classification. */
  wallets(): Promise<Set<string>>;
  close(): Promise<void>;
}

export const NETWORK: "mainnet" | "testnet" = NETWORK_NAME === "mainnet" ? "mainnet" : "testnet";
const key = (wallet: string) => wallet.toUpperCase();

export class MemoryParticipantStore implements ParticipantStore {
  readonly kind = "memory" as const;
  private readonly rows = new Map<string, StoredParticipant>();

  async get(wallet: string) {
    return this.rows.get(key(wallet)) ?? null;
  }

  async list({ page, pageSize, q }: ParticipantListQuery) {
    const needle = q?.trim().toLowerCase();
    const all = [...this.rows.values()]
      .filter((row) => !needle || row.handle.toLowerCase().includes(needle) || row.wallet.address.toLowerCase().includes(needle))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: all.length };
  }

  async upsert(participant: Participant, verifiedAt: string, now = new Date().toISOString()) {
    const existing = this.rows.get(key(participant.wallet.address));
    const stored: StoredParticipant = { ...participant, verifiedAt, createdAt: existing?.createdAt ?? now, updatedAt: now };
    this.rows.set(key(participant.wallet.address), stored);
    return { created: !existing, participant: stored };
  }

  async wallets() {
    return new Set(this.rows.keys());
  }

  async close() {
    this.rows.clear();
  }
}

interface Row {
  wallet: string;
  handle: string;
  kind: Participant["kind"];
  roles: Participant["wallet"]["roles"];
  links: Participant["links"] | null;
  organization: string | null;
  notes: string | null;
  agent_ids: number[];
  attestation: Participant["attestation"];
  verified_at: Date;
  created_at: Date;
  updated_at: Date;
}

const fromRow = (row: Row): StoredParticipant => ({
  handle: row.handle,
  kind: row.kind,
  ...(row.organization ? { organization: row.organization } : {}),
  ...(row.links && Object.keys(row.links).length > 0 ? { links: row.links } : {}),
  wallet: { address: row.wallet, roles: row.roles },
  agentIds: row.agent_ids ?? [],
  attestation: row.attestation,
  ...(row.notes ? { notes: row.notes } : {}),
  verifiedAt: row.verified_at.toISOString(),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const SCHEMA = `
create table if not exists participants (
  network      text not null,
  wallet       text not null,
  handle       text not null,
  kind         text not null,
  roles        text[] not null,
  links        jsonb not null default '{}'::jsonb,
  organization text,
  notes        text,
  agent_ids    integer[] not null default '{}',
  attestation  jsonb not null,
  signed_date  date not null,
  verified_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (network, wallet)
);
create index if not exists participants_handle_idx on participants (network, lower(handle));
create index if not exists participants_created_idx on participants (network, created_at desc);
`;

type PgPool = import("pg").Pool;

export class PostgresParticipantStore implements ParticipantStore {
  readonly kind = "postgres" as const;
  private readonly ready: Promise<void>;
  private walletCache: { at: number; set: Set<string> } | null = null;

  constructor(private readonly pool: PgPool, private readonly network = NETWORK) {
    this.ready = pool.query(SCHEMA).then(() => undefined);
  }

  static async connect(connectionString: string, network = NETWORK): Promise<PostgresParticipantStore> {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    const store = new PostgresParticipantStore(pool, network);
    await store.ready;
    return store;
  }

  async get(wallet: string) {
    await this.ready;
    const { rows } = await this.pool.query<Row>(
      "select * from participants where network = $1 and wallet = $2",
      [this.network, key(wallet)],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async list({ page, pageSize, q }: ParticipantListQuery) {
    await this.ready;
    const needle = q?.trim() ? `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const where = needle ? "network = $1 and (handle ilike $2 or wallet ilike $2)" : "network = $1";
    const params: unknown[] = needle ? [this.network, needle] : [this.network];
    const [count, rows] = await Promise.all([
      this.pool.query<{ n: string }>(`select count(*)::text as n from participants where ${where}`, params),
      this.pool.query<Row>(
        `select * from participants where ${where} order by created_at desc, wallet limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return { items: rows.rows.map(fromRow), total: Number(count.rows[0]?.n ?? 0) };
  }

  async upsert(participant: Participant, verifiedAt: string, now = new Date().toISOString()) {
    await this.ready;
    const signedDate = participant.attestation.message.split("\n").find((line) => line.startsWith("date: "))?.slice(6) ?? now.slice(0, 10);
    const { rows } = await this.pool.query<Row & { created: boolean }>(
      `insert into participants (network, wallet, handle, kind, roles, links, organization, notes, agent_ids, attestation, signed_date, verified_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11, $12, $13, $13)
       on conflict (network, wallet) do update set
         handle = excluded.handle, kind = excluded.kind, roles = excluded.roles, links = excluded.links,
         organization = excluded.organization, notes = excluded.notes, agent_ids = excluded.agent_ids,
         attestation = excluded.attestation, signed_date = excluded.signed_date, verified_at = excluded.verified_at,
         updated_at = excluded.updated_at
       returning *, (xmax = 0) as created`,
      [
        this.network,
        key(participant.wallet.address),
        participant.handle,
        participant.kind,
        participant.wallet.roles,
        JSON.stringify(participant.links ?? {}),
        participant.organization ?? null,
        participant.notes ?? null,
        participant.agentIds,
        JSON.stringify(participant.attestation),
        signedDate,
        verifiedAt,
        now,
      ],
    );
    this.walletCache = null;
    return { created: rows[0]!.created, participant: fromRow(rows[0]!) };
  }

  async wallets() {
    await this.ready;
    if (this.walletCache && Date.now() - this.walletCache.at < 60_000) return this.walletCache.set;
    const { rows } = await this.pool.query<{ wallet: string }>("select wallet from participants where network = $1", [this.network]);
    const set = new Set(rows.map((row) => row.wallet));
    this.walletCache = { at: Date.now(), set };
    return set;
  }

  async close() {
    await this.pool.end();
  }
}

type Global = typeof globalThis & { __nayoriParticipantStore?: Promise<ParticipantStore | null> };

/**
 * The configured store, or null when the deployment has none. Cached per process (and across
 * dev reloads) so the pool is created once.
 */
export function getParticipantStore(): Promise<ParticipantStore | null> {
  const g = globalThis as Global;
  if (!g.__nayoriParticipantStore) {
    g.__nayoriParticipantStore = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      if (url) return PostgresParticipantStore.connect(url);
      if (process.env.PARTICIPANT_STORE?.trim() === "memory") return new MemoryParticipantStore();
      return null;
    })().catch((error) => {
      console.error("Participant store unavailable:", error);
      delete g.__nayoriParticipantStore;
      return null;
    });
  }
  return g.__nayoriParticipantStore;
}
