;; PerkOS STX Agentic Commerce v2
;; Hardened STX-denominated job escrow for AI agents.
;;
;; IMPORTANT: the original mainnet contract is immutable. This source is the v2
;; implementation and must be deployed under a new contract name before the app
;; points production STX traffic at it.
;;
;; Security properties shared with sbtc-commerce:
;;   - client, provider and evaluator are distinct parties;
;;   - only the evaluator may accept or reject submitted work;
;;   - funding, submission and completion cannot race expiry;
;;   - reputation failures never trap escrowed STX;
;;   - ratings are job-linked, role-gated and one per rater;
;;   - every lifecycle transition emits an indexable print event.

;; ============================================
;; Constants
;; ============================================
(define-constant ERR_NOT_OWNER (err u200))
(define-constant ERR_NOT_AUTHORIZED (err u201))
(define-constant ERR_JOB_NOT_FOUND (err u202))
(define-constant ERR_INVALID_STATUS (err u203))
(define-constant ERR_JOB_EXPIRED (err u204))
(define-constant ERR_INVALID_BUDGET (err u205))
(define-constant ERR_NOT_CLIENT (err u207))
(define-constant ERR_NOT_PROVIDER (err u208))
(define-constant ERR_NOT_EVALUATOR (err u209))
(define-constant ERR_ALREADY_FUNDED (err u210))
(define-constant ERR_INVALID_DESCRIPTION (err u212))
(define-constant ERR_INVALID_PARTY (err u213))
(define-constant ERR_ALREADY_RATED (err u214))
(define-constant ERR_INVALID_RATING (err u215))
(define-constant ERR_NOT_EXPIRED (err u216))

(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant STATUS_SUBMITTED u2)
(define-constant STATUS_COMPLETED u3)
(define-constant STATUS_REJECTED u4)
(define-constant STATUS_EXPIRED u5)

;; ============================================
;; State
;; ============================================
(define-data-var contract-owner principal tx-sender)
(define-data-var job-counter uint u0)
(define-data-var current-implementation principal tx-sender)

(define-map jobs uint {
  client: principal,
  provider: (optional principal),
  evaluator: principal,
  description: (string-ascii 512),
  budget: uint,
  expired-at: uint,
  status: uint,
  deliverable: (optional (buff 64))
})

(define-map escrow-balances uint uint)
(define-map job-ratings { job-id: uint, rater: principal } uint)

;; ============================================
;; Private
;; ============================================
(define-private (is-owner (caller principal))
  (is-eq caller (var-get contract-owner))
)

;; Reputation is advisory. Escrow settlement must succeed even if the registry
;; is unavailable or this contract has not yet been allow-listed.
(define-private (record-stats (agent principal) (completed bool) (disputed bool))
  (match (as-contract (contract-call? .reputation-registry-v2 update-job-stats agent completed disputed))
    ok-value true
    err-value false
  )
)

;; ============================================
;; Read-only
;; ============================================
(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-job (job-id uint))
  (match (map-get? jobs job-id)
    job (ok job)
    ERR_JOB_NOT_FOUND
  )
)

(define-read-only (get-job-count)
  (ok (var-get job-counter))
)

(define-read-only (get-escrow-balance (job-id uint))
  (ok (default-to u0 (map-get? escrow-balances job-id)))
)

(define-read-only (has-rated-job (job-id uint) (rater principal))
  (is-some (map-get? job-ratings { job-id: job-id, rater: rater }))
)

(define-read-only (get-current-implementation)
  (ok (var-get current-implementation))
)

;; ============================================
;; Admin
;; ============================================
(define-public (set-owner (new-owner principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set contract-owner new-owner)
    (print { event: "owner-set", owner: new-owner })
    (ok true)
  )
)

;; Retained for interface compatibility. This contract does not delegate state
;; transitions, so a production migration still requires a new deployment.
(define-public (upgrade-implementation (new-impl principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set current-implementation new-impl)
    (print { event: "implementation-recorded", implementation: new-impl })
    (ok true)
  )
)

;; ============================================
;; Job lifecycle
;; ============================================
(define-public (create-job
    (provider (optional principal))
    (evaluator principal)
    (expired-at uint)
    (description (string-ascii 512))
  )
  (let
    (
      (new-id (+ (var-get job-counter) u1))
    )
    (asserts! (> expired-at block-height) ERR_JOB_EXPIRED)
    (asserts! (> (len description) u0) ERR_INVALID_DESCRIPTION)
    (asserts! (not (is-eq evaluator tx-sender)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq (some evaluator) provider)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq (some tx-sender) provider)) ERR_INVALID_PARTY)

    (map-set jobs new-id {
      client: tx-sender,
      provider: provider,
      evaluator: evaluator,
      description: description,
      budget: u0,
      expired-at: expired-at,
      status: STATUS_OPEN,
      deliverable: none
    })
    (var-set job-counter new-id)
    (print { event: "job-created", job-id: new-id, client: tx-sender, evaluator: evaluator, expired-at: expired-at })
    (ok new-id)
  )
)

(define-public (set-budget (job-id uint) (amount uint))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
    )
    (asserts! (is-eq (get status job) STATUS_OPEN) ERR_INVALID_STATUS)
    (asserts! (is-eq (get client job) tx-sender) ERR_NOT_CLIENT)
    (asserts! (> amount u0) ERR_INVALID_BUDGET)

    (map-set jobs job-id (merge job { budget: amount }))
    (print { event: "budget-set", job-id: job-id, budget: amount })
    (ok true)
  )
)

(define-public (fund-job (job-id uint))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
    )
    (asserts! (is-eq (get status job) STATUS_OPEN) ERR_INVALID_STATUS)
    (asserts! (is-eq (get client job) tx-sender) ERR_NOT_CLIENT)
    (asserts! (> budget u0) ERR_INVALID_BUDGET)
    (asserts! (is-none (map-get? escrow-balances job-id)) ERR_ALREADY_FUNDED)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    (try! (stx-transfer? budget tx-sender (as-contract tx-sender)))
    (map-set escrow-balances job-id budget)
    (map-set jobs job-id (merge job { status: STATUS_FUNDED }))
    (print { event: "job-funded", job-id: job-id, amount: budget })
    (ok true)
  )
)

(define-public (assign-provider (job-id uint) (provider principal))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
    )
    (asserts! (is-eq (get status job) STATUS_FUNDED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get client job) tx-sender) ERR_NOT_CLIENT)
    (asserts! (not (is-eq provider (get client job))) ERR_INVALID_PARTY)
    (asserts! (not (is-eq provider (get evaluator job))) ERR_INVALID_PARTY)

    (map-set jobs job-id (merge job { provider: (some provider) }))
    (print { event: "provider-assigned", job-id: job-id, provider: provider })
    (ok true)
  )
)

(define-public (submit-work (job-id uint) (deliverable (buff 64)))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
    )
    (asserts! (is-eq (get status job) STATUS_FUNDED) ERR_INVALID_STATUS)
    (asserts! (is-eq tx-sender provider) ERR_NOT_PROVIDER)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    (map-set jobs job-id (merge job { status: STATUS_SUBMITTED, deliverable: (some deliverable) }))
    (print { event: "work-submitted", job-id: job-id, provider: provider })
    (ok true)
  )
)

(define-public (complete-job (job-id uint))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
    )
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    (try! (as-contract (stx-transfer? budget tx-sender provider)))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_COMPLETED }))
    (record-stats provider true false)
    (print { event: "job-completed", job-id: job-id, provider: provider, amount: budget })
    (ok true)
  )
)

;; Only the neutral evaluator may reject delivered work. The client cannot
;; receive the deliverable and then reclaim the escrow unilaterally.
(define-public (reject-job (job-id uint))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (client (get client job))
    )
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)

    (try! (as-contract (stx-transfer? budget tx-sender client)))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_REJECTED }))
    (record-stats provider false true)
    (print { event: "job-rejected", job-id: job-id, provider: provider, amount: budget })
    (ok true)
  )
)

(define-public (expire-job (job-id uint))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (status (get status job))
      (client (get client job))
      (escrowed (default-to u0 (map-get? escrow-balances job-id)))
    )
    (asserts! (>= block-height (get expired-at job)) ERR_NOT_EXPIRED)
    (asserts! (or (is-eq status STATUS_OPEN) (is-eq status STATUS_FUNDED)) ERR_INVALID_STATUS)

    (if (> escrowed u0)
      (begin
        (try! (as-contract (stx-transfer? escrowed tx-sender client)))
        (map-delete escrow-balances job-id)
        true
      )
      true
    )

    (map-set jobs job-id (merge job { status: STATUS_EXPIRED }))
    (print { event: "job-expired", job-id: job-id, refunded: escrowed })
    (ok true)
  )
)

;; ============================================
;; Rating
;; ============================================
(define-public (rate-provider (job-id uint) (score uint) (comment (string-ascii 256)))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (rater tx-sender)
    )
    (asserts! (is-eq (get status job) STATUS_COMPLETED) ERR_INVALID_STATUS)
    (asserts! (or (is-eq rater (get client job)) (is-eq rater (get evaluator job))) ERR_NOT_AUTHORIZED)
    (asserts! (and (>= score u1) (<= score u5)) ERR_INVALID_RATING)
    (asserts! (is-none (map-get? job-ratings { job-id: job-id, rater: rater })) ERR_ALREADY_RATED)

    (map-set job-ratings { job-id: job-id, rater: rater } score)
    (try! (as-contract (contract-call? .reputation-registry-v2 submit-rating provider rater score job-id comment)))
    (print { event: "provider-rated", job-id: job-id, provider: provider, rater: rater, score: score })
    (ok true)
  )
)
