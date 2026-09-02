# Nayori — PerkOS Stacks Agentic Commerce: Clarinet Test Results

## Run clarinet test

```bash
clarinet test
```

## Expected Tests

### Agent Registry Tests

- [x] register-agent: Creates new agent with metadata
- [x] get-agent: Retrieves agent by ID
- [x] agent-count: Returns total agent count
- [x] update-agent: Updates agent metadata
- [x] deactivate-agent: Deactivates an agent

### Agentic Commerce Tests

- [x] create-job: Creates new job with budget
- [x] set-budget: Sets budget for job
- [x] fund-job: Escrows STX for job
- [x] submit-work: Submits work deliverable
- [x] complete-job: Releases payment to provider
- [x] reject-job: Refunds client

## x402 Payment Tests

- [x] STX payment: Native token payments
- [x] sBTC payment: sBTC via SIP-010
- [x] USDCx payment: USDCx via SIP-010

## Next Steps

1. Deploy to testnet
2. Frontend integration
3. x402 payment testing on-chain
