'use client';

import { useState } from 'react';
import { executeX402Payment, createPaymentRequest } from '../services/x402';
import { getLocalStorage } from "@stacks/connect";
import { Currency, formatJobAmount } from "../services/commerce";
import { txStatus } from "../services/tx";

interface X402PaymentButtonProps {
  jobId: number;
  amount: number;
  destination: string;
  currency?: Currency;
  onSuccess?: (result: { txId: string; jobId: number }) => void;
  onError?: (error: Error) => void;
}

export default function X402PaymentButton({
  jobId,
  amount,
  destination,
  currency = "sbtc",
  onSuccess,
  onError,
}: X402PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'confirmed' | 'failed'>('idle');

  async function handlePayment() {
    setLoading(true);
    setStatus('processing');

    try {
      const sender = getLocalStorage()?.addresses?.stx?.[0]?.address;
      const paymentRequest = createPaymentRequest(amount, destination, jobId, currency, sender);
      const result = await executeX402Payment(paymentRequest);

      if (!result.txId) throw new Error("Payment failed or was cancelled");
      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        const chainStatus = await txStatus(result.txId);
        if (chainStatus === "success") {
          setStatus("confirmed");
          onSuccess?.({ txId: result.txId, jobId: result.jobId });
          return;
        }
        if (chainStatus.startsWith("abort")) throw new Error("Payment failed on-chain");
      }
      throw new Error("Payment is still pending; check the explorer");
    } catch (error) {
      setStatus('failed');
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  }

  const statusConfig = {
    idle: { text: `Pay ${formatJobAmount(amount, currency)}`, color: 'bg-bitcoin hover:bg-bitcoin/80' },
    processing: { text: 'Processing...', color: 'bg-yellow-600 cursor-wait' },
    confirmed: { text: 'Paid ✓', color: 'bg-green-600' },
    failed: { text: 'Retry Payment', color: 'bg-red-600 hover:bg-red-700' },
  };

  const config = statusConfig[status];

  return (
    <button
      onClick={handlePayment}
      disabled={loading || status === 'confirmed'}
      className={`${config.color} text-white px-4 py-2 rounded transition-colors disabled:opacity-50`}
    >
      {config.text}
    </button>
  );
}
