# QA identity-contract prerequisite

The first post-rollout transparency probe correctly reported the QA chain source as unavailable.
The exact runtime error was `NoSuchContract` for the canonical testnet deployer’s
`agent-registry`. Public chain inspection confirmed that neither `agent-registry` nor
`validation-registry` exists at that address, even though the QA application and discovery
documents expose both. Commerce v5/v4 and reputation v3 are present and healthy.

Three approaches were considered. Hiding the failure or excluding the missing contracts from the
dashboard would make the UI green while leaving registration and validation broken. Pointing QA at
an unrelated historical deployer would split identity from the commerce environment and make the
20-case evidence harder to reproduce. The selected approach is to deploy the two already-reviewed,
current repository sources under the canonical QA deployer, without changing commerce contracts.

The deployment runner is fail-closed. Its default action is signer-free preflight. It verifies the
Stacks testnet network ID, exact deployer, empty deployer mempool, sufficient public balance, local
source hashes and the current on-chain state. An existing contract is accepted only when its source
hash exactly matches; a mismatch aborts. Signing is reachable only with the explicit testnet action,
typed confirmation and an external mode-0600 environment file. Contracts deploy sequentially with
the live nonce, confirmation is required, and the published source is rehashed before success.

Success means both interfaces exist, the transparency snapshot returns `chain=live`, landing and
`/evidence` display the same four values, and the guarded 20-case preflight passes. Receipts contain
only public addresses, hashes, transaction IDs and block heights. This is internal QA evidence and
does not count as Milestone 2 adoption, external usage or revenue.
