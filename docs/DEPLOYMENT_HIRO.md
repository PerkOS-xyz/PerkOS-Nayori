# Nayori — PerkOS Stacks Agentic Commerce: Deployment Files

## Deploy to Testnet via Hiro Wallet

### Step 1: Deploy Agent Registry

1. Go to https://wallet.hiro.so/
2. Connect wallet (Leather, Hiro, etc.)
3. Click "Deploy Contract"
4. Copy/paste `contracts/agent-registry.clar`
5. Select "Stacks Testnet"
6. Click "Deploy"

### Step 2: Deploy Agentic Commerce

1. Click "Deploy Contract"
2. Copy/paste `contracts/agentic-commerce.clar`
3. Select "Stacks Testnet"
4. Click "Deploy"

### Step 3: Update Frontend

After deployment, update `app/src/constants/contract.ts` with the new addresses:

```typescript
export const AgentRegistryContract = {
  address: 'ST3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.agent-registry',
  name: 'agent-registry',
};

export const AgenticCommerceContract = {
  address: 'ST3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.agentic-commerce',
  name: 'agentic-commerce',
};
```

## Frontend Test

After deployment, run:

```bash
cd app
npm run dev
```

## x402 Payment Test

Test payments via x402 API:

```typescript
import { x402API } from '../utils/x402';

const result = await x402API.payment({
  recipient: 'ST3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE',
  amount: 1000,
  jobId: 1,
  token: 'stx',
});
```
