# Nayori — PerkOS Stacks Agentic Commerce: Deployable Contracts

## Smart Contracts Ready for Testnet Deployment

### Agent Registry (`contracts/agent-registry.clar`)

- [x] Syntax validated
- [x] Upgradability pattern implemented
- [x] Access control functions
- [x] Agent registration/management
- [x] Upgrade function

### Agentic Commerce (`contracts/agentic-commerce.clar`)

- [x] Syntax validated
- [x] Upgradability pattern implemented
- [x] Job escrow with 6 states
- [x] x402 compatible (STX payments)
- [x] Access control

## Deployment Checklist

- [ ] Run `clarinet check`
- [ ] Run `clarinet test`
- [ ] Deploy to Stacks Testnet
- [ ] Update contract addresses in frontend
- [ ] Frontend integration with actual contract calls
- [ ] Deploy to Stacks Mainnet (after audit)

## x402 Integration

Payments in STX via x402 protocol:
- Reference: `github.com/aibtcdev/x402-api`
- Token: STX (native)
- Alternative tokens: sBTC, USDCx (via SIP-010)

## Next Steps

1. Run `clarinet check` and `clarinet test`
2. Deploy to testnet
3. Test frontend integration
4. Deploy to mainnet
