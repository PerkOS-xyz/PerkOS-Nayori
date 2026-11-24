;; nayori-roles
;; Holds the two roles the escrows still need: the service treasury and the
;; appeal authority. There is no owner. Handovers are always direct calls by
;; the holder or the candidate (no delegation). Only the current holder of a
;; role can propose its successor; the successor accepts after HANDOVER_DELAY
;; Bitcoin blocks, and the holder can cancel at any time until acceptance. The two roles are never the
;; same principal. Escrows read both roles when a job is created and pin them.

;; Deployment values. On mainnet these are the Leather multisig vaults.
(define-constant INITIAL_TREASURY 'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND)
(define-constant INITIAL_APPEAL_AUTHORITY 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB)

(define-constant ROLE_TREASURY u1)
(define-constant ROLE_APPEAL_AUTHORITY u2)
(define-constant HANDOVER_DELAY u144)

(define-constant ERR_INVALID_ROLE (err u100))
(define-constant ERR_NOT_HOLDER (err u101))
(define-constant ERR_INVALID_CANDIDATE (err u102))
(define-constant ERR_NO_HANDOVER (err u103))
(define-constant ERR_NOT_CANDIDATE (err u104))
(define-constant ERR_TOO_EARLY (err u105))

(define-data-var treasury principal INITIAL_TREASURY)
(define-data-var appeal-authority principal INITIAL_APPEAL_AUTHORITY)
(define-map handovers uint { candidate: principal, ready-at: uint })

(define-read-only (get-treasury)
  (var-get treasury))

(define-read-only (get-appeal-authority)
  (var-get appeal-authority))

(define-read-only (get-handover (role uint))
  (map-get? handovers role))

(define-private (holder-of (role uint))
  (if (is-eq role ROLE_TREASURY) (var-get treasury) (var-get appeal-authority)))

(define-private (other-holder (role uint))
  (if (is-eq role ROLE_TREASURY) (var-get appeal-authority) (var-get treasury)))

(define-private (acts-for (party principal))
  (and (is-eq tx-sender party) (is-eq contract-caller party)))

(define-private (valid-role (role uint))
  (or (is-eq role ROLE_TREASURY) (is-eq role ROLE_APPEAL_AUTHORITY)))

(define-public (propose-handover (role uint) (candidate principal))
  (begin
    (asserts! (valid-role role) ERR_INVALID_ROLE)
    (asserts! (acts-for (holder-of role)) ERR_NOT_HOLDER)
    (asserts! (not (is-eq candidate (holder-of role))) ERR_INVALID_CANDIDATE)
    (asserts! (not (is-eq candidate (other-holder role))) ERR_INVALID_CANDIDATE)
    (map-set handovers role { candidate: candidate, ready-at: (+ burn-block-height HANDOVER_DELAY) })
    (print { event: "role-handover-proposed", role: role, holder: tx-sender, candidate: candidate,
      ready-at: (+ burn-block-height HANDOVER_DELAY) })
    (ok true)))

(define-public (cancel-handover (role uint))
  (begin
    (asserts! (valid-role role) ERR_INVALID_ROLE)
    (asserts! (acts-for (holder-of role)) ERR_NOT_HOLDER)
    (asserts! (is-some (map-get? handovers role)) ERR_NO_HANDOVER)
    (map-delete handovers role)
    (print { event: "role-handover-cancelled", role: role, holder: tx-sender })
    (ok true)))

(define-public (accept-handover (role uint))
  (let ((handover (unwrap! (map-get? handovers role) ERR_NO_HANDOVER))
        (candidate (get candidate handover)))
    (asserts! (acts-for candidate) ERR_NOT_CANDIDATE)
    (asserts! (>= burn-block-height (get ready-at handover)) ERR_TOO_EARLY)
    ;; The other role may have changed while this handover waited.
    (asserts! (not (is-eq candidate (other-holder role))) ERR_INVALID_CANDIDATE)
    (if (is-eq role ROLE_TREASURY)
      (var-set treasury candidate)
      (var-set appeal-authority candidate))
    (map-delete handovers role)
    (print { event: "role-handover-accepted", role: role, holder: candidate })
    (ok true)))

;; Deployment guard: the two values must differ and both must be standard
;; principals of the network being deployed to (is-standard), so testnet
;; addresses can never reach mainnet. Aborting the deployment is intended.
;; #[allow(panic)]
(unwrap-panic (if (and (not (is-eq INITIAL_TREASURY INITIAL_APPEAL_AUTHORITY))
                       (is-standard INITIAL_TREASURY)
                       (is-standard INITIAL_APPEAL_AUTHORITY))
  (ok true)
  (err u0)))
