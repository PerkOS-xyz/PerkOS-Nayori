;; PerkOS Reputation Registry v2
;; Portable, on-chain track record for agents.
;;
;; Hardened successor to reputation-registry.clar. Changes:
;;   - Ratings can no longer be submitted by arbitrary wallets. Only a registered
;;     protocol caller (the escrow contract) may submit one, and it does so only after
;;     verifying the rater was the client or evaluator of a completed job. This closes
;;     the Sybil hole where any wallet could rate any agent.
;;   - Ratings are keyed by (agent, rater, job-id), so one rater rates one agent once
;;     per job rather than once ever.
;;   - The average is stored scaled by 100 (450 means 4.50) instead of being truncated
;;     by integer division.
;;   - Every mutation emits a print event for indexing.

;; ============================================
;; Constants
;; ============================================
(define-constant ERR_NOT_OWNER (err u400))
(define-constant ERR_NOT_AUTHORIZED (err u401))
(define-constant ERR_INVALID_RATING (err u402))
(define-constant ERR_ALREADY_RATED (err u403))
(define-constant ERR_SELF_RATING (err u404))

(define-constant EMPTY_REPUTATION {
  total-score: u0,
  rating-count: u0,
  average-score-x100: u0,
  completed-jobs: u0,
  disputed-jobs: u0
})

;; ============================================
;; Data vars
;; ============================================
(define-data-var contract-owner principal tx-sender)

;; ============================================
;; Maps
;; ============================================
(define-map agent-reputation principal {
  total-score: uint,
  rating-count: uint,
  average-score-x100: uint,
  completed-jobs: uint,
  disputed-jobs: uint
})

(define-map ratings { agent: principal, rater: principal, job-id: uint } {
  score: uint,
  comment: (string-ascii 256)
})

(define-map protocol-callers principal bool)

;; ============================================
;; Private
;; ============================================
(define-private (is-owner (caller principal))
  (is-eq caller (var-get contract-owner))
)

(define-private (is-protocol-caller (caller principal))
  (default-to false (map-get? protocol-callers caller))
)

;; ============================================
;; Read-only
;; ============================================
(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (is-registered-caller (caller principal))
  (is-protocol-caller caller)
)

(define-read-only (get-reputation (agent principal))
  (ok (default-to EMPTY_REPUTATION (map-get? agent-reputation agent)))
)

(define-read-only (get-rating (agent principal) (rater principal) (job-id uint))
  (match (map-get? ratings { agent: agent, rater: rater, job-id: job-id })
    rating (ok rating)
    ERR_INVALID_RATING
  )
)

(define-read-only (has-rated (agent principal) (rater principal) (job-id uint))
  (is-some (map-get? ratings { agent: agent, rater: rater, job-id: job-id }))
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

(define-public (add-protocol-caller (caller principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (map-set protocol-callers caller true)
    (print { event: "protocol-caller-added", caller: caller })
    (ok true)
  )
)

(define-public (remove-protocol-caller (caller principal))
  (begin
    (asserts! (is-owner tx-sender) ERR_NOT_OWNER)
    (map-set protocol-callers caller false)
    (print { event: "protocol-caller-removed", caller: caller })
    (ok true)
  )
)

;; ============================================
;; Reputation
;; ============================================
;; Protocol-gated. The caller (escrow contract) is responsible for proving the rater
;; actually participated in a completed job with this agent.
(define-public (submit-rating
    (agent principal)
    (rater principal)
    (score uint)
    (job-id uint)
    (comment (string-ascii 256))
  )
  (let
    (
      (current (default-to EMPTY_REPUTATION (map-get? agent-reputation agent)))
    )
    (asserts! (is-protocol-caller tx-sender) ERR_NOT_AUTHORIZED)
    (asserts! (and (>= score u1) (<= score u5)) ERR_INVALID_RATING)
    (asserts! (not (is-eq agent rater)) ERR_SELF_RATING)
    (asserts! (is-none (map-get? ratings { agent: agent, rater: rater, job-id: job-id })) ERR_ALREADY_RATED)

    (map-set ratings { agent: agent, rater: rater, job-id: job-id } {
      score: score,
      comment: comment
    })

    (let
      (
        (new-total (+ (get total-score current) score))
        (new-count (+ (get rating-count current) u1))
      )
      (map-set agent-reputation agent (merge current {
        total-score: new-total,
        rating-count: new-count,
        average-score-x100: (/ (* new-total u100) new-count)
      }))
      (print { event: "rating-submitted", agent: agent, rater: rater, job-id: job-id, score: score })
      (ok true)
    )
  )
)

;; Protocol-gated job outcome counters, called by the escrow at settlement.
(define-public (update-job-stats
    (agent principal)
    (completed bool)
    (disputed bool)
  )
  (let
    (
      (current (default-to EMPTY_REPUTATION (map-get? agent-reputation agent)))
    )
    (asserts! (is-protocol-caller tx-sender) ERR_NOT_AUTHORIZED)

    (map-set agent-reputation agent (merge current {
      completed-jobs: (+ (get completed-jobs current) (if completed u1 u0)),
      disputed-jobs: (+ (get disputed-jobs current) (if disputed u1 u0))
    }))
    (print { event: "job-stats-updated", agent: agent, completed: completed, disputed: disputed })
    (ok true)
  )
)
