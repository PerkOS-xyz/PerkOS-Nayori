# QA public-origin grace window

The QA release controller validates the public HTTPS origin after Docker reports a
container healthy. During the Evaluator rollout, Caddy needed more than the former
six-second retry window to refresh its upstream connection. The public endpoint was
healthy immediately after the controller completed its verified rollback.

The controller will continue to validate the public origin rather than substituting
an internal container check. It will make up to ten HTTPS attempts separated by three
seconds, for a bounded maximum propagation window of roughly 27 seconds plus request
timeouts. A persistent public error still fails closed, restores the previous Compose
model and runtime, and cannot create a passed receipt.

The controller test harness simulates a public endpoint that fails its first four
requests and then becomes healthy. The test requires a successful deployment receipt.
Existing stale-origin tests continue to prove that persistent failures trigger rollback
and do not produce evidence of a successful release.
