;; Nayori sBTC Agentic Commerce v2
;; Versioned SIP-010 escrow with Bitcoin-height review liveness and per-job token pinning.

(use-trait ft-trait .sip-010-trait.sip-010-trait)

;; ============================================
;; Constants
;; ============================================
(define-constant ERR_NOT_OWNER (err u700))
(define-constant ERR_NOT_AUTHORIZED (err u701))
(define-constant ERR_JOB_NOT_FOUND (err u702))
(define-constant ERR_INVALID_STATUS (err u703))
(define-constant ERR_JOB_EXPIRED (err u704))
(define-constant ERR_INVALID_BUDGET (err u705))
(define-constant ERR_NOT_CLIENT (err u707))
(define-constant ERR_NOT_PROVIDER (err u708))
(define-constant ERR_NOT_EVALUATOR (err u709))
(define-constant ERR_ALREADY_FUNDED (err u710))
(define-constant ERR_INVALID_TOKEN (err u711))
(define-constant ERR_INVALID_DESCRIPTION (err u712))
(define-constant ERR_INVALID_PARTY (err u713))
(define-constant ERR_ALREADY_RATED (err u714))
(define-constant ERR_INVALID_RATING (err u715))
(define-constant ERR_NOT_EXPIRED (err u716))
(define-constant ERR_REVIEW_WINDOW_CLOSED (err u717))
(define-constant ERR_TIMEOUT_TOO_EARLY (err u718))
(define-constant ERR_REVIEW_DEADLINE_MISSING (err u719))
(define-constant ERR_NO_PENDING_OWNER (err u720))
(define-constant ERR_NOT_PENDING_OWNER (err u721))
(define-constant ERR_INVALID_OWNER (err u722))
(define-constant ERR_REPUTATION_NOT_PENDING (err u723))
(define-constant ERR_JOB_TOKEN_MISSING (err u724))

(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant STATUS_SUBMITTED u2)
(define-constant STATUS_COMPLETED u3)
(define-constant STATUS_REJECTED u4)
(define-constant STATUS_EXPIRED u5)
(define-constant STATUS_TIMEOUT_PAID u6)

(define-constant OUTCOME_COMPLETED u1)
(define-constant OUTCOME_DISPUTED u2)
(define-constant REVIEW_WINDOW_BURN_BLOCKS u144)

;; ============================================
;; State
;; ============================================
(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var job-counter uint u0)

;; Default for future funding only. Every funded job pins its own token.
(define-data-var payment-token principal tx-sender)

(define-map jobs uint {
  client: principal,
  provider: (optional principal),
  evaluator: principal,
  description: (string-ascii 512),
  budget: uint,
  expired-at: uint,
  status: uint,
  deliverable: (optional (buff 64)),
  submitted-at-burn: (optional uint),
  review-deadline: (optional uint)
})

(define-map escrow-balances uint uint)
(define-map job-payment-tokens uint principal)
(define-map job-ratings { job-id: uint, rater: principal } uint)
(define-map reputation-sync uint { outcome: uint, pending: bool, last-error: uint })

;; ============================================
;; Private
;; ============================================
(define-private (is-owner (caller principal))
  (is-eq caller (var-get contract-owner))
)

(define-private (check-default-token (token <ft-trait>))
  (ok (asserts! (is-eq (contract-of token) (var-get payment-token)) ERR_INVALID_TOKEN))
)

(define-private (check-job-token (job-id uint) (token <ft-trait>))
  (let
    (
      (pinned-token (unwrap! (map-get? job-payment-tokens job-id) ERR_JOB_TOKEN_MISSING))
    )
    (ok (asserts! (is-eq (contract-of token) pinned-token) ERR_INVALID_TOKEN))
  )
)

(define-private (sync-reputation (job-id uint) (agent principal) (outcome uint))
  (let
    (
      (completed (is-eq outcome OUTCOME_COMPLETED))
      (disputed (is-eq outcome OUTCOME_DISPUTED))
    )
    (match (as-contract (contract-call?
        .reputation-registry-v3
        record-job-outcome
        agent
        job-id
        completed
        disputed
      ))
      ok-value
        (begin
          (map-set reputation-sync job-id { outcome: outcome, pending: false, last-error: u0 })
          (print { event: "reputation-sync-completed", job-id: job-id, outcome: outcome })
          true
        )
      err-value
        (begin
          (map-set reputation-sync job-id { outcome: outcome, pending: true, last-error: err-value })
          (print { event: "reputation-sync-pending", job-id: job-id, outcome: outcome, error: err-value })
          false
        )
    )
  )
)

;; ============================================
;; Read-only
;; ============================================
(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-pending-owner)
  (ok (var-get pending-owner))
)

(define-read-only (get-payment-token)
  (ok (var-get payment-token))
)

(define-read-only (get-job-payment-token (job-id uint))
  (match (map-get? job-payment-tokens job-id)
    token (ok token)
    ERR_JOB_TOKEN_MISSING
  )
)

(define-read-only (get-review-window)
  (ok REVIEW_WINDOW_BURN_BLOCKS)
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

(define-read-only (get-reputation-sync (job-id uint))
  (match (map-get? reputation-sync job-id)
    state (ok state)
    ERR_REPUTATION_NOT_PENDING
  )
)

;; ============================================
;; Two-step ownership and token administration
;; ============================================
(define-public (propose-owner (new-owner principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR_INVALID_OWNER)
    (var-set pending-owner (some new-owner))
    (print { event: "owner-proposed", owner: (var-get contract-owner), pending-owner: new-owner })
    (ok true)
  )
)

(define-public (accept-owner)
  (let
    (
      (previous-owner (var-get contract-owner))
      (candidate (unwrap! (var-get pending-owner) ERR_NO_PENDING_OWNER))
    )
    (asserts! (is-eq tx-sender candidate) ERR_NOT_PENDING_OWNER)
    (var-set contract-owner candidate)
    (var-set pending-owner none)
    (print { event: "owner-accepted", previous-owner: previous-owner, owner: candidate })
    (ok true)
  )
)

(define-public (cancel-owner-proposal)
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set pending-owner none)
    (print { event: "owner-proposal-cancelled", owner: tx-sender })
    (ok true)
  )
)

(define-public (set-payment-token (token principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set payment-token token)
    (print { event: "payment-token-default-set", token: token })
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
      deliverable: none,
      submitted-at-burn: none,
      review-deadline: none
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
      (token-principal (contract-of token))
    )
    (try! (check-default-token token))
    (asserts! (is-eq (get status job) STATUS_OPEN) ERR_INVALID_STATUS)
    (asserts! (is-eq (get client job) tx-sender) ERR_NOT_CLIENT)
    (asserts! (> budget u0) ERR_INVALID_BUDGET)
    (asserts! (is-none (map-get? escrow-balances job-id)) ERR_ALREADY_FUNDED)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    (try! (contract-call? token transfer budget tx-sender (as-contract tx-sender) none))
    (map-set escrow-balances job-id budget)
    (map-set job-payment-tokens job-id token-principal)
    (map-set jobs job-id (merge job { status: STATUS_FUNDED }))
    (print { event: "job-funded", job-id: job-id, amount: budget, token: token-principal })
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
      (review-deadline (+ burn-block-height REVIEW_WINDOW_BURN_BLOCKS))
    )
    (asserts! (is-eq (get status job) STATUS_FUNDED) ERR_INVALID_STATUS)
    (asserts! (is-eq tx-sender provider) ERR_NOT_PROVIDER)
    (asserts! (< block-height (get expired-at job)) ERR_JOB_EXPIRED)

    (map-set jobs job-id (merge job {
      status: STATUS_SUBMITTED,
      deliverable: (some deliverable),
      submitted-at-burn: (some burn-block-height),
      review-deadline: (some review-deadline)
    }))
    (print {
      event: "work-submitted",
      job-id: job-id,
      provider: provider,
      submitted-at-burn: burn-block-height,
      review-deadline: review-deadline
    })
    (ok true)
  )
)

(define-public (complete-job (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (review-deadline (unwrap! (get review-deadline job) ERR_REVIEW_DEADLINE_MISSING))
    )
    (try! (check-job-token job-id token))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)
    (asserts! (<= burn-block-height review-deadline) ERR_REVIEW_WINDOW_CLOSED)

    (try! (as-contract (contract-call? token transfer budget tx-sender provider none)))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_COMPLETED }))
    (sync-reputation job-id provider OUTCOME_COMPLETED)
    (print { event: "job-completed", job-id: job-id, provider: provider, amount: budget, status: STATUS_COMPLETED })
    (ok true)
  )
)

(define-public (reject-job (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (client (get client job))
      (review-deadline (unwrap! (get review-deadline job) ERR_REVIEW_DEADLINE_MISSING))
    )
    (try! (check-job-token job-id token))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)
    (asserts! (<= burn-block-height review-deadline) ERR_REVIEW_WINDOW_CLOSED)

    (try! (as-contract (contract-call? token transfer budget tx-sender client none)))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_REJECTED }))
    (sync-reputation job-id provider OUTCOME_DISPUTED)
    (print { event: "job-rejected", job-id: job-id, provider: provider, amount: budget, status: STATUS_REJECTED })
    (ok true)
  )
)

(define-public (settle-review-timeout (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (review-deadline (unwrap! (get review-deadline job) ERR_REVIEW_DEADLINE_MISSING))
    )
    (try! (check-job-token job-id token))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (> burn-block-height review-deadline) ERR_TIMEOUT_TOO_EARLY)

    (try! (as-contract (contract-call? token transfer budget tx-sender provider none)))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_TIMEOUT_PAID }))
    (print {
      event: "review-timeout-paid",
      job-id: job-id,
      provider: provider,
      caller: tx-sender,
      amount: budget,
      status: STATUS_TIMEOUT_PAID
    })
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
    (asserts! (>= block-height (get expired-at job)) ERR_NOT_EXPIRED)
    (asserts! (or (is-eq status STATUS_OPEN) (is-eq status STATUS_FUNDED)) ERR_INVALID_STATUS)

    (if (> escrowed u0)
      (begin
        ;; OPEN jobs have no pinned payment token yet. Only funded jobs need
        ;; to authenticate the token contract before returning escrow.
        (try! (check-job-token job-id token))
        (try! (as-contract (contract-call? token transfer escrowed tx-sender client none)))
        (map-delete escrow-balances job-id)
        true
      )
      true
    )
    (map-set jobs job-id (merge job { status: STATUS_EXPIRED }))
    (print { event: "job-expired", job-id: job-id, refunded: escrowed, status: STATUS_EXPIRED })
    (ok true)
  )
)

;; ============================================
;; Reputation
;; ============================================
(define-public (retry-reputation-sync (job-id uint))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (sync-state (unwrap! (map-get? reputation-sync job-id) ERR_REPUTATION_NOT_PENDING))
    )
    (asserts! (get pending sync-state) ERR_REPUTATION_NOT_PENDING)
    (asserts! (or
      (is-eq (get status job) STATUS_COMPLETED)
      (is-eq (get status job) STATUS_REJECTED)
    ) ERR_INVALID_STATUS)
    (ok (sync-reputation job-id provider (get outcome sync-state)))
  )
)

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
    (try! (as-contract (contract-call?
      .reputation-registry-v3
      submit-rating
      provider
      rater
      score
      job-id
      comment
    )))
    (print { event: "provider-rated", job-id: job-id, provider: provider, rater: rater, score: score })
    (ok true)
  )
)
