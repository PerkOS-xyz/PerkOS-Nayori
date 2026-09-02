# Frontend Integration Guide

## Overview

The frontend is built with Next.js 15 (App Router) and integrates with Stacks contracts using
`@stacks/connect` and `@stacks/transactions`.

## Architecture

```
App/src/
├── app/
│   ├── agents/           # Agent registry page
│   ├── jobs/             # Job escrow page
│   └── page.tsx          # Home page
├── components/
│   ├── WalletConnect.tsx # Wallet connection
│   ├── LoadingSpinner.tsx # Loading state
│   ├── ErrorMessage.tsx   # Error display
│   ├── StatusBadge.tsx    # Job status badge
│   └── TransactionButton.tsx # Action button
├── services/
│   ├── agent-registry.ts # Registry contract service
│   └── agentic-commerce.ts # Commerce contract service
└── constants/
    ├── contract.ts       # Contract addresses
    └── network.ts        # Network config
```

## Wallet Connection

```tsx
import { Connect } from '@stacks/connect-react';

<Connect
  authOptions={{
    appDetails: {
      name: 'Nayori — PerkOS Stacks Agentic Commerce',
      icon: 'https://your-icon-url.com/logo.png',
    },
    redirectTo: '/',
    onFinish: () => {
      console.log('Wallet connected');
    },
  }}>
  <ConnectButton />
</Connect>
```

## Contract Calls

### Register Agent

```tsx
import { openContractCall } from '@stacks/connect-react';
import { stringAsciiCV, principalCV, listCV, tupleCV } from '@stacks/transactions';

await openContractCall({
  contractAddress: CONTRACT_ADDRESS,
  contractName: 'agent-registry',
  functionName: 'register-agent',
  functionArgs: [
    stringAsciiCV('My Agent'),
    stringAsciiCV('Description'),
    principalCV('ST1PQ...'),
    listCV([
      tupleCV({
        name: stringAsciiCV('web'),
        url: stringAsciiCV('https://api.example.com'),
      }),
    ]),
  ],
  network: NETWORK,
});
```

### Create Job

```tsx
await openContractCall({
  contractAddress: CONTRACT_ADDRESS,
  contractName: 'agentic-commerce',
  functionName: 'create-job',
  functionArgs: [
    optionalCV(noneCV()), // provider (optional)
    principalCV('ST1PQ...'), // evaluator
    uintCV(2000), // expired-at block
    stringAsciiCV('Build a website'),
  ],
  network: NETWORK,
});
```

### Fund Job

```tsx
await openContractCall({
  contractAddress: CONTRACT_ADDRESS,
  contractName: 'agentic-commerce',
  functionName: 'fund-job',
  functionArgs: [uintCV(1)], // job-id
  network: NETWORK,
  // STX amount is handled by the contract (budget)
});
```

## State Management

The frontend uses React hooks for state:

- `useState` for component state
- `useEffect` for data fetching
- Custom hooks for contract interactions

## Error Handling

```tsx
const [error, setError] = useState<string | null>(null);

try {
  await openContractCall({...});
} catch (error) {
  setError('Transaction failed: ' + error.message);
}
```

## Loading States

```tsx
const [loading, setLoading] = useState(false);

<button disabled={loading}>
  {loading ? 'Processing...' : 'Submit'}
</button>
```

## Transaction Flow

1. User clicks action button
2. Frontend calls `openContractCall`
3. Wallet popup appears
4. User confirms transaction
5. Transaction broadcasted
6. Wait for confirmation
7. Refresh data

## Testing

### Local Development

```bash
cd App
npm run dev
```

### Testnet Testing

1. Configure `constants/contract.ts` with testnet addresses
2. Connect wallet to testnet
3. Use testnet STX for transactions

## Troubleshooting

### Wallet not connecting
- Ensure wallet extension is installed
- Check network (mainnet vs testnet)
- Refresh page and try again

### Transaction failing
- Check contract address is correct
- Verify sufficient STX balance
- Check function arguments match contract types

### Data not loading
- Verify network configuration
- Check contract deployment
- Review browser console for errors
