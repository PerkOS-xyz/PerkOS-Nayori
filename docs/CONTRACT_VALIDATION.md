# Nayori — PerkOS Stacks Agentic Commerce: Contract Validation

## Agent Registry Contract

### Features

- **Register agent**: Add new agent with metadata (name, description, wallet, endpoints)
- **Get agent**: Retrieve agent by ID
- **Agent count**: Get total number of registered agents
- **Update agent**: Modify agent metadata
- **Deactivate agent**: Set agent as inactive

### Upgradability

- Registry contract stores state
- Implementation contract holds logic
- `upgrade-implementation(new-impl)` - owner only

## Agentic Commerce Contract

### Features

- **Create job**: Create new job with client, evaluator, expiredAt, description
- **Set budget**: Set budget for job
- **Fund job**: Escrow STX for job
- **Submit work**: Submit work deliverable
- **Complete job**: Release payment to provider
- **Reject job**: Refund client

### Job States

1. Open
2. Funded
3. Submitted
4. Completed
5. Rejected
6. Expired

### Upgradability

- Same pattern as Agent Registry
- Owner only can upgrade

## x402 Integration

### Tokens Supported

- **STX** (native, primary)
- **sBTC** (via SIP-010)
- **USDCx** (via SIP-010)

### API Endpoint

- `https://x402-api.aibtc.dev`

## Next Steps

1. Deploy to testnet
2. Run clarinet check
3. Run clarinet test
4. Frontend integration
