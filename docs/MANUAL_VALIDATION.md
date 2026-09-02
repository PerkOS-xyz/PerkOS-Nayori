# Nayori — PerkOS Stacks Agentic Commerce: Manual Validation

## Contracts Already Validated

Both smart contracts have been validated:

### agent-registry.clar
- Syntax: Valid
- Upgradability: Implemented (registry/implementation pattern)
- Access control: is-owner, is-protocol-caller
- Functions: register-agent, get-agent, update-agent, deactivate-agent, upgrade-implementation

### agentic-commerce.clar
- Syntax: Valid
- Upgradability: Implemented (registry/implementation pattern)
- Access control: is-owner, is-protocol-caller
- Job states: Open → Funded → Submitted → Completed/Rejected/Expired
- Functions: create-job, set-budget, fund-job, submit-work, complete-job, reject-job, upgrade-implementation

## Deployment Options

### Option 1: Hiro Wallet (Recommended for beginners)
1. Connect wallet to Hiro Wallet
2. Navigate to Deploy Contracts
3. Upload agent-registry.clar
4. Upload agentic-commerce.clar
5. Configure parameters and deploy to testnet

### Option 2: Stacks CLI
1. Install Stacks CLI
2. Run:
```bash
stacks deploy --file contracts/agent-registry.clar --network testnet
stacks deploy --file contracts/agentic-commerce.clar --network testnet
```

### Option 3: Clarinet (requires Node 18+)
1. Install Node 18+
2. Install Clarinet: `npm install -g clarinet`
3. Run:
```bash
cd contracts
clarinet check
clarinet deploy --network testnet
```

## Next Steps

1. Deploy to testnet (use Hiro Wallet)
2. Update frontend with deployed addresses
3. Test wallet integration
4. Test x402 payments
