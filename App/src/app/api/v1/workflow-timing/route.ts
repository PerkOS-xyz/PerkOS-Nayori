import { fetchCallReadOnlyFunction } from "@stacks/transactions";
import { NETWORK, NETWORK_NAME } from "../../../../constants/network";
import { CONTRACT_ADDRESS, STX_COMMERCE_CONTRACT_NAME, SBTC_COMMERCE_CONTRACT_NAME } from "../../../../constants/contract";
import { getCommerceJob } from "../../../../services/commerce";
import { deadlineProgress, operatorTimingPolicy, parseTimingWindow } from "../../../../services/workflow-timing";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function verifiedBurnHeight() {
  const origin = NETWORK_NAME === "mainnet" ? "https://api.mainnet.hiro.so" : "https://api.testnet.hiro.so";
  const response = await fetch(`${origin}/v2/info`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error("timing_unavailable");
  const info = await response.json();
  if (info.network_id !== (NETWORK_NAME === "mainnet" ? 1 : 2147483648) || !Number.isSafeInteger(info.burn_block_height) || info.burn_block_height < 1) throw Error("timing_unavailable");
  return info.burn_block_height as number;
}
export async function GET(request: Request) {
  const url = new URL(request.url), asset = url.searchParams.get("asset"), rawId = url.searchParams.get("jobId");
  if ((asset !== "stx" && asset !== "sbtc") || (rawId !== null && (!/^[1-9][0-9]*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))))) return reply({ error: "Use asset=stx|sbtc and an optional positive jobId" }, 400);
  try {
    const confirmationPolicy = operatorTimingPolicy(NETWORK_NAME, process.env.NAYORI_WORKFLOW_BURN_BLOCKS, process.env.NAYORI_SETTLEMENT_BURN_BLOCKS);
    const contractName = asset === "stx" ? STX_COMMERCE_CONTRACT_NAME : SBTC_COMMERCE_CONTRACT_NAME;
    const read = async (functionName: string) => parseTimingWindow(await fetchCallReadOnlyFunction({ contractAddress: CONTRACT_ADDRESS,
      contractName, functionName, functionArgs: [], senderAddress: CONTRACT_ADDRESS, network: NETWORK,
      client: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) }) } }));
    const [reviewWindowBurnBlocks, appealWindowBurnBlocks, burnHeight, job] = await Promise.all([
      read("get-review-window"), read("get-appeal-window"), verifiedBurnHeight(), rawId === null ? null : getCommerceJob(Number(rawId), asset),
    ]);
    if (!Number.isSafeInteger(burnHeight) || burnHeight < 1 || (rawId !== null && !job)) throw Error("timing_unavailable");
    if (job && ((job.status === 2 && !deadlineProgress(job.reviewDeadline, burnHeight)) ||
      (job.status === 7 && !deadlineProgress(job.decision?.appealDeadline, burnHeight)) ||
      (job.status === 8 && !deadlineProgress(job.decision?.resolutionDeadline, burnHeight)))) throw Error("timing_unavailable");
    const terminal = job && [3, 4, 5, 6].includes(job.status);
    return reply({ schemaVersion: 1, network: NETWORK_NAME, asset, contract: `${CONTRACT_ADDRESS}.${contractName}`,
      observedAt: new Date().toISOString(), observedBurnHeight: burnHeight,
      confirmationPolicy: { ...confirmationPolicy, scope: "operator-baseline-not-wallet-enforcement", boundPermitIsAuthoritative: true },
      contractWindows: { reviewWindowBurnBlocks, appealWindowBurnBlocks, source: "on-chain", configurablePerJob: false },
      estimate: { secondsPerBurnBlock: 600, guaranteed: false, includesMempoolOrLlmLatency: false },
      feedback: { targetSeconds: null, note: "No guaranteed evaluation SLA. A recorded decision is visible before payment eligibility." },
      job: job ? { id: job.id, status: job.status, review: !terminal && job.status === 2 ? deadlineProgress(job.reviewDeadline, burnHeight) : null,
        appeal: !terminal && job.status === 7 ? deadlineProgress(job.decision?.appealDeadline, burnHeight) : null,
        resolution: !terminal && job.status === 8 ? deadlineProgress(job.decision?.resolutionDeadline, burnHeight) : null,
        originalDecision: job.decision?.originalDecision ?? null, finalDecision: job.decision?.finalDecision ?? null,
        note: "Deadline eligibility is not payment confirmation; role, state and escrow checks still apply." } : null });
  } catch { return reply({ error: "timing_unavailable", note: "Could not verify timing. Do not infer zero wait or payment readiness." }, 503); }
}
