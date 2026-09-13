# Leather treasury custody design

Nayori will initialize the mainnet service-fee contracts with the dedicated Leather account
`SP1NT1V4X6GQR6T32Z8MSMNECZ6GSWX9HZ81SM1Y8`. The deployer and appeal authority remain separate.
The contracts do not need source changes: both immutable candidates already receive the treasury
principal during `initialize-protocol`. This change affects only the guarded release workflow,
tests and operator documentation.

The operator proves control once with a SIP-018 structured-message signature approved in Leather.
This is a custody proof, not approval of the release economics; the independently reviewed source,
tests and guarded promotion bind those economics.
The domain is `Nayori Mainnet Treasury Custody`, version `1`, chain ID `1`. The signed message binds
the action, treasury, deployer, appeal authority, v6/v5 contract names, both frozen source hashes,
the exact reviewed merge SHA, a cryptographically random 32-byte challenge and a 24-hour validity
window. The browser returns only a signature and compressed public key. It never requests or
exports the Leather Secret Key or private key.

The completed JSON attestation is stored outside Git as an operator-owned mode-`0600` file. Before
armed execution, the promoter rejects unknown or missing fields, policy drift, an incorrect release
SHA, invalid timestamps, altered content, malformed signature or public key, and any public key
that does not derive the frozen treasury address. Verification is local over the canonical SIP-018
bytes. Preflight remains read-only and does not open either the attestation or deployer signer.

Only the deployer key signs the seven deployment/configuration transactions. The treasury key is
never present in the release environment. If a settled service fee is later waived, the refund is a
separate treasury-authorized transaction and must be reviewed and approved manually in Leather.
The attestation proves current custody for this exact release; it does not delegate spending power
or create an automated signer.

> Relacionado: [[PerkOS-Projects/README]] · [[PerkOS-Nayori]]
