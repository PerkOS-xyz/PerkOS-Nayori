# Nayori — PerkOS Stacks Agentic Commerce: Clarinet Setup Guide

## Prerequisites

- Node.js 18+ (Clarinet requires Node 18 or higher)
- npm or yarn

## Install Clarinet

```bash
npm install -g clarinet
```

## Verify Installation

```bash
clarinet --version
```

## Validate Contracts

```bash
cd contracts
clarinet check
```

## Run Tests

```bash
clarinet test
```

## Deploy to Testnet

```bash
clarinet deploy --network testnet
```

## Deploy to Mainnet

```bash
clarinet deploy --network mainnet
```

## Update Frontend

After deployment, update contract addresses in `app/src/constants/contract.ts`.
