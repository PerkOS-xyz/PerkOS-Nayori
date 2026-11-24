;; nayori-permissions
;; Opt-in delegation, as in PoX. A party is always tx-sender. A call that
;; reaches a Nayori contract through another contract counts as the party's
;; only if the party allowed that caller for that Nayori contract first,
;; optionally until a Bitcoin block height. An allowance covers one target
;; contract only. Allowing and revoking must be called directly by the party,
;; so no contract can grant itself permission. Role handovers in nayori-roles
;; never use delegation.

(define-constant ERR_NOT_DIRECT (err u400))

(define-map allowed-callers { party: principal, caller: principal, target: principal } (optional uint))

(define-read-only (get-allowance (party principal) (caller principal) (target principal))
  (map-get? allowed-callers { party: party, caller: caller, target: target }))

;; True when `caller` may act for `party` on `target` right now. Each Nayori
;; contract passes its own contract-caller and itself; tx-sender must be the party.
(define-read-only (is-allowed (party principal) (caller principal) (target principal))
  (match (map-get? allowed-callers { party: party, caller: caller, target: target })
    allowance (match allowance
      until (< burn-block-height until)
      true)
    false))

(define-public (allow-contract-caller (caller principal) (target principal) (until (optional uint)))
  (begin
    (asserts! (is-eq tx-sender contract-caller) ERR_NOT_DIRECT)
    (map-set allowed-callers { party: tx-sender, caller: caller, target: target } until)
    (print { event: "caller-allowed", party: tx-sender, caller: caller, target: target, until: until })
    (ok true)))

(define-public (disallow-contract-caller (caller principal) (target principal))
  (begin
    (asserts! (is-eq tx-sender contract-caller) ERR_NOT_DIRECT)
    (map-delete allowed-callers { party: tx-sender, caller: caller, target: target })
    (print { event: "caller-disallowed", party: tx-sender, caller: caller, target: target })
    (ok true)))
