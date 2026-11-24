import type { NextAsset } from "../../constants/nayori-deployment";
import { NEXT_STATUS, type NextAgent, type NextJob } from "./parse";
import { getNextAgent, getNextEscrowBalance, getNextJob, getNextJobCount } from "./reads";

// Read-only overview of the Nayori contracts for the pages that combine them with the earlier
// contracts (analytics, stats, search, evidence, participants).

export const NEXT_ASSETS: readonly NextAsset[] = ["sbtc", "stx"];

/** Funds stay in escrow from funding until the job settles, refunds or closes. */
export const nextHoldsEscrow = (job: Pick<NextJob, "status">) =>
  job.status >= NEXT_STATUS.funded && job.status <= NEXT_STATUS.disputed;

export const nextIsCompleted = (job: Pick<NextJob, "status">) => job.status === NEXT_STATUS.completed;

export interface NextJobsOverview {
  /** Newest first, both assets. */
  jobs: (NextJob & { escrow?: number })[];
  counts: Record<NextAsset, number>;
}

/**
 * Jobs of both Nayori escrows, newest first. `limitPerAsset` caps the reads per escrow (omit it to
 * read every job). `strict` fails when a job inside the count cannot be read, so a snapshot never
 * reports a partial list as complete. `includeEscrow` reads the balance only of jobs that hold one.
 */
export async function getNextJobsOverview(
  options: { limitPerAsset?: number; strict?: boolean; includeEscrow?: boolean } = {}
): Promise<NextJobsOverview> {
  const perAsset = await Promise.all(
    NEXT_ASSETS.map(async (asset) => {
      const total = await getNextJobCount(asset);
      const limit = Math.min(total, options.limitPerAsset ?? total);
      const ids = Array.from({ length: limit }, (_, i) => total - i);
      const jobs = (await Promise.all(ids.map((id) => getNextJob(asset, id)))).filter(
        (job): job is NextJob => Boolean(job)
      );
      if (options.strict && jobs.length !== limit) {
        throw new Error(`nayori-escrow-${asset} returned ${jobs.length} of ${limit} jobs.`);
      }
      const withEscrow = options.includeEscrow
        ? await Promise.all(
            jobs.map(async (job) => ({
              ...job,
              escrow: nextHoldsEscrow(job) ? await getNextEscrowBalance(asset, job.id) : 0,
            }))
          )
        : jobs;
      return { asset, total, jobs: withEscrow };
    })
  );
  return {
    jobs: perAsset.flatMap((entry) => entry.jobs),
    counts: Object.fromEntries(perAsset.map((entry) => [entry.asset, entry.total])) as Record<NextAsset, number>,
  };
}

/** Confirms candidate wallets against nayori-agents; wallets without an agent drop out. */
export async function getNextAgentsFor(wallets: readonly string[], options: { strict?: boolean } = {}): Promise<NextAgent[]> {
  const agents = await Promise.all(
    wallets.map((wallet) =>
      getNextAgent(wallet).catch((error) => {
        if (options.strict) throw error;
        return null;
      })
    )
  );
  return agents.filter((agent): agent is NextAgent => Boolean(agent));
}
