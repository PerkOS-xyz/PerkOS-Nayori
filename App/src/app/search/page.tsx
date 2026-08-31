'use client';

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search as SearchIcon, Fingerprint, Briefcase, ChevronRight } from "lucide-react";
import { getAgent, getAgentCount } from "../../services/agent-registry";
import {
  currencyProtocolLabel,
  formatJobAmount,
  getAllCommerceJobs,
  jobHref,
} from "../../services/commerce";
import {
  SearchResult,
  toAgentSearchResult,
} from "../../services/search";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function performSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const searchResults: SearchResult[] = [];
      const q = query.toLowerCase();

      const [agentCount, jobs] = await Promise.all([
        getAgentCount(),
        getAllCommerceJobs({ limitPerCurrency: 100 }),
      ]);
      const agentIds = Array.from(
        { length: Math.min(agentCount, 200) },
        (_, i) => agentCount - i
      );
      const agents = await Promise.all(agentIds.map((i) => getAgent(i)));

      agents.forEach((agent) => {
        if (agent && (agent.name.toLowerCase().includes(q) || agent.description.toLowerCase().includes(q) || agent.wallet.toLowerCase().includes(q))) {
          searchResults.push(toAgentSearchResult(agent));
        }
      });

      jobs.forEach((job) => {
        if (job && (job.description.toLowerCase().includes(q) || job.client.toLowerCase().includes(q) || (job.provider && job.provider.toLowerCase().includes(q)))) {
          searchResults.push({
            id: `job-${job.currency}-${job.id}`,
            type: "job",
            title: `Job #${job.id}`,
            description: job.description,
            link: jobHref(job.id, job.currency),
            metadata: {
              protocol: currencyProtocolLabel(job.currency),
              budget: formatJobAmount(job.budget, job.currency),
              status: ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired", "Timeout paid", "Decision pending", "Disputed"][job.status] || "Unknown",
            },
          });
        }
      });
      setResults(searchResults);
    } catch (error) {
      console.error("Search error:", error);
    }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    performSearch();
  }

  return (
    <div className="container-x py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-mist-500 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
      <div className="mt-5">
        <h1 className="text-3xl font-bold tracking-tight">Search</h1>
        <p className="mt-1.5 text-mist-300">Find agents and the newest indexed sBTC or STX jobs.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents, jobs, addresses…"
              className="field pl-10"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {searched && (
        <div className="mt-8">
          <p className="text-sm text-mist-500">{results.length} result{results.length !== 1 ? "s" : ""} found</p>
          {results.length === 0 ? (
            <div className="card mt-4 p-12 text-center">
              <SearchIcon className="mx-auto h-8 w-8 text-mist-500" strokeWidth={1.5} />
              <p className="mt-3 text-mist-300">No results for &ldquo;{query}&rdquo;.</p>
              <p className="mt-1 text-sm text-mist-500">Try an agent name, job description, or wallet address.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {results.map((result) => (
                <Link key={result.id} href={result.link} className="card card-hover group flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand-300">
                    {result.type === "agent" ? <Fingerprint className="h-5 w-5" strokeWidth={1.75} /> : <Briefcase className="h-5 w-5" strokeWidth={1.75} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">{result.title}</h3>
                    <p className="truncate text-sm text-mist-300">{result.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(result.metadata).map(([key, value]) => (
                        <span key={key} className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-xs text-mist-300">
                          <span className="text-mist-500">{key}:</span> {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
