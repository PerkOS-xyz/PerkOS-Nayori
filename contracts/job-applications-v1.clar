;; Nayori job applications v1
;;
;; An open marketplace needs a way for a provider agent to say "I will take this job".
;; The escrow contracts are immutable and only the client can assign a provider, so this
;; companion registry records applications on-chain and the client confirms the winner with
;; the escrow's existing `assign-provider` call.
;;
;; This contract never holds or moves funds and has no authority over any escrow. It only
;; reads the escrow job and the agent registry through allowlisted contracts that the owner
;; pins exactly once.

(define-constant ERR_NOT_OWNER (err u1000))
(define-constant ERR_ALREADY_CONFIGURED (err u1001))
(define-constant ERR_NOT_CONFIGURED (err u1002))
(define-constant ERR_UNKNOWN_ESCROW (err u1003))
(define-constant ERR_UNKNOWN_REGISTRY (err u1004))
(define-constant ERR_JOB_NOT_OPEN (err u1005))
(define-constant ERR_PROVIDER_ALREADY_ASSIGNED (err u1006))
(define-constant ERR_INVALID_PARTY (err u1007))
(define-constant ERR_AGENT_NOT_OWNED (err u1008))
(define-constant ERR_AGENT_INACTIVE (err u1009))
(define-constant ERR_ALREADY_APPLIED (err u1010))
(define-constant ERR_APPLICATION_NOT_FOUND (err u1011))
(define-constant ERR_TOO_MANY_APPLICATIONS (err u1012))
(define-constant ERR_INVALID_CONFIGURATION (err u1013))

(define-constant ASSET_STX u1)
(define-constant ASSET_SBTC u2)
(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant MAX_APPLICATIONS_PER_JOB u50)

;; Exact read interfaces of the deployed escrow generation and agent registry.
(define-trait job-reader-trait
  (
    (get-job (uint) (response {
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
    } uint))
  )
)

(define-trait agent-reader-trait
  (
    (get-agent (uint) (response {
      name: (string-ascii 64),
      description: (string-ascii 256),
      creator: principal,
      wallet: principal,
      active: bool,
      endpoints: (list 10 {name: (string-ascii 32), url: (string-ascii 128)})
    } uint))
  )
)

(define-data-var contract-owner principal tx-sender)
(define-data-var configured bool false)
(define-data-var agent-registry principal tx-sender)
(define-data-var stx-escrow principal tx-sender)
(define-data-var sbtc-escrow principal tx-sender)

(define-map applications
  { asset: uint, job-id: uint, applicant: principal }
  { agent-id: uint, note: (string-ascii 140), applied-at-burn: uint, active: bool }
)
(define-map applicant-at { asset: uint, job-id: uint, index: uint } principal)
(define-map application-count { asset: uint, job-id: uint } uint)

;; ============================================
;; Configuration: pinned once, then immutable
;; ============================================

(define-public (configure (registry principal) (stx principal) (sbtc principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_OWNER)
    (asserts! (not (var-get configured)) ERR_ALREADY_CONFIGURED)
    (asserts! (and
      (not (is-eq registry stx))
      (not (is-eq registry sbtc))
      (not (is-eq stx sbtc))
    ) ERR_INVALID_CONFIGURATION)
    (var-set agent-registry registry)
    (var-set stx-escrow stx)
    (var-set sbtc-escrow sbtc)
    (var-set configured true)
    (print { event: "applications-configured", registry: registry, stx-escrow: stx, sbtc-escrow: sbtc })
    (ok true)
  )
)

(define-private (asset-of (escrow principal))
  (if (is-eq escrow (var-get stx-escrow))
    (some ASSET_STX)
    (if (is-eq escrow (var-get sbtc-escrow)) (some ASSET_SBTC) none)
  )
)

;; ============================================
;; Applications
;; ============================================

(define-public (apply-to-job
    (escrow <job-reader-trait>)
    (registry <agent-reader-trait>)
    (job-id uint)
    (agent-id uint)
    (note (string-ascii 140))
  )
  (let
    (
      (asset (unwrap! (asset-of (contract-of escrow)) ERR_UNKNOWN_ESCROW))
      (job (try! (contract-call? escrow get-job job-id)))
      (agent (try! (contract-call? registry get-agent agent-id)))
      (key { asset: asset, job-id: job-id, applicant: tx-sender })
      (count-key { asset: asset, job-id: job-id })
      (count (default-to u0 (map-get? application-count count-key)))
      (previous (map-get? applications key))
    )
    (asserts! (var-get configured) ERR_NOT_CONFIGURED)
    (asserts! (is-eq (contract-of registry) (var-get agent-registry)) ERR_UNKNOWN_REGISTRY)
    (asserts! (or (is-eq (get status job) STATUS_OPEN) (is-eq (get status job) STATUS_FUNDED)) ERR_JOB_NOT_OPEN)
    (asserts! (is-none (get provider job)) ERR_PROVIDER_ALREADY_ASSIGNED)
    (asserts! (and
      (not (is-eq tx-sender (get client job)))
      (not (is-eq tx-sender (get evaluator job)))
      (not (is-eq tx-sender (get appeal-authority job)))
      (not (is-eq tx-sender (get treasury job)))
    ) ERR_INVALID_PARTY)
    (asserts! (is-eq (get wallet agent) tx-sender) ERR_AGENT_NOT_OWNED)
    (asserts! (get active agent) ERR_AGENT_INACTIVE)
    (asserts! (not (default-to false (get active previous))) ERR_ALREADY_APPLIED)
    (if (is-none previous)
      (begin
        (asserts! (< count MAX_APPLICATIONS_PER_JOB) ERR_TOO_MANY_APPLICATIONS)
        (map-set applicant-at { asset: asset, job-id: job-id, index: count } tx-sender)
        (map-set application-count count-key (+ count u1))
      )
      true
    )
    (map-set applications key {
      agent-id: agent-id,
      note: note,
      applied-at-burn: burn-block-height,
      active: true
    })
    (print { event: "job-application", asset: asset, job-id: job-id, applicant: tx-sender, agent-id: agent-id })
    (ok true)
  )
)

(define-public (withdraw-application (asset uint) (job-id uint))
  (let
    (
      (key { asset: asset, job-id: job-id, applicant: tx-sender })
      (application (unwrap! (map-get? applications key) ERR_APPLICATION_NOT_FOUND))
    )
    (asserts! (get active application) ERR_APPLICATION_NOT_FOUND)
    (map-set applications key (merge application { active: false }))
    (print { event: "job-application-withdrawn", asset: asset, job-id: job-id, applicant: tx-sender })
    (ok true)
  )
)

;; ============================================
;; Reads
;; ============================================

(define-read-only (get-configuration)
  (ok {
    owner: (var-get contract-owner),
    configured: (var-get configured),
    agent-registry: (var-get agent-registry),
    stx-escrow: (var-get stx-escrow),
    sbtc-escrow: (var-get sbtc-escrow),
    max-applications-per-job: MAX_APPLICATIONS_PER_JOB
  })
)

(define-read-only (get-application (asset uint) (job-id uint) (applicant principal))
  (map-get? applications { asset: asset, job-id: job-id, applicant: applicant })
)

(define-read-only (get-application-count (asset uint) (job-id uint))
  (default-to u0 (map-get? application-count { asset: asset, job-id: job-id }))
)

(define-read-only (get-applicant-at (asset uint) (job-id uint) (index uint))
  (match (map-get? applicant-at { asset: asset, job-id: job-id, index: index })
    applicant (some {
      applicant: applicant,
      application: (map-get? applications { asset: asset, job-id: job-id, applicant: applicant })
    })
    none
  )
)
