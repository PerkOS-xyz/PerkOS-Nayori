;; Nayori sBTC Agentic Commerce v5 - 2% earned service fee candidate
;; Autonomous evaluator decisions, appeals and per-job SIP-010 token pinning.

(use-trait ft-trait .sip-010-trait.sip-010-trait)

;; ============================================
;; Constants
;; ============================================
(define-constant ERR_NOT_OWNER (err u900))
(define-constant ERR_NOT_AUTHORIZED (err u901))
(define-constant ERR_JOB_NOT_FOUND (err u902))
(define-constant ERR_INVALID_STATUS (err u903))
(define-constant ERR_JOB_EXPIRED (err u904))
(define-constant ERR_INVALID_BUDGET (err u905))
(define-constant ERR_NOT_CLIENT (err u907))
(define-constant ERR_NOT_PROVIDER (err u908))
(define-constant ERR_NOT_EVALUATOR (err u909))
(define-constant ERR_ALREADY_FUNDED (err u910))
(define-constant ERR_INVALID_TOKEN (err u911))
(define-constant ERR_INVALID_DESCRIPTION (err u912))
(define-constant ERR_INVALID_PARTY (err u913))
(define-constant ERR_ALREADY_RATED (err u914))
(define-constant ERR_INVALID_RATING (err u915))
(define-constant ERR_NOT_EXPIRED (err u916))
(define-constant ERR_REVIEW_WINDOW_CLOSED (err u917))
(define-constant ERR_TIMEOUT_TOO_EARLY (err u918))
(define-constant ERR_REVIEW_DEADLINE_MISSING (err u919))
(define-constant ERR_NO_PENDING_OWNER (err u920))
(define-constant ERR_NOT_PENDING_OWNER (err u921))
(define-constant ERR_INVALID_OWNER (err u922))
(define-constant ERR_REPUTATION_NOT_PENDING (err u923))
(define-constant ERR_JOB_TOKEN_MISSING (err u924))
(define-constant ERR_NOT_CONFIGURED (err u925))
(define-constant ERR_ALREADY_CONFIGURED (err u926))
(define-constant ERR_INVALID_APPEAL_WINDOW (err u927))
(define-constant ERR_INVALID_APPEAL_AUTHORITY (err u928))
(define-constant ERR_INVALID_DECISION (err u929))
(define-constant ERR_DECISION_NOT_FOUND (err u930))
(define-constant ERR_NOT_APPELLANT (err u931))
(define-constant ERR_APPEAL_WINDOW_CLOSED (err u932))
(define-constant ERR_FINALIZE_TOO_EARLY (err u933))
(define-constant ERR_NOT_APPEAL_AUTHORITY (err u934))
(define-constant ERR_INVALID_EVIDENCE_HASH (err u935))
(define-constant ERR_APPEAL_RESOLUTION_CLOSED (err u936))
(define-constant ERR_APPEAL_RESOLUTION_TOO_EARLY (err u937))
(define-constant ERR_RESOLUTION_DEADLINE_MISSING (err u938))
(define-constant ERR_NO_PENDING_APPEAL_AUTHORITY (err u939))
(define-constant ERR_NOT_PENDING_APPEAL_AUTHORITY (err u940))

(define-constant ERR_INVALID_TREASURY (err u941))
(define-constant ERR_SERVICE_FEE_NOT_SETTLED (err u942))
(define-constant ERR_SERVICE_FEE_NOT_WAIVED (err u943))
(define-constant ERR_SERVICE_FEE_NOT_REFUNDABLE (err u944))
(define-constant ERR_NOT_TREASURY (err u945))
(define-constant ERR_SERVICE_FEE_ALREADY_WAIVED (err u946))
(define-constant ERR_ESCROW_MISMATCH (err u947))
(define-constant ERR_TOKEN_TRANSFER_FAILED (err u948))

(define-constant SERVICE_FEE_BPS u200)
(define-constant SERVICE_FEE_DIVISOR u50)

(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant STATUS_SUBMITTED u2)
(define-constant STATUS_COMPLETED u3)
(define-constant STATUS_REJECTED u4)
(define-constant STATUS_EXPIRED u5)
(define-constant STATUS_TIMEOUT_PAID u6)
(define-constant STATUS_DECISION_PENDING u7)
(define-constant STATUS_DISPUTED u8)

(define-constant DECISION_APPROVE u1)
(define-constant DECISION_REJECT u2)
(define-constant OUTCOME_COMPLETED u1)
(define-constant OUTCOME_DISPUTED u2)
(define-constant REVIEW_WINDOW_BURN_BLOCKS u12)
(define-constant QA_APPEAL_WINDOW_BURN_BLOCKS u3)
(define-constant MAINNET_APPEAL_WINDOW_BURN_BLOCKS u144)
(define-constant ZERO_HASH_32 0x0000000000000000000000000000000000000000000000000000000000000000)

;; ============================================
;; State
;; ============================================
(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)
(define-data-var protocol-configured bool false)
(define-data-var appeal-window-burn-blocks uint u0)
(define-data-var appeal-authority principal tx-sender)
(define-data-var pending-appeal-authority (optional principal) none)
(define-data-var job-counter uint u0)
;; Set exactly once by initialize-protocol, never a live implicit deployer recipient.
(define-data-var service-treasury principal tx-sender)

;; Default for future funding only. Every funded job pins its own token.
(define-data-var payment-token principal tx-sender)

(define-map jobs uint {
  client: principal,
  provider: (optional principal),
  evaluator: principal,
  appeal-authority: principal,
  treasury: principal,
  description: (string-ascii 512),
  budget: uint,
  expired-at: uint,
  status: uint,
  deliverable: (optional (buff 64)),
  submitted-at-burn: (optional uint),
  review-deadline: (optional uint)
})

(define-map decisions uint {
  original-decision: uint,
  final-decision: (optional uint),
  evidence-hash: (buff 32),
  explanation-hash: (buff 32),
  decided-at-burn: uint,
  appeal-deadline: uint,
  appealed-by: (optional principal),
  appeal-evidence-hash: (optional (buff 32)),
  resolution-deadline: (optional uint),
  resolution-hash: (optional (buff 32)),
  finalized-by: (optional principal),
  finalized-at-burn: (optional uint)
})

;; A waiver is irrevocable and controlled only by the job-pinned appeal authority.
(define-map service-fee-waivers uint (buff 32))
(define-map service-fee-settlements uint {
  gross: uint,
  recipient: principal,
  net: uint,
  charged-fee: uint,
  refunded-fee: uint
})

(define-map escrow-balances uint uint)
(define-map job-payment-tokens uint principal)
(define-map job-ratings { job-id: uint, rater: principal } uint)
(define-map reputation-sync uint { outcome: uint, pending: bool, last-error: uint })

;; ============================================
;; Private helpers
;; ============================================
(define-private (is-owner (caller principal))
  (is-eq caller (var-get contract-owner))
)

(define-private (is-valid-decision (decision uint))
  (or (is-eq decision DECISION_APPROVE) (is-eq decision DECISION_REJECT))
)

(define-private (is-valid-hash (value (buff 32)))
  (and (is-eq (len value) u32) (not (is-eq value ZERO_HASH_32)))
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

;; Only a recorded decision earns the service fee. Rejection has the same fee as approval.
;; Both transfers and the ledger write roll back if either transfer fails.
(define-private (settle-service-payment (job-id uint) (recipient principal) (token <ft-trait>))
  (let (
    (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
    (gross (get budget job))
    (treasury (get treasury job))
    (fee (if (is-some (map-get? service-fee-waivers job-id)) u0 (/ gross SERVICE_FEE_DIVISOR)))
    (net (- gross fee))
  )
    (asserts! (is-some (map-get? decisions job-id)) ERR_DECISION_NOT_FOUND)
    (asserts! (and (> gross u0) (is-eq gross (default-to u0 (map-get? escrow-balances job-id)))) ERR_ESCROW_MISMATCH)
    (asserts! (is-none (map-get? service-fee-settlements job-id)) ERR_INVALID_STATUS)
    (asserts! (not (is-eq treasury recipient)) ERR_INVALID_TREASURY)
    (asserts! (try! (as-contract (contract-call? token transfer net tx-sender recipient none))) ERR_TOKEN_TRANSFER_FAILED)
    (if (> fee u0)
      (begin (asserts! (try! (as-contract (contract-call? token transfer fee tx-sender treasury none))) ERR_TOKEN_TRANSFER_FAILED) true)
      true)
    (map-set service-fee-settlements job-id {
      gross: gross, recipient: recipient, net: net, charged-fee: fee, refunded-fee: u0
    })
    (print { event: "service-fee-settled", job-id: job-id,
      gross: gross, recipient: recipient, net: net, treasury: treasury, fee: fee })
    (ok true)
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

(define-read-only (get-protocol-config)
  (ok {
    configured: (var-get protocol-configured),
    service-fee-bps: SERVICE_FEE_BPS,
    treasury: (var-get service-treasury),
    review-window: REVIEW_WINDOW_BURN_BLOCKS,
    appeal-window: (var-get appeal-window-burn-blocks),
    appeal-authority: (var-get appeal-authority)
  })
)

(define-read-only (get-appeal-authority)
  (ok (var-get appeal-authority))
)

(define-read-only (get-pending-appeal-authority)
  (ok (var-get pending-appeal-authority))
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

(define-read-only (get-appeal-window)
  (ok (var-get appeal-window-burn-blocks))
)

(define-read-only (get-job (job-id uint))
  (match (map-get? jobs job-id)
    job (ok job)
    ERR_JOB_NOT_FOUND
  )
)

(define-read-only (get-decision (job-id uint))
  (match (map-get? decisions job-id)
    decision (ok decision)
    ERR_DECISION_NOT_FOUND
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
;; One-time protocol configuration
;; ============================================
;; Read this policy before accepting/funding; fee-amount is a quote, not revenue.
(define-read-only (get-service-fee-for-amount (gross uint))
  (ok { gross: gross, fee: (/ gross SERVICE_FEE_DIVISOR),
    net: (- gross (/ gross SERVICE_FEE_DIVISOR)), basis-points: SERVICE_FEE_BPS })
)

(define-read-only (get-job-service-fee (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND)))
    (ok {
      basis-points: SERVICE_FEE_BPS,
      treasury: (get treasury job),
      fee-amount: (/ (get budget job) SERVICE_FEE_DIVISOR),
      service-recorded: (is-some (map-get? decisions job-id)),
      waiver: (map-get? service-fee-waivers job-id),
      settlement: (map-get? service-fee-settlements job-id)
    })
  )
)

;; No money moves here. A waiver before settlement gives the economic recipient 100%.
;; After settlement it records an outstanding treasury obligation, not a fictitious refund.
(define-public (waive-service-fee (job-id uint) (evidence-hash (buff 32)))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND)))
    (asserts! (is-eq tx-sender (get appeal-authority job)) ERR_NOT_APPEAL_AUTHORITY)
    (asserts! (is-valid-hash evidence-hash) ERR_INVALID_EVIDENCE_HASH)
    (asserts! (is-some (map-get? decisions job-id)) ERR_DECISION_NOT_FOUND)
    (asserts! (is-none (map-get? service-fee-waivers job-id)) ERR_SERVICE_FEE_ALREADY_WAIVED)
    (map-set service-fee-waivers job-id evidence-hash)
    (print { event: "service-fee-waived", job-id: job-id, authority: tx-sender, evidence-hash: evidence-hash })
    (ok true)
  )
)

;; The pinned treasury must authorize a real transfer from its own balance.
;; Refund the party that bore the fee: provider on approval, client on rejection.
(define-public (refund-service-fee (job-id uint) (token <ft-trait>))
  (let (
    (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
    (settlement (unwrap! (map-get? service-fee-settlements job-id) ERR_SERVICE_FEE_NOT_SETTLED))
    (amount (- (get charged-fee settlement) (get refunded-fee settlement)))
    (recipient (get recipient settlement))
  )
    (asserts! (is-eq tx-sender (get treasury job)) ERR_NOT_TREASURY)
    (asserts! (is-some (map-get? service-fee-waivers job-id)) ERR_SERVICE_FEE_NOT_WAIVED)
    (asserts! (> amount u0) ERR_SERVICE_FEE_NOT_REFUNDABLE)
    (try! (check-job-token job-id token))
    (asserts! (try! (contract-call? token transfer amount tx-sender recipient none)) ERR_TOKEN_TRANSFER_FAILED)
    (map-set service-fee-settlements job-id (merge settlement { refunded-fee: (get charged-fee settlement) }))
    (print { event: "service-fee-refunded", job-id: job-id, treasury: tx-sender,
      recipient: recipient, amount: amount })
    (ok true)
  )
)

(define-public (initialize-protocol (appeal-window uint) (new-appeal-authority principal) (treasury principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (asserts! (not (var-get protocol-configured)) ERR_ALREADY_CONFIGURED)
    (asserts! (is-eq (var-get job-counter) u0) ERR_INVALID_STATUS)
    (asserts! (or
      (is-eq appeal-window QA_APPEAL_WINDOW_BURN_BLOCKS)
      (is-eq appeal-window MAINNET_APPEAL_WINDOW_BURN_BLOCKS)
    ) ERR_INVALID_APPEAL_WINDOW)
    (asserts! (not (is-eq new-appeal-authority tx-sender)) ERR_INVALID_APPEAL_AUTHORITY)
    (asserts! (and
      (not (is-eq treasury tx-sender))
      (not (is-eq treasury (as-contract tx-sender)))
      (not (is-eq treasury new-appeal-authority))
    ) ERR_INVALID_TREASURY)
    (var-set service-treasury treasury)
    (var-set appeal-window-burn-blocks appeal-window)
    (var-set appeal-authority new-appeal-authority)
    (var-set protocol-configured true)
    (print {
      event: "protocol-initialized",
      treasury: treasury,
      service-fee-bps: SERVICE_FEE_BPS,
      appeal-window: appeal-window,
      appeal-authority: new-appeal-authority
    })
    (ok true)
  )
)

;; ============================================
;; Two-step ownership, appeal authority and token administration
;; ============================================
(define-public (propose-owner (new-owner principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR_INVALID_OWNER)
    (asserts! (not (is-eq new-owner (var-get appeal-authority))) ERR_INVALID_OWNER)
    (asserts! (not (is-eq new-owner (var-get service-treasury))) ERR_INVALID_OWNER)
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
    (asserts! (not (is-eq candidate (var-get appeal-authority))) ERR_INVALID_OWNER)
    (asserts! (not (is-eq candidate (var-get service-treasury))) ERR_INVALID_OWNER)
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

(define-public (propose-appeal-authority (new-authority principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (asserts! (var-get protocol-configured) ERR_NOT_CONFIGURED)
    (asserts! (not (is-eq new-authority (var-get contract-owner))) ERR_INVALID_APPEAL_AUTHORITY)
    (asserts! (not (is-eq new-authority (var-get appeal-authority))) ERR_INVALID_APPEAL_AUTHORITY)
    (asserts! (not (is-eq new-authority (var-get service-treasury))) ERR_INVALID_APPEAL_AUTHORITY)
    (var-set pending-appeal-authority (some new-authority))
    (print {
      event: "appeal-authority-proposed",
      appeal-authority: (var-get appeal-authority),
      pending-appeal-authority: new-authority
    })
    (ok true)
  )
)

(define-public (accept-appeal-authority)
  (let
    (
      (previous-authority (var-get appeal-authority))
      (candidate (unwrap! (var-get pending-appeal-authority) ERR_NO_PENDING_APPEAL_AUTHORITY))
    )
    (asserts! (is-eq tx-sender candidate) ERR_NOT_PENDING_APPEAL_AUTHORITY)
    (asserts! (not (is-eq candidate (var-get contract-owner))) ERR_INVALID_APPEAL_AUTHORITY)
    (asserts! (not (is-eq candidate (var-get service-treasury))) ERR_INVALID_APPEAL_AUTHORITY)
    (var-set appeal-authority candidate)
    (var-set pending-appeal-authority none)
    (print {
      event: "appeal-authority-accepted",
      previous-appeal-authority: previous-authority,
      appeal-authority: candidate
    })
    (ok true)
  )
)

(define-public (cancel-appeal-authority-proposal)
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (var-set pending-appeal-authority none)
    (print { event: "appeal-authority-proposal-cancelled", owner: tx-sender })
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
      (current-appeal-authority (var-get appeal-authority))
    )
    (asserts! (var-get protocol-configured) ERR_NOT_CONFIGURED)
    (asserts! (> expired-at block-height) ERR_JOB_EXPIRED)
    (asserts! (> (len description) u0) ERR_INVALID_DESCRIPTION)
    (asserts! (not (is-eq evaluator tx-sender)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq evaluator current-appeal-authority)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq tx-sender current-appeal-authority)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq (some evaluator) provider)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq (some tx-sender) provider)) ERR_INVALID_PARTY)
    (asserts! (not (is-eq (some current-appeal-authority) provider)) ERR_INVALID_PARTY)

    (asserts! (and
      (not (is-eq tx-sender (var-get service-treasury)))
      (not (is-eq evaluator (var-get service-treasury)))
      (not (is-eq provider (some (var-get service-treasury))))
    ) ERR_INVALID_PARTY)
    (map-set jobs new-id {
      client: tx-sender,
      provider: provider,
      evaluator: evaluator,
      appeal-authority: current-appeal-authority,
      treasury: (var-get service-treasury),
      description: description,
      budget: u0,
      expired-at: expired-at,
      status: STATUS_OPEN,
      deliverable: none,
      submitted-at-burn: none,
      review-deadline: none
    })
    (var-set job-counter new-id)
    (print {
      event: "job-created",
      job-id: new-id,
      client: tx-sender,
      evaluator: evaluator,
      appeal-authority: current-appeal-authority,
      treasury: (var-get service-treasury),
      expired-at: expired-at
    })
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

    (asserts! (try! (contract-call? token transfer budget tx-sender (as-contract tx-sender) none)) ERR_TOKEN_TRANSFER_FAILED)
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
    (asserts! (not (is-eq provider (get appeal-authority job))) ERR_INVALID_PARTY)
    (asserts! (not (is-eq provider (get treasury job))) ERR_INVALID_PARTY)
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

(define-public (record-decision
    (job-id uint)
    (decision uint)
    (evidence-hash (buff 32))
    (explanation-hash (buff 32))
  )
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (review-deadline (unwrap! (get review-deadline job) ERR_REVIEW_DEADLINE_MISSING))
      (appeal-deadline (+ burn-block-height (var-get appeal-window-burn-blocks)))
    )
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (is-eq (get evaluator job) tx-sender) ERR_NOT_EVALUATOR)
    (asserts! (<= burn-block-height review-deadline) ERR_REVIEW_WINDOW_CLOSED)
    (asserts! (is-valid-decision decision) ERR_INVALID_DECISION)
    (asserts! (is-valid-hash evidence-hash) ERR_INVALID_EVIDENCE_HASH)
    (asserts! (is-valid-hash explanation-hash) ERR_INVALID_EVIDENCE_HASH)

    (map-set decisions job-id {
      original-decision: decision,
      final-decision: none,
      evidence-hash: evidence-hash,
      explanation-hash: explanation-hash,
      decided-at-burn: burn-block-height,
      appeal-deadline: appeal-deadline,
      appealed-by: none,
      appeal-evidence-hash: none,
      resolution-deadline: none,
      resolution-hash: none,
      finalized-by: none,
      finalized-at-burn: none
    })
    (map-set jobs job-id (merge job { status: STATUS_DECISION_PENDING }))
    (print {
      event: "decision-recorded",
      job-id: job-id,
      decision: decision,
      evaluator: tx-sender,
      evidence-hash: evidence-hash,
      explanation-hash: explanation-hash,
      appeal-deadline: appeal-deadline,
      status: STATUS_DECISION_PENDING
    })
    (ok true)
  )
)

(define-public (appeal-decision (job-id uint) (appeal-evidence-hash (buff 32)))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (decision-state (unwrap! (map-get? decisions job-id) ERR_DECISION_NOT_FOUND))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (original-decision (get original-decision decision-state))
      (resolution-deadline (+ burn-block-height (var-get appeal-window-burn-blocks)))
    )
    (asserts! (is-eq (get status job) STATUS_DECISION_PENDING) ERR_INVALID_STATUS)
    (asserts! (<= burn-block-height (get appeal-deadline decision-state)) ERR_APPEAL_WINDOW_CLOSED)
    (asserts! (is-valid-hash appeal-evidence-hash) ERR_INVALID_EVIDENCE_HASH)
    (asserts! (if (is-eq original-decision DECISION_APPROVE)
      (is-eq tx-sender (get client job))
      (is-eq tx-sender provider)
    ) ERR_NOT_APPELLANT)

    (map-set decisions job-id (merge decision-state {
      appealed-by: (some tx-sender),
      appeal-evidence-hash: (some appeal-evidence-hash),
      resolution-deadline: (some resolution-deadline)
    }))
    (map-set jobs job-id (merge job { status: STATUS_DISPUTED }))
    (print {
      event: "decision-appealed",
      job-id: job-id,
      original-decision: original-decision,
      appellant: tx-sender,
      appeal-evidence-hash: appeal-evidence-hash,
      resolution-deadline: resolution-deadline,
      status: STATUS_DISPUTED
    })
    (ok true)
  )
)

(define-public (finalize-decision (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (decision-state (unwrap! (map-get? decisions job-id) ERR_DECISION_NOT_FOUND))
      (decision (get original-decision decision-state))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (client (get client job))
    )
    (try! (check-job-token job-id token))
    (asserts! (is-eq (get status job) STATUS_DECISION_PENDING) ERR_INVALID_STATUS)
    (asserts! (> burn-block-height (get appeal-deadline decision-state)) ERR_FINALIZE_TOO_EARLY)

    (try! (settle-service-payment job-id (if (is-eq decision DECISION_APPROVE) provider client) token))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job {
      status: (if (is-eq decision DECISION_APPROVE) STATUS_COMPLETED STATUS_REJECTED)
    }))
    (map-set decisions job-id (merge decision-state {
      final-decision: (some decision),
      finalized-by: (some tx-sender),
      finalized-at-burn: (some burn-block-height)
    }))
    (sync-reputation job-id provider (if
      (is-eq decision DECISION_APPROVE)
      OUTCOME_COMPLETED
      OUTCOME_DISPUTED
    ))
    (print {
      event: "decision-finalized",
      job-id: job-id,
      original-decision: decision,
      final-decision: decision,
      finalized-by: tx-sender,
      appealed: false,
      amount: budget,
      status: (if (is-eq decision DECISION_APPROVE) STATUS_COMPLETED STATUS_REJECTED)
    })
    (ok true)
  )
)

(define-public (resolve-appeal
    (job-id uint)
    (final-decision uint)
    (resolution-hash (buff 32))
    (token <ft-trait>)
  )
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (decision-state (unwrap! (map-get? decisions job-id) ERR_DECISION_NOT_FOUND))
      (resolution-deadline (unwrap! (get resolution-deadline decision-state) ERR_RESOLUTION_DEADLINE_MISSING))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (client (get client job))
    )
    (try! (check-job-token job-id token))
    (asserts! (is-eq (get status job) STATUS_DISPUTED) ERR_INVALID_STATUS)
    (asserts! (is-eq tx-sender (get appeal-authority job)) ERR_NOT_APPEAL_AUTHORITY)
    (asserts! (<= burn-block-height resolution-deadline) ERR_APPEAL_RESOLUTION_CLOSED)
    (asserts! (is-valid-decision final-decision) ERR_INVALID_DECISION)
    (asserts! (is-valid-hash resolution-hash) ERR_INVALID_EVIDENCE_HASH)

    (try! (settle-service-payment job-id (if (is-eq final-decision DECISION_APPROVE) provider client) token))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job {
      status: (if (is-eq final-decision DECISION_APPROVE) STATUS_COMPLETED STATUS_REJECTED)
    }))
    (map-set decisions job-id (merge decision-state {
      final-decision: (some final-decision),
      resolution-hash: (some resolution-hash),
      finalized-by: (some tx-sender),
      finalized-at-burn: (some burn-block-height)
    }))
    (sync-reputation job-id provider (if
      (is-eq final-decision DECISION_APPROVE)
      OUTCOME_COMPLETED
      OUTCOME_DISPUTED
    ))
    (print {
      event: "appeal-resolved",
      job-id: job-id,
      original-decision: (get original-decision decision-state),
      final-decision: final-decision,
      appeal-authority: tx-sender,
      resolution-hash: resolution-hash,
      amount: budget,
      status: (if (is-eq final-decision DECISION_APPROVE) STATUS_COMPLETED STATUS_REJECTED)
    })
    (ok true)
  )
)

(define-public (settle-appeal-timeout (job-id uint) (token <ft-trait>))
  (let
    (
      (job (unwrap! (map-get? jobs job-id) ERR_JOB_NOT_FOUND))
      (decision-state (unwrap! (map-get? decisions job-id) ERR_DECISION_NOT_FOUND))
      (resolution-deadline (unwrap! (get resolution-deadline decision-state) ERR_RESOLUTION_DEADLINE_MISSING))
      (decision (get original-decision decision-state))
      (budget (get budget job))
      (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
      (client (get client job))
    )
    (try! (check-job-token job-id token))
    (asserts! (is-eq (get status job) STATUS_DISPUTED) ERR_INVALID_STATUS)
    (asserts! (> burn-block-height resolution-deadline) ERR_APPEAL_RESOLUTION_TOO_EARLY)

    (try! (settle-service-payment job-id (if (is-eq decision DECISION_APPROVE) provider client) token))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job {
      status: (if (is-eq decision DECISION_APPROVE) STATUS_COMPLETED STATUS_REJECTED)
    }))
    (map-set decisions job-id (merge decision-state {
      final-decision: (some decision),
      finalized-by: (some tx-sender),
      finalized-at-burn: (some burn-block-height)
    }))
    (sync-reputation job-id provider (if
      (is-eq decision DECISION_APPROVE)
      OUTCOME_COMPLETED
      OUTCOME_DISPUTED
    ))
    (print {
      event: "appeal-timeout-finalized",
      job-id: job-id,
      original-decision: decision,
      final-decision: decision,
      finalized-by: tx-sender,
      amount: budget,
      status: (if (is-eq decision DECISION_APPROVE) STATUS_COMPLETED STATUS_REJECTED)
    })
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

    (asserts! (try! (as-contract (contract-call? token transfer budget tx-sender provider none))) ERR_TOKEN_TRANSFER_FAILED)
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
        (try! (check-job-token job-id token))
        (asserts! (try! (as-contract (contract-call? token transfer escrowed tx-sender client none))) ERR_TOKEN_TRANSFER_FAILED)
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
