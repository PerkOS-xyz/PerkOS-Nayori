# Nayori — PerkOS Stacks Agentic Commerce: Clarinet Deployment Guide

## Run Clarinet Check

```bash
cd contracts
clarinet check
```

## Run Clarinet Test

```bash
clarinet test
```

## Deploy to Testnet

1. Update `Clarinet.toml` with testnet configuration
2. Run:
```bash
clarinet deploy --network testnet
```

## Deploy to Mainnet

1. Complete security audit
2. Update `Clarinet.toml` with mainnet configuration
3. Run:
```bash
clarinet deploy --network mainnet
```

## Post-Deployment

1. Update frontend with new contract addresses
2. Run integration tests
3. Deploy frontend to hosting
4. Announce deployment
