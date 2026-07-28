// x402 Middleware for Next.js API routes
// This demonstrates how x402 payments could be integrated
// with API endpoints for agent services

import { NextRequest, NextResponse } from 'next/server';
import { parseX402Headers, verifyX402Payment } from '../services/x402';

/**
 * x402 Middleware - Protect API routes with payment verification
 * 
 * Usage in API route:
 * ```
 * export async function POST(req: NextRequest) {
 *   const paymentResult = await x402Middleware(req);
 *   if (!paymentResult.success) {
 *     return paymentResult.response;
 *   }
 *   // Process the request...
 * }
 * ```
 */
export async function x402Middleware(req: NextRequest): Promise<{
  success: boolean;
  response?: NextResponse;
  payment?: {
    jobId: number;
    amount: number;
  };
}> {
  // Check for x402 payment headers
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const paymentRequest = parseX402Headers(headers);

  if (!paymentRequest) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Payment required',
          message: 'This endpoint requires x402 payment headers',
          x402: {
            version: '1.0',
            network: 'stacks-testnet',
          },
        },
        { status: 402 }
      ),
    };
  }

  // Verify payment was made
  const isValid = await verifyX402Payment(paymentRequest.jobId, paymentRequest.currency);

  if (!isValid) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Payment verification failed',
          message: 'The x402 payment could not be verified',
          x402: {
            jobId: paymentRequest.jobId,
            amount: paymentRequest.amount,
          },
        },
        { status: 402 }
      ),
    };
  }

  return {
    success: true,
    payment: {
      jobId: paymentRequest.jobId,
      amount: paymentRequest.amount,
    },
  };
}

/**
 * Example API route using x402 middleware
 * This shows how to protect agent endpoints with payments
 */
export async function exampleAgentEndpoint(req: NextRequest) {
  const paymentResult = await x402Middleware(req);

  if (!paymentResult.success) {
    return paymentResult.response;
  }

  // Payment verified, process the request
  const { jobId, amount } = paymentResult.payment!;

  return NextResponse.json({
    message: 'Agent service executed',
    jobId,
    amount,
    result: {
      // Agent processing result
      status: 'completed',
      output: 'Task completed successfully',
    },
  });
}
