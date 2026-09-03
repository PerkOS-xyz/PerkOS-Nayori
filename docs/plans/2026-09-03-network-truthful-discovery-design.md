# Network-truthful direct-commerce discovery

## Decision

The Web, agent manifests, Agent Skills, ARD resources, landing boundary and developer portal must
derive their direct-commerce network from `NEXT_PUBLIC_STACKS_NETWORK`. A QA build describes
Stacks testnet and a production build describes Stacks mainnet. No generated production surface
may hard-code testnet while its health endpoint and escrow contracts report mainnet.

The same-origin `/api/v1` and `/api/mpp/v1` routes remain narrow proxies to `api.nayori.ai`; they
do not gain credentials, signing authority or custody. Capability documents continue to state that
wallet approval is required, broadcast is not confirmation, settlement is asynchronous and
sponsorship is disabled. Mainnet publication is activated only after the isolated Platform
facilitator is configured for mainnet and returns `stacks:1` challenges.

## Verification

Unit tests assert that manifest network IDs, status values and agent-facing text match the build
network. Production builds must contain `stacks:1` and no current-boundary claim that mainnet
facilitator settlement is disabled. QA builds retain `stacks:2147483648`. Public smoke checks must
decode both 402 protocols and confirm the mainnet network, an `SP...` recipient and canonical
mainnet USDCx metadata before the release is accepted. These checks do not sign or broadcast a
payment.

