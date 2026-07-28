// x402 Payment Protocol Integration
// Reference: https://github.com/coinbase/x402
// Adapted for Stacks/STX: funds a job escrow via @stacks/connect request()

import { request } from "@stacks/connect";
import { Cl } from "@stacks/transactions";
import { AGENTIC_COMMERCE_CONTRACT } from "../constants/contract";
import { NETWORK_NAME } from "../constants/network";
import { fundSbtcJob } from "./sbtc-commerce";
import { Currency, getCommerceEscrow, getCommerceJob } from "./commerce";

export interface X402PaymentRequest {
  amount: number;
  destination: string;
  jobId: number;
  currency: Currency;
  sender?: string;
  memo?: string;
}

export interface X402PaymentResponse {
  txId: string;
  status: "pending" | "confirmed" | "failed";
  jobId: number;
}

/**
 * Create an x402-style payment request for agent services.
 * Follows the x402 protocol pattern adapted for Stacks/STX.
 */
export function createPaymentRequest(
  amount: number,
  destination: string,
  jobId: number,
  currency: Currency = "sbtc",
  sender?: string
): X402PaymentRequest {
  return {
    amount,
    destination,
    jobId,
    currency,
    sender,
    memo: `Payment for job #${jobId}`,
  };
}

/**
 * Execute an x402 payment for a job by funding the escrow with STX.
 */
export async function executeX402Payment(
  paymentRequest: X402PaymentRequest
): Promise<X402PaymentResponse> {
  try {
    if (paymentRequest.currency === "sbtc" && !paymentRequest.sender) {
      throw new Error("A sender address is required for the sBTC post-condition");
    }
    const result =
      paymentRequest.currency === "sbtc"
        ? await fundSbtcJob(
            paymentRequest.jobId,
            paymentRequest.amount,
            paymentRequest.sender || ""
          )
        : await request("stx_callContract", {
            contract: AGENTIC_COMMERCE_CONTRACT as `${string}.${string}`,
            functionName: "fund-job",
            functionArgs: [Cl.uint(paymentRequest.jobId)],
            network: NETWORK_NAME,
          });

    return {
      txId: result.txid ?? "",
      status: "pending",
      jobId: paymentRequest.jobId,
    };
  } catch (error) {
    console.error("x402 payment error:", error);
    return {
      txId: "",
      status: "failed",
      jobId: paymentRequest.jobId,
    };
  }
}

/**
 * Verify x402 payment was successful (checks the job's escrow balance).
 */
export async function verifyX402Payment(
  jobId: number,
  currency: Currency = "sbtc"
): Promise<boolean> {
  try {
    const [job, escrow] = await Promise.all([
      getCommerceJob(jobId, currency),
      getCommerceEscrow(jobId, currency),
    ]);
    return Boolean(job && job.status >= 1 && escrow > 0);
  } catch (error) {
    console.error("x402 verification error:", error);
    return false;
  }
}

/**
 * Generate x402 payment headers for API requests (x402 HTTP payment header spec).
 */
export function generateX402Headers(
  paymentRequest: X402PaymentRequest
): Record<string, string> {
  return {
    "X-X402-Version": "1.0",
    "X-X402-Network": `stacks-${NETWORK_NAME}`,
    "X-X402-Currency": paymentRequest.currency,
    "X-X402-Amount": paymentRequest.amount.toString(),
    "X-X402-Destination": paymentRequest.destination,
    "X-X402-Job-Id": paymentRequest.jobId.toString(),
    "X-X402-Memo": paymentRequest.memo || "",
  };
}

/**
 * Parse x402 payment headers from an HTTP request.
 */
export function parseX402Headers(
  headers: Record<string, string>
): X402PaymentRequest | null {
  const amount = parseInt(headers["X-X402-Amount"]);
  const destination = headers["X-X402-Destination"];
  const jobId = parseInt(headers["X-X402-Job-Id"]);
  const currency: Currency =
    headers["X-X402-Currency"]?.toLowerCase() === "stx" ? "stx" : "sbtc";

  if (isNaN(amount) || !destination || isNaN(jobId)) {
    return null;
  }

  return {
    amount,
    destination,
    jobId,
    currency,
    memo: headers["X-X402-Memo"],
  };
}
