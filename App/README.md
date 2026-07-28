# App - PerkOS Stacks Agentic Commerce Frontend

Next.js 14 frontend for PerkOS Stacks Agentic Commerce.

## Overview

React application for the PerkOS contracts on Stacks. Users can settle jobs in sBTC or STX. sBTC is
the recommended Bitcoin-denominated path; the STX contract provides the same hardened lifecycle
safeguards for users who prefer STX-denominated work.

## Features

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Hero section, features overview |
| Dashboard | `/dashboard` | Protocol stats, recent activity |
| Agents | `/agents` | Paginated agent directory, ownership controls, reputation and validation |
| Jobs | `/jobs` | Role-aware sBTC and STX job lifecycle |
| Job detail | `/jobs/[id]?currency=sbtc` | Currency-safe job detail and deliverable commitment |
| Analytics | `/analytics` | Currency-separated protocol metrics |
| Activity | `/activity` | Protocol event timeline |
| Search | `/search` | Full-text search |

### Components

- **WalletConnect**: Leather-compatible Stacks wallet integration
- **X402PaymentButton**: Currency-aware, on-chain verified payment requests
- **Toast**: Transaction and wallet feedback
- **JobStepper**: Escrow lifecycle visualization
- **StatusBadge**: Status indicators

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Wallet**: @stacks/connect
- **Blockchain**: @stacks/transactions

## Installation

```bash
cd App
nvm use
npm install
```

Node.js 20 or newer is required.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── agents/
│   ├── jobs/
│   ├── dashboard/
│   ├── analytics/
│   ├── activity/
│   ├── search/
│   └── page.tsx
├── components/             # Reusable UI components
│   ├── WalletConnect.tsx
│   ├── X402PaymentButton.tsx
│   ├── Toast.tsx
│   ├── JobStepper.tsx
│   └── StatusBadge.tsx
├── services/               # Contract interaction layer
│   ├── agent-registry.ts
│   ├── agentic-commerce.ts
│   ├── sbtc-commerce.ts
│   ├── commerce.ts
│   ├── reputation-v2.ts
│   ├── validation.ts
│   └── x402.ts
├── middleware/             # API middleware
│   └── x402.ts
└── constants/
    ├── contract.ts         # Contract addresses
    └── network.ts          # Network configuration
```

## Contract Integration

### Read Operations

```typescript
import { getAgent, getAgentCount } from './services/agent-registry';
import { getJob, getJobCount } from './services/agentic-commerce';

const agent = await getAgent(1);
const count = await getAgentCount();
```

### Write Operations

```typescript
import { registerAgent } from './services/agent-registry';
import { createJob } from './services/agentic-commerce';

await registerAgent('My Agent', 'Description', wallet, endpoints);
await createJob(provider, evaluator, expiredAt, description);
```

## Configuration

Copy `.env.example` to `.env.local`. The public app defaults to the verified mainnet deployment;
testnet must be selected explicitly.

```env
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH
NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v2
```

## Wallet Setup

1. Install [Leather Wallet](https://leather.io/)
2. Select the same network configured for the app
3. Hold STX for transaction fees and STX-denominated jobs; hold sBTC for sBTC-denominated jobs
4. Connect via "Connect Wallet" button

## License

MIT
