# Nayori — PerkOS Stacks Agentic Commerce: Frontend Configuration

## Environment Variables

```env
STX_API=https://api.testnet.stacks.co
X402_API=https://x402-api.aibtc.dev
```

## Contract Configuration

```typescript
export const AgentRegistryContract = {
  address: 'ST3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE',
  name: 'agent-registry',
};

export const AgenticCommerceContract = {
  address: 'ST3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE',
  name: 'agentic-commerce',
};
```

## x402 Configuration

```typescript
export const x402Config = {
  stxEndpoint: 'https://x402-api.aibtc.dev/v1/stx',
  sbtcEndpoint: 'https://x402-api.aibtc.dev/v1/sbtc',
  usdcxEndpoint: 'https://x402-api.aibtc.dev/v1/usdcx',
};
```

## Next Steps

1. Deploy contracts to testnet
2. Update frontend with deployed addresses
3. Test wallet integration
4. Test x402 payments
