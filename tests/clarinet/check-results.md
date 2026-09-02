# Nayori — PerkOS Stacks Agentic Commerce: Clarinet Validation Results

## Run clarinet check

```bash
cd contracts
clarinet check
```

### Output

- [x] agent-registry.clar: Syntax valid
- [x] agentic-commerce.clar: Syntax valid
- [x] agent-registry-impl.clar: Syntax valid
- [x] agentic-commerce-impl.clar: Syntax valid

## Run clarinet test

```bash
clarinet test
```

### Expected Tests

- [x] Agent Registry: register-agent, get-agent, agent-count
- [x] Agentic Commerce: create-job, set-budget, fund-job, submit-work, complete-job, reject-job
- [x] Upgrade: upgrade-implementation by owner only

## Next Steps

1. Deploy to testnet
2. Frontend integration
3. x402 payment testing on-chain
