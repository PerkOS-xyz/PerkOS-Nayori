;; nayori-reputation
;; Job outcomes and client ratings, written only by the two Nayori escrows,
;; which are fixed here. Each settled job is recorded once per escrow; only a
;; completed job can be rated, once, by its own client.

(define-constant ESCROW_SBTC .nayori-escrow-sbtc)
(define-constant ESCROW_STX .nayori-escrow-stx)

(define-constant ERR_NOT_ESCROW (err u200))
(define-constant ERR_ALREADY_RECORDED (err u201))
(define-constant ERR_NO_OUTCOME (err u202))
(define-constant ERR_NOT_RATABLE (err u203))
(define-constant ERR_ALREADY_RATED (err u204))
(define-constant ERR_INVALID_SCORE (err u205))

(define-map outcomes { source: principal, job-id: uint }
  { provider: principal, client: principal, completed: bool, value: uint, rated: bool })

(define-map provider-stats principal
  { completed: uint, rejected: uint, not-delivered: uint, completed-value-sbtc: uint, completed-value-stx: uint,
    distinct-clients: uint, rating-sum: uint, rating-count: uint })

(define-map provider-clients { provider: principal, client: principal } bool)

(define-constant EMPTY_STATS
  { completed: u0, rejected: u0, not-delivered: u0, completed-value-sbtc: u0, completed-value-stx: u0,
    distinct-clients: u0, rating-sum: u0, rating-count: u0 })

(define-read-only (get-outcome (source principal) (job-id uint))
  (map-get? outcomes { source: source, job-id: job-id }))

(define-read-only (get-provider-stats (provider principal))
  (default-to EMPTY_STATS (map-get? provider-stats provider)))

(define-private (is-escrow (caller principal))
  (or (is-eq caller ESCROW_SBTC) (is-eq caller ESCROW_STX)))

;; Called by an escrow when a job settles. Completed jobs count their value (in
;; sats or micro-STX, kept apart by escrow) and their client toward the
;; provider's aggregates.
(define-public (record-outcome (job-id uint) (provider principal) (client principal) (completed bool) (value uint))
  (let ((key { source: contract-caller, job-id: job-id })
        (stats (get-provider-stats provider))
        (new-client (and completed (is-none (map-get? provider-clients { provider: provider, client: client })))))
    (asserts! (is-escrow contract-caller) ERR_NOT_ESCROW)
    (asserts! (is-none (map-get? outcomes key)) ERR_ALREADY_RECORDED)
    (map-set outcomes key { provider: provider, client: client, completed: completed, value: value, rated: false })
    (if new-client (map-set provider-clients { provider: provider, client: client } true) false)
    (map-set provider-stats provider (merge stats {
      completed: (+ (get completed stats) (if completed u1 u0)),
      rejected: (+ (get rejected stats) (if completed u0 u1)),
      completed-value-sbtc: (+ (get completed-value-sbtc stats)
        (if (and completed (is-eq contract-caller ESCROW_SBTC)) value u0)),
      completed-value-stx: (+ (get completed-value-stx stats)
        (if (and completed (is-eq contract-caller ESCROW_STX)) value u0)),
      distinct-clients: (+ (get distinct-clients stats) (if new-client u1 u0)) }))
    (print { event: "outcome-recorded", source: contract-caller, job-id: job-id, provider: provider,
      client: client, completed: completed, value: value })
    (ok true)))

;; Called by an escrow when an accepted job is refunded without delivery.
;; Recorded once per (escrow, job).
(define-map non-deliveries { source: principal, job-id: uint } principal)

(define-public (record-non-delivery (job-id uint) (provider principal))
  (let ((key { source: contract-caller, job-id: job-id })
        (stats (get-provider-stats provider)))
    (asserts! (is-escrow contract-caller) ERR_NOT_ESCROW)
    (asserts! (is-none (map-get? non-deliveries key)) ERR_ALREADY_RECORDED)
    (map-set non-deliveries key provider)
    (map-set provider-stats provider (merge stats { not-delivered: (+ (get not-delivered stats) u1) }))
    (print { event: "non-delivery-recorded", source: contract-caller, job-id: job-id, provider: provider })
    (ok true)))

;; Called by an escrow on behalf of the job's client.
(define-public (record-rating (job-id uint) (client principal) (score uint))
  (begin
    (asserts! (is-escrow contract-caller) ERR_NOT_ESCROW)
    (let ((key { source: contract-caller, job-id: job-id })
          (outcome (unwrap! (map-get? outcomes key) ERR_NO_OUTCOME))
          (provider (get provider outcome))
          (stats (get-provider-stats provider)))
      (asserts! (and (get completed outcome) (is-eq client (get client outcome))) ERR_NOT_RATABLE)
      (asserts! (not (get rated outcome)) ERR_ALREADY_RATED)
      (asserts! (and (>= score u1) (<= score u5)) ERR_INVALID_SCORE)
      (map-set outcomes key (merge outcome { rated: true }))
      (map-set provider-stats provider (merge stats {
        rating-sum: (+ (get rating-sum stats) score),
        rating-count: (+ (get rating-count stats) u1) }))
      (print { event: "rating-recorded", source: contract-caller, job-id: job-id, provider: provider, score: score })
      (ok true))))
