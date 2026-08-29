;; Nayori Reputation Registry v3
;; Source-namespaced, idempotent job reputation for versioned commerce contracts.

;; ============================================
;; Constants
;; ============================================
(define-constant ERR_NOT_OWNER (err u500))
(define-constant ERR_NOT_AUTHORIZED (err u501))
(define-constant ERR_INVALID_RATING (err u502))
(define-constant ERR_ALREADY_RATED (err u503))
(define-constant ERR_SELF_RATING (err u504))
(define-constant ERR_INVALID_OUTCOME (err u505))
(define-constant ERR_OUTCOME_ALREADY_RECORDED (err u506))
(define-constant ERR_OUTCOME_NOT_FOUND (err u507))
(define-constant ERR_NO_PENDING_OWNER (err u508))
(define-constant ERR_NOT_PENDING_OWNER (err u509))
(define-constant ERR_INVALID_OWNER (err u510))

(define-constant EMPTY_REPUTATION {
  total-score: u0,
  rating-count: u0,
  average-score-x100: u0,
  completed-jobs: u0,
  disputed-jobs: u0
})

;; ============================================
;; State
;; ============================================
(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)

(define-map agent-reputation principal {
  total-score: uint,
  rating-count: uint,
  average-score-x100: uint,
  completed-jobs: uint,
  disputed-jobs: uint
})

;; The authorized protocol caller is part of the key. Identical job IDs from
;; STX and sBTC commerce contracts cannot collide.
(define-map ratings {
  source: principal,
  agent: principal,
  rater: principal,
  job-id: uint
} {
  score: uint,
  comment: (string-ascii 256)
})

(define-map job-outcomes { source: principal, job-id: uint } {
  agent: principal,
  completed: bool,
  disputed: bool
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

(define-private (is-valid-outcome (completed bool) (disputed bool))
  (or
    (and completed (not disputed))
    (and disputed (not completed))
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

(define-read-only (is-registered-caller (caller principal))
  (is-protocol-caller caller)
)

(define-read-only (get-reputation (agent principal))
  (ok (default-to EMPTY_REPUTATION (map-get? agent-reputation agent)))
)

(define-read-only (get-rating
    (source principal)
    (agent principal)
    (rater principal)
    (job-id uint)
  )
  (match (map-get? ratings {
      source: source,
      agent: agent,
      rater: rater,
      job-id: job-id
    })
    rating (ok rating)
    ERR_INVALID_RATING
  )
)

(define-read-only (has-rated
    (source principal)
    (agent principal)
    (rater principal)
    (job-id uint)
  )
  (is-some (map-get? ratings {
    source: source,
    agent: agent,
    rater: rater,
    job-id: job-id
  }))
)

(define-read-only (get-job-outcome (source principal) (job-id uint))
  (match (map-get? job-outcomes { source: source, job-id: job-id })
    outcome (ok outcome)
    ERR_OUTCOME_NOT_FOUND
  )
)

;; ============================================
;; Two-step ownership
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

;; ============================================
;; Protocol administration
;; ============================================
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
(define-public (submit-rating
    (agent principal)
    (rater principal)
    (score uint)
    (job-id uint)
    (comment (string-ascii 256))
  )
  (let
    (
      (source tx-sender)
      (current (default-to EMPTY_REPUTATION (map-get? agent-reputation agent)))
      (key { source: source, agent: agent, rater: rater, job-id: job-id })
    )
    (asserts! (is-protocol-caller source) ERR_NOT_AUTHORIZED)
    (asserts! (and (>= score u1) (<= score u5)) ERR_INVALID_RATING)
    (asserts! (not (is-eq agent rater)) ERR_SELF_RATING)
    (asserts! (is-none (map-get? ratings key)) ERR_ALREADY_RATED)

    (map-set ratings key { score: score, comment: comment })
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
      (print {
        event: "rating-submitted",
        source: source,
        agent: agent,
        rater: rater,
        job-id: job-id,
        score: score
      })
      (ok true)
    )
  )
)

;; One normal outcome per (commerce source, job ID). Retries are safe because a
;; duplicate cannot increment the aggregate counters twice.
(define-public (record-job-outcome
    (agent principal)
    (job-id uint)
    (completed bool)
    (disputed bool)
  )
  (let
    (
      (source tx-sender)
      (key { source: source, job-id: job-id })
      (current (default-to EMPTY_REPUTATION (map-get? agent-reputation agent)))
    )
    (asserts! (is-protocol-caller source) ERR_NOT_AUTHORIZED)
    (asserts! (is-valid-outcome completed disputed) ERR_INVALID_OUTCOME)
    (asserts! (is-none (map-get? job-outcomes key)) ERR_OUTCOME_ALREADY_RECORDED)

    (map-set job-outcomes key {
      agent: agent,
      completed: completed,
      disputed: disputed
    })
    (map-set agent-reputation agent (merge current {
      completed-jobs: (+ (get completed-jobs current) (if completed u1 u0)),
      disputed-jobs: (+ (get disputed-jobs current) (if disputed u1 u0))
    }))
    (print {
      event: "job-outcome-recorded",
      source: source,
      agent: agent,
      job-id: job-id,
      completed: completed,
      disputed: disputed
    })
    (ok true)
  )
)
