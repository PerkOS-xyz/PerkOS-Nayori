# QA Evaluator health contract 0.2.0

The promoted Evaluator release identifies its public health contract as version
`0.2.0`. A controlled deployment capture proved that the replacement container was
healthy, Docker DNS resolved its current address, Caddy reached it directly, and the
public HTTPS origin returned HTTP 200 with that version. The QA controller still
expected `0.1.0`, so it rejected the otherwise valid release and rolled back.

The controller, its deterministic public-origin test double, and the security gate
will require version `0.2.0`. All other readiness assertions remain unchanged:
environment QA, Stacks testnet, service-fee v6/v5 contracts, 200 bps, committed
evaluations, private evidence, and non-empty principals. Image tag, immutable image
ID, and live release SHA continue to prove the exact deployed commit.
