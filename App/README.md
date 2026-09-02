# Nayori — PerkOS Stacks Agentic Commerce Frontend

Next.js 15 frontend for Nayori — PerkOS Stacks Agentic Commerce, the Bitcoin Commerce Agent.

## Overview

Nayori coordinates access to the PerkOS contracts on Stacks. Users can settle jobs in sBTC or STX.
sBTC is the recommended Bitcoin-denominated path; the STX contract provides the same hardened
lifecycle safeguards for users who prefer STX-denominated work.

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

- **Framework**: Next.js 15 (App Router)
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

## Container deployment (VPS only)

The production build supports Next.js standalone output and runs as a non-root container. Public
configuration is compiled into the browser bundle, so provide the target origin and reviewed
mainnet contract values as build arguments. Nayori images are built on the deployment VPS, never
on a developer workstation:

```bash
docker build \
  --build-arg NEXT_PUBLIC_STACKS_NETWORK=mainnet \
  --build-arg NEXT_PUBLIC_CONTRACT_ADDRESS=SP2K7PV5NXBNRV510S6DCA6RFMTFHAF3ZPK6ZSXPH \
  --build-arg NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v4 \
  --build-arg NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT=sbtc-commerce-v3 \
  --build-arg NEXT_PUBLIC_REPUTATION_CONTRACT=reputation-registry-v3 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://preview.nayori.ai \
  -t nayori-web .

docker run --rm -p 3000:3000 nayori-web
```

The container exposes `GET /api/health` and includes a Docker healthcheck. Runtime secrets such as
`CHAINHOOK_SECRET` must be injected by the deployment environment and must never be included as
build arguments or image layers.

Agent-readable discovery is available through `/.well-known/agent.json`, `/llms.txt`, the RFC 9727
`/.well-known/api-catalog`, ARD manifests and the Agent Skills v0.2.0 index. Requests to the
homepage with `Accept: text/markdown` receive the same curated Markdown representation. Homepage
responses expose discovery `Link` relations, and supporting browsers register three read-only
WebMCP tools before hydration and again through the client lifecycle. These surfaces link to the
public [Nayori partner API](https://api.nayori.ai), its
[`/supported`](https://api.nayori.ai/supported) capability response, OpenAPI schema and JWKS. The
API runs an invite-only testnet pilot with wallet-linked OAuth, MCP, request-bound quotes,
verification, one broadcast attempt, confirmation reconciliation and an idempotent delivery
ledger. Mainnet facilitator settlement and sponsorship remain disabled. The web app also exposes
the canonical protected-resource identity and `Auth.md`, redirects issuer discovery to the
separate `oauth.nayori.ai` service, and publishes the MCP Server Card, `x402.json` and a versioned
public evidence manifest. It does not proxy credentials or state-changing requests.

The browser tools expose only public discovery documents. They do not access wallet state or
credentials, and every state-changing Stacks action remains behind explicit wallet authorization.

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── agents/
│   ├── jobs/
│   ├── dashboard/
│   ├── analytics/
│   ├── activity/
│   ├── evidence/
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
NEXT_PUBLIC_STX_COMMERCE_CONTRACT=agentic-commerce-v4
NEXT_PUBLIC_SBTC_COMMERCE_CONTRACT=sbtc-commerce-v3
NEXT_PUBLIC_REPUTATION_CONTRACT=reputation-registry-v3
NEXT_PUBLIC_SITE_URL=https://nayori.ai
```

`NEXT_PUBLIC_SITE_URL` controls canonical and social metadata. Change it only after the target
domain, DNS and deployment are live; previews should use their own public origin.

For a testnet preview, use the public values in `testnet.env.example` only in that environment.
Branch-scoped preview variables are preferred so unrelated deployments retain their own
configuration. Both networks use the source-equivalent v4/v3/v3 generation under their respective
deployer addresses.

The three contract-name variables are intentionally independent. This keeps preview and rollback
configuration explicit without recompiling contract names into the service layer. Select a name
only after its source and post-deployment wiring have been verified on the target network.

Settlement reads the live escrow rather than assuming the job budget is still held. For
funded sBTC jobs it also reads `get-job-payment-token` and binds both the trait argument and exact
fungible-token post-condition to that pinned principal. A missing funded-job token fails closed
before Leather opens; an unfunded open job can expire with zero outflow and no pinned token.

An invalid `NEXT_PUBLIC_STACKS_NETWORK` now fails the build instead of silently falling back to
mainnet.

## Wallet Setup

1. Install [Leather Wallet](https://leather.io/)
2. Select the same network configured for the app
3. Hold STX for transaction fees and STX-denominated jobs; hold sBTC for sBTC-denominated jobs
4. Connect via "Connect Wallet" button

## License

MIT
