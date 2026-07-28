;; PerkOS sBTC Agentic Commerce
;; Job escrow for AI agents denominated in sBTC (SIP-010), settled on Bitcoin.
;;
;; Hardened successor to agentic-commerce.clar (STX). Changes beyond the token swap:
;;   - Only the evaluator can reject delivered work. A client can no longer take funds
;;     back after receiving the deliverable, and cannot be their own evaluator.
;;   - Ratings are gated: only the client or evaluator of a COMPLETED job may rate the
;;     provider, once per job, so reputation cannot be farmed by unrelated wallets.
;;   - submit-work / complete-job are refused once the job has expired, removing the
;;     race between settlement and expiry refund.
;;   - Reputation updates are non-blocking, so a reputation failure can never trap escrow.
;;   - Every state transition emits a print event for indexing.

(use-trait ft-trait .sip-010-trait.sip-010-trait)

;; ============================================
;; Constants
;; ============================================
(define-constant ERR_NOT_OWNER (err u300))
(define-constant ERR_NOT_AUTHORIZED (err u301))
(define-constant ERR_JOB_NOT_FOUND (err u302))
(define-constant ERR_INVALID_STATUS (err u303))
(define-constant ERR_JOB_EXPIRED (err u304))
(define-constant ERR_INVALID_BUDGET (err u305))
(define-constant ERR_NOT_CLIENT (err u307))
(define-constant ERR_NOT_PROVIDER (err u308))
(define-constant ERR_NOT_EVALUATOR (err u309))
(define-constant ERR_ALREADY_FUNDED (err u310))
(define-constant ERR_INVALID_TOKEN (err u311))
(define-constant ERR_INVALID_DESCRIPTION (err u312))
(define-constant ERR_INVALID_PARTY (err u313))
(define-constant ERR_ALREADY_RATED (err u314))
(define-constant ERR_INVALID_RATING (err u315))
(define-constant ERR_NOT_EXPIRED (err u316))

(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant STATUS_SUBMITTED u2)
(define-constant STATUS_COMPLETED u3)
(define-constant STATUS_REJECTED u4)
(define-constant STATUS_EXPIRED u5)

;; ============================================
;; Data vars
;; ============================================
(define-data-var contract-owner principal tx-sender)
(define-data-var job-counter uint u0)

;; The only token accepted as escrow currency. Deliberately initialised to the deployer
;; (a principal that can never pass as a token) so escrow is inert until the owner calls
;; set-payment-token with the canonical sBTC contract for the target network.
(define-data-var payment-token principal tx-sender)

;; ============================================
;; Maps
;; ============================================
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

;; One rating per (job, rater)
(define-map job-ratings { job-id: uint, rater: principal } uint)

;; ============================================
;; Private
;; ============================================
(define-private (is-owner (caller principal))
  (is-eq caller (var-get contract-owner))
)

(define-private (check-token (token <ft-trait>))
  (ok (asserts! (is-eq (contract-of token) (var-get payment-token)) ERR_INVALID_TOKEN))
)

;; Reputation is advisory: never let a failure there trap escrowed funds.
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

(define-read-only (get-payment-token)
  (ok (var-get payment-token))
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

;; ============================================
;; Admin
;; ============================================
(define-public (set-owner (new-owner principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set contract-owner new-owner)
    (ok true)
  )
)

;; Point the escrow at the canonical sBTC token for this network.
(define-public (set-payment-token (token principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set payment-token token)
    (print { event: "payment-token-set", token: token })
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
    ;; The evaluator must be a third party: a client cannot adjudicate their own job.
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

(define-public (fund-job (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
    )
    (try! (check-token token))
    (asserts! (is-eq (get status job) STATUS_OPEN) ERR_INVALID_STATUS)
    (asserts! (is-eq (get client job) tx-sender) ERR_NOT_CLIENT)
    (asserts! (> budget u0) ERR_INVALID_BUDGET)
    (asserts! (is-none (map-get? escrow-balances job-id)) ERR_ALREADY_FUNDED)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    ;; Move sBTC from the client into this contract.
    (try! (contract-call? token transfer budget tx-sender (as-contract tx-sender) none))

    (map-set escrow-balances job-id budget)
    (map-set jobs job-id (merge job { status: STATUS_FUNDED }))
    (print { event: "job-funded", job-id: job-id, amount: budget, token: (contract-of token) })
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
    ;; Keep the three roles distinct so the evaluator stays neutral.
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
    ;; Refuse work submitted after expiry: otherwise settlement races the refund.
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    (map-set jobs job-id (merge job { status: STATUS_SUBMITTED, deliverable: (some deliverable) }))
    (print { event: "work-submitted", job-id: job-id, provider: provider })
    (ok true)
  )
)

(define-public (complete-job (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
    )
    (try! (check-token token))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    ;; Release escrow to the provider.
    (try! (as-contract (contract-call? token transfer budget tx-sender provider none)))

    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_COMPLETED }))
    (record-stats provider true false)
    (print { event: "job-completed", job-id: job-id, provider: provider, amount: budget })
    (ok true)
  )
)

;; Only the evaluator may reject. The client cannot reclaim funds after delivery.
(define-public (reject-job (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (client (get client job))
    )
    (try! (check-token token))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)

    ;; Refund escrow to the client.
    (try! (as-contract (contract-call? token transfer budget tx-sender client none)))

    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_REJECTED }))
    (record-stats provider false true)
    (print { event: "job-rejected", job-id: job-id, provider: provider, amount: budget })
    (ok true)
  )
)

(define-public (expire-job (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (status (get status job))
      (client (get client job))
      (escrowed (default-to u0 (map-get? escrow-balances job-id)))
    )
    (try! (check-token token))
    (asserts! (>= block-height (get expired-at job)) ERR_NOT_EXPIRED)
    (asserts! (or (is-eq status STATUS_OPEN) (is-eq status STATUS_FUNDED)) ERR_INVALID_STATUS)

    (if (> escrowed u0)
      (begin
        (try! (as-contract (contract-call? token transfer escrowed tx-sender client none)))
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
;; Only the client or evaluator of a COMPLETED job may rate its provider, once each.
;; This is what stops unrelated wallets from farming reputation.
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
