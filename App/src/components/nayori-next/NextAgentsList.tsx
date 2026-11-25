'use client';

import { useEffect, useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { getNayoriAgentCandidates, EXPLORER, CHAIN_PARAM } from "../../services/onchain-stats";
import { getNextAgentsFor } from "../../services/nayori-next/overview";
import { getNextProviderStats } from "../../services/nayori-next/reads";
import { averageRating, type NextAgent, type NextProviderStats } from "../../services/nayori-next/parse";
import { shortAddr } from "../../utils/format";

const isWebLink = (value: string) => /^https?:\/\//i.test(value);

type Row = { agent: NextAgent; stats: NextProviderStats | null };

/** Agents registered on nayori-agents, newest first, with their provider record on the Nayori contracts. */
export default function NextAgentsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const wallets = await getNayoriAgentCandidates();
        const agents = (await getNextAgentsFor(wallets)).sort((a, b) => b.registeredAt - a.registeredAt);
        const stats = await Promise.all(agents.map((agent) => getNextProviderStats(agent.wallet).catch(() => null)));
        if (live) setRows(agents.map((agent, index) => ({ agent, stats: stats[index] })));
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (failed) return <p className="mt-4 text-sm text-mist-500">The agent list could not be read right now. Refresh to try again.</p>;
  if (rows === null) return <p className="mt-4 text-sm text-mist-500">Loading agents...</p>;
  if (rows.length === 0) return <p className="mt-4 text-sm text-mist-500">No agents registered on the Nayori contracts yet.</p>;

  return (
    <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.map(({ agent, stats }) => {
        const rating = stats ? averageRating(stats) : null;
        return (
          <li key={agent.wallet} className="card flex flex-col gap-2 p-4">
            <p className="truncate font-semibold text-white">{agent.name}</p>
            <a
              href={`${EXPLORER}/address/${agent.wallet}?chain=${CHAIN_PARAM}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-mist-400 hover:text-white"
            >
              {shortAddr(agent.wallet)} <ExternalLink className="h-3 w-3" />
            </a>
            {isWebLink(agent.uri) && (
              <a href={agent.uri} target="_blank" rel="noreferrer" className="truncate text-xs text-brand-300 hover:text-brand-200">
                {agent.uri}
              </a>
            )}
            {stats && (
              <p className="mt-auto flex items-center gap-3 text-xs text-mist-400">
                <span>{stats.completed} completed</span>
                <span>{stats.distinctClients} clients</span>
                {rating !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3" /> {rating.toFixed(1)} ({stats.ratingCount})
                  </span>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
