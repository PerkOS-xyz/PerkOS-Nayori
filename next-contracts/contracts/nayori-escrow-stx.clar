;; nayori-escrow-stx
;; Job escrow in STX between AI agents (same rules as nayori-escrow-sbtc). No owner and no admin functions: the
;; token, fee, limits and the reputation registry are fixed in code. A party is
;; tx-sender, calling directly or through a contract it allowed in
;; nayori-permissions. Every deadline is in Bitcoin blocks. Payouts
;; run under as-contract? with an allowance of exactly the job's budget. Funds
;; move with native stx-transfer?; there is no token parameter anywhere.

;; Budgets in micro-STX: 1 STX to 100,000 STX.
(define-constant MIN_BUDGET u1000000)
(define-constant MAX_BUDGET u100000000000)
(define-constant FEE_DIVISOR u50)
(define-constant MIN_DELIVERY_BLOCKS u144)
(define-constant MAX_DELIVERY_BLOCKS u4320)
(define-constant MIN_REVIEW_BLOCKS u12)
(define-constant MAX_REVIEW_BLOCKS u1008)
(define-constant APPEAL_BLOCKS u144)

(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant STATUS_OFFERED u2)
(define-constant STATUS_ACCEPTED u3)
(define-constant STATUS_SUBMITTED u4)
(define-constant STATUS_DECIDED u5)
(define-constant STATUS_DISPUTED u6)
(define-constant STATUS_COMPLETED u7)
(define-constant STATUS_REJECTED u8)
(define-constant STATUS_REFUNDED u9)
(define-constant STATUS_EXPIRED u10)

(define-constant DECISION_APPROVE u1)
(define-constant DECISION_REJECT u2)
(define-constant ZERO_HASH 0x0000000000000000000000000000000000000000000000000000000000000000)

(define-constant ERR_NOT_FOUND (err u300))
(define-constant ERR_INVALID_STATUS (err u301))
(define-constant ERR_NOT_CLIENT (err u302))
(define-constant ERR_NOT_PROVIDER (err u303))
(define-constant ERR_NOT_EVALUATOR (err u304))
(define-constant ERR_NOT_APPELLANT (err u305))
(define-constant ERR_NOT_APPEAL_AUTHORITY (err u306))
(define-constant ERR_INVALID_PARTY (err u307))
(define-constant ERR_INVALID_BUDGET (err u308))
(define-constant ERR_INVALID_DEADLINE (err u309))
(define-constant ERR_INVALID_DESCRIPTION (err u310))
(define-constant ERR_INVALID_DECISION (err u311))
(define-constant ERR_INVALID_HASH (err u312))
(define-constant ERR_DEADLINE_PASSED (err u313))
(define-constant ERR_TOO_EARLY (err u314))
(define-constant ERR_WINDOW_CLOSED (err u315))
(define-constant ERR_NOTHING_PENDING (err u316))

(define-data-var job-counter uint u0)

(define-map jobs uint {
  client: principal,
  evaluator: principal,
  provider: (optional principal),
  treasury: principal,
  appeal-authority: principal,
  budget: uint,
  description: (string-ascii 512),
  ;; Before acceptance: the deadline to fund, offer and accept. From
  ;; acceptance: the delivery deadline, reset to acceptance + delivery-blocks.
  delivery-deadline: uint,
  delivery-blocks: uint,
  review-blocks: uint,
  status: uint
})

(define-map submissions uint { deliverable: (buff 64), review-deadline: uint })

(define-map decisions uint {
  decision: uint,
  by-default: bool,
  evidence-hash: (buff 32),
  appeal-deadline: uint,
  appellant: (optional principal),
  resolution-deadline: (optional uint)
})

(define-map escrow-balances uint uint)
(define-map reputation-pending uint { provider: principal, client: principal, completed: bool, value: uint })

;; ---------------------------------------------------------------- read-only

(define-read-only (get-job (job-id uint)) (map-get? jobs job-id))
(define-read-only (get-submission (job-id uint)) (map-get? submissions job-id))
(define-read-only (get-decision (job-id uint)) (map-get? decisions job-id))
(define-read-only (get-escrow-balance (job-id uint)) (default-to u0 (map-get? escrow-balances job-id)))
(define-read-only (get-job-count) (var-get job-counter))
(define-read-only (get-reputation-pending (job-id uint)) (map-get? reputation-pending job-id))
(define-read-only (fee-for (budget uint)) (/ budget FEE_DIVISOR))

;; ---------------------------------------------------------------- helpers

;; The current call acts for `party`: the party signed it and called directly,
;; or through a contract it allowed.
(define-private (acts-for (party principal))
  (and (is-eq tx-sender party)
       (or (is-eq contract-caller party)
           (contract-call? .nayori-permissions is-allowed party contract-caller current-contract))))

(define-private (valid-hash (value (buff 32)))
  (and (is-eq (len value) u32) (not (is-eq value ZERO_HASH))))

(define-private (valid-decision (decision uint))
  (or (is-eq decision DECISION_APPROVE) (is-eq decision DECISION_REJECT)))

(define-private (pay (amount uint) (recipient principal))
  (if (> amount u0)
    (stx-transfer? amount tx-sender recipient)
    (ok true)))

(define-private (record-reputation (job-id uint) (provider principal) (client principal) (completed bool) (value uint))
  (match (contract-call? .nayori-reputation record-outcome job-id provider client completed value)
    recorded (begin (map-delete reputation-pending job-id) true)
    failed (begin
      (map-set reputation-pending job-id { provider: provider, client: client, completed: completed, value: value })
      false)))

;; Pays the winner budget minus fee and the job's treasury the fee, then records
;; the outcome. The allowance covers exactly the job's budget.
(define-private (settle (job-id uint) (decision uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (budget (get budget job))
        (fee (/ budget FEE_DIVISOR))
        (provider (unwrap! (get provider job) ERR_NOT_PROVIDER))
        (approved (is-eq decision DECISION_APPROVE))
        (winner (if approved provider (get client job)))
        (treasury (get treasury job)))
    (asserts! (is-eq (get-escrow-balance job-id) budget) ERR_INVALID_STATUS)
    (try! (as-contract? ((with-stx budget))
      (try! (pay (- budget fee) winner))
      (try! (pay fee treasury))))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: (if approved STATUS_COMPLETED STATUS_REJECTED) }))
    (record-reputation job-id provider (get client job) approved budget)
    (print { event: "job-settled", job-id: job-id, decision: decision, winner: winner, net: (- budget fee),
      treasury: treasury, fee: fee })
    (ok true)))

;; ---------------------------------------------------------------- lifecycle

(define-public (create-job (evaluator principal) (budget uint) (delivery-blocks uint) (review-blocks uint)
    (description (string-ascii 512)))
  (let ((client tx-sender)
        (job-id (+ (var-get job-counter) u1))
        (treasury (contract-call? .nayori-roles get-treasury))
        (authority (contract-call? .nayori-roles get-appeal-authority)))
    (asserts! (acts-for client) ERR_NOT_CLIENT)
    (asserts! (and (>= budget MIN_BUDGET) (<= budget MAX_BUDGET)) ERR_INVALID_BUDGET)
    (asserts! (and (>= delivery-blocks MIN_DELIVERY_BLOCKS) (<= delivery-blocks MAX_DELIVERY_BLOCKS)) ERR_INVALID_DEADLINE)
    (asserts! (and (>= review-blocks MIN_REVIEW_BLOCKS) (<= review-blocks MAX_REVIEW_BLOCKS)) ERR_INVALID_DEADLINE)
    (asserts! (> (len description) u0) ERR_INVALID_DESCRIPTION)
    (asserts! (not (is-eq client evaluator)) ERR_INVALID_PARTY)
    (asserts! (not (or (is-eq client treasury) (is-eq client authority))) ERR_INVALID_PARTY)
    (asserts! (not (or (is-eq evaluator treasury) (is-eq evaluator authority))) ERR_INVALID_PARTY)
    (map-set jobs job-id {
      client: client, evaluator: evaluator, provider: none, treasury: treasury, appeal-authority: authority,
      budget: budget, description: description, delivery-deadline: (+ burn-block-height delivery-blocks),
      delivery-blocks: delivery-blocks, review-blocks: review-blocks, status: STATUS_OPEN })
    (var-set job-counter job-id)
    (print { event: "job-created", job-id: job-id, client: client, evaluator: evaluator, budget: budget,
      delivery-deadline: (+ burn-block-height delivery-blocks), review-blocks: review-blocks,
      treasury: treasury, appeal-authority: authority })
    (ok job-id)))

(define-public (fund-job (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (budget (get budget job)))
    (asserts! (acts-for (get client job)) ERR_NOT_CLIENT)
    (asserts! (is-eq (get status job) STATUS_OPEN) ERR_INVALID_STATUS)
    (asserts! (< burn-block-height (get delivery-deadline job)) ERR_DEADLINE_PASSED)
    (try! (stx-transfer? budget tx-sender current-contract))
    (map-set escrow-balances job-id budget)
    (map-set jobs job-id (merge job { status: STATUS_FUNDED }))
    (print { event: "job-funded", job-id: job-id, amount: budget })
    (ok true)))

;; The client offers the job; until the provider accepts, the offer can change.
(define-public (name-provider (job-id uint) (provider principal))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (status (get status job)))
    (asserts! (acts-for (get client job)) ERR_NOT_CLIENT)
    (asserts! (or (is-eq status STATUS_FUNDED) (is-eq status STATUS_OFFERED)) ERR_INVALID_STATUS)
    (asserts! (not (or (is-eq provider (get client job)) (is-eq provider (get evaluator job))
      (is-eq provider (get treasury job)) (is-eq provider (get appeal-authority job)))) ERR_INVALID_PARTY)
    (map-set jobs job-id (merge job { provider: (some provider), status: STATUS_OFFERED }))
    (print { event: "provider-named", job-id: job-id, provider: provider })
    (ok true)))

(define-public (accept-job (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND)))
    (asserts! (is-eq (get status job) STATUS_OFFERED) ERR_INVALID_STATUS)
    (asserts! (acts-for (unwrap! (get provider job) ERR_NOT_PROVIDER)) ERR_NOT_PROVIDER)
    (asserts! (< burn-block-height (get delivery-deadline job)) ERR_DEADLINE_PASSED)
    ;; The provider always gets the full delivery window from acceptance.
    (map-set jobs job-id (merge job { status: STATUS_ACCEPTED,
      delivery-deadline: (+ burn-block-height (get delivery-blocks job)) }))
    (print { event: "job-accepted", job-id: job-id, provider: tx-sender })
    (ok true)))

(define-public (submit-work (job-id uint) (deliverable (buff 64)))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (review-deadline (+ burn-block-height (get review-blocks job))))
    (asserts! (is-eq (get status job) STATUS_ACCEPTED) ERR_INVALID_STATUS)
    (asserts! (acts-for (unwrap! (get provider job) ERR_NOT_PROVIDER)) ERR_NOT_PROVIDER)
    (asserts! (< burn-block-height (get delivery-deadline job)) ERR_DEADLINE_PASSED)
    (map-set submissions job-id { deliverable: deliverable, review-deadline: review-deadline })
    (map-set jobs job-id (merge job { status: STATUS_SUBMITTED }))
    (print { event: "work-submitted", job-id: job-id, review-deadline: review-deadline })
    (ok true)))

(define-private (decide (job-id uint) (decision uint) (by-default bool) (evidence-hash (buff 32)))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND)))
    (map-set decisions job-id { decision: decision, by-default: by-default, evidence-hash: evidence-hash,
      appeal-deadline: (+ burn-block-height APPEAL_BLOCKS), appellant: none, resolution-deadline: none })
    (map-set jobs job-id (merge job { status: STATUS_DECIDED }))
    (print { event: "job-decided", job-id: job-id, decision: decision, by-default: by-default,
      appeal-deadline: (+ burn-block-height APPEAL_BLOCKS) })
    (ok true)))

(define-public (record-decision (job-id uint) (decision uint) (evidence-hash (buff 32)))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (submission (unwrap! (map-get? submissions job-id) ERR_INVALID_STATUS)))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (acts-for (get evaluator job)) ERR_NOT_EVALUATOR)
    (asserts! (<= burn-block-height (get review-deadline submission)) ERR_WINDOW_CLOSED)
    (asserts! (valid-decision decision) ERR_INVALID_DECISION)
    (asserts! (valid-hash evidence-hash) ERR_INVALID_HASH)
    (decide job-id decision false evidence-hash)))

;; After the review window passes without a decision, anyone records a default
;; approval. It is appealable like any decision.
(define-public (record-default-approval (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (submission (unwrap! (map-get? submissions job-id) ERR_INVALID_STATUS)))
    (asserts! (is-eq (get status job) STATUS_SUBMITTED) ERR_INVALID_STATUS)
    (asserts! (> burn-block-height (get review-deadline submission)) ERR_TOO_EARLY)
    (decide job-id DECISION_APPROVE true ZERO_HASH)))

;; The losing side appeals: the client against an approval, the provider
;; against a rejection.
(define-public (appeal (job-id uint) (evidence-hash (buff 32)))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (decision (unwrap! (map-get? decisions job-id) ERR_INVALID_STATUS))
        (loser (if (is-eq (get decision decision) DECISION_APPROVE) (some (get client job)) (get provider job))))
    (asserts! (is-eq (get status job) STATUS_DECIDED) ERR_INVALID_STATUS)
    (asserts! (<= burn-block-height (get appeal-deadline decision)) ERR_WINDOW_CLOSED)
    (asserts! (acts-for (unwrap! loser ERR_NOT_APPELLANT)) ERR_NOT_APPELLANT)
    (asserts! (valid-hash evidence-hash) ERR_INVALID_HASH)
    (map-set decisions job-id (merge decision { appellant: (some tx-sender),
      resolution-deadline: (some (+ burn-block-height APPEAL_BLOCKS)) }))
    (map-set jobs job-id (merge job { status: STATUS_DISPUTED }))
    (print { event: "job-appealed", job-id: job-id, appellant: tx-sender,
      resolution-deadline: (+ burn-block-height APPEAL_BLOCKS) })
    (ok true)))

(define-public (resolve-appeal (job-id uint) (final-decision uint) (resolution-hash (buff 32)))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (decision (unwrap! (map-get? decisions job-id) ERR_INVALID_STATUS))
        (resolution-deadline (unwrap! (get resolution-deadline decision) ERR_INVALID_STATUS)))
    (asserts! (is-eq (get status job) STATUS_DISPUTED) ERR_INVALID_STATUS)
    (asserts! (acts-for (get appeal-authority job)) ERR_NOT_APPEAL_AUTHORITY)
    (asserts! (<= burn-block-height resolution-deadline) ERR_WINDOW_CLOSED)
    (asserts! (valid-decision final-decision) ERR_INVALID_DECISION)
    (asserts! (valid-hash resolution-hash) ERR_INVALID_HASH)
    (print { event: "appeal-resolved", job-id: job-id, final-decision: final-decision, resolution-hash: resolution-hash })
    (settle job-id final-decision)))

;; Anyone settles a decision once its appeal window, or an unresolved appeal's
;; resolution window, has passed. The original decision stands.
(define-public (settle-job (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (decision (unwrap! (map-get? decisions job-id) ERR_INVALID_STATUS))
        (status (get status job)))
    (asserts! (or
      (and (is-eq status STATUS_DECIDED) (> burn-block-height (get appeal-deadline decision)))
      (and (is-eq status STATUS_DISPUTED)
           (> burn-block-height (default-to u0 (get resolution-deadline decision)))))
      (if (or (is-eq status STATUS_DECIDED) (is-eq status STATUS_DISPUTED)) ERR_TOO_EARLY ERR_INVALID_STATUS))
    (settle job-id (get decision decision))))

;; No delivery by the deadline: anyone returns the full budget to the client.
(define-public (refund-no-delivery (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND))
        (status (get status job))
        (budget (get budget job))
        (client (get client job)))
    (asserts! (or (is-eq status STATUS_FUNDED) (is-eq status STATUS_OFFERED) (is-eq status STATUS_ACCEPTED))
      ERR_INVALID_STATUS)
    (asserts! (>= burn-block-height (get delivery-deadline job)) ERR_TOO_EARLY)
    (asserts! (is-eq (get-escrow-balance job-id) budget) ERR_INVALID_STATUS)
    (try! (as-contract? ((with-stx budget))
      (try! (pay budget client))))
    (map-delete escrow-balances job-id)
    (map-set jobs job-id (merge job { status: STATUS_REFUNDED }))
    ;; An accepted job that was never delivered marks the provider.
    (if (is-eq status STATUS_ACCEPTED)
      (match (get provider job)
        provider (is-ok (contract-call? .nayori-reputation record-non-delivery job-id provider))
        false)
      false)
    (print { event: "job-refunded", job-id: job-id, client: client, amount: budget })
    (ok true)))

;; An unfunded job past its delivery deadline closes. No funds move.
(define-public (close-unfunded (job-id uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND)))
    (asserts! (is-eq (get status job) STATUS_OPEN) ERR_INVALID_STATUS)
    (asserts! (>= burn-block-height (get delivery-deadline job)) ERR_TOO_EARLY)
    (map-set jobs job-id (merge job { status: STATUS_EXPIRED }))
    (print { event: "job-expired", job-id: job-id })
    (ok true)))

;; ---------------------------------------------------------------- reputation

(define-public (rate-provider (job-id uint) (score uint))
  (let ((job (unwrap! (map-get? jobs job-id) ERR_NOT_FOUND)))
    (asserts! (is-eq (get status job) STATUS_COMPLETED) ERR_INVALID_STATUS)
    (asserts! (acts-for (get client job)) ERR_NOT_CLIENT)
    (contract-call? .nayori-reputation record-rating job-id (get client job) score)))

;; Replays an outcome the registry did not take at settlement. Anyone may call.
(define-public (retry-reputation (job-id uint))
  (let ((pending (unwrap! (map-get? reputation-pending job-id) ERR_NOTHING_PENDING)))
    (try! (contract-call? .nayori-reputation record-outcome job-id (get provider pending) (get client pending)
      (get completed pending) (get value pending)))
    (map-delete reputation-pending job-id)
    (ok true)))

;; ---------------------------------------------------------------- invariants
;; Simnet only: Clarinet strips every #[env(simnet)] definition from deployments.
;; Checked by Rendezvous after every fuzzed call (see tests/rv).

;; Shape required by Rendezvous; it writes this map through update-context.
;; #[env(simnet)]
;; #[allow(unnecessary_tuple, unused_map)]
(define-map context (string-ascii 100) { called: uint })

;; #[env(simnet)]
(define-private (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; Jobs the per-job invariants inspect; invariant-harness-capacity fails the run
;; if a campaign creates more, instead of checking fewer.
;; #[env(simnet)]
(define-constant RV_MAX_JOBS u200)
;; #[env(simnet)]
(define-constant RV_JOB_IDS (list
    u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20
    u21 u22 u23 u24 u25 u26 u27 u28 u29 u30 u31 u32 u33 u34 u35 u36 u37 u38 u39 u40
    u41 u42 u43 u44 u45 u46 u47 u48 u49 u50 u51 u52 u53 u54 u55 u56 u57 u58 u59 u60
    u61 u62 u63 u64 u65 u66 u67 u68 u69 u70 u71 u72 u73 u74 u75 u76 u77 u78 u79 u80
    u81 u82 u83 u84 u85 u86 u87 u88 u89 u90 u91 u92 u93 u94 u95 u96 u97 u98 u99 u100
    u101 u102 u103 u104 u105 u106 u107 u108 u109 u110 u111 u112 u113 u114 u115 u116 u117 u118 u119 u120
    u121 u122 u123 u124 u125 u126 u127 u128 u129 u130 u131 u132 u133 u134 u135 u136 u137 u138 u139 u140
    u141 u142 u143 u144 u145 u146 u147 u148 u149 u150 u151 u152 u153 u154 u155 u156 u157 u158 u159 u160
    u161 u162 u163 u164 u165 u166 u167 u168 u169 u170 u171 u172 u173 u174 u175 u176 u177 u178 u179 u180
    u181 u182 u183 u184 u185 u186 u187 u188 u189 u190 u191 u192 u193 u194 u195 u196 u197 u198 u199 u200))

;; #[env(simnet)]
(define-private (rv-live (status uint))
  (and (>= status STATUS_FUNDED) (<= status STATUS_DISPUTED)))

;; #[env(simnet)]
(define-private (rv-add-escrow (job-id uint) (total uint))
  (+ total (default-to u0 (map-get? escrow-balances job-id))))

;; #[env(simnet)]
(define-private (rv-job-ok (job-id uint) (all-ok bool))
  (and all-ok
    (match (map-get? jobs job-id)
      job (let ((status (get status job))
                (client (get client job))
                (evaluator (get evaluator job))
                (treasury (get treasury job))
                (authority (get appeal-authority job))
                (decision (map-get? decisions job-id)))
        (and
          (<= job-id (var-get job-counter))
          ;; budget bounds and distinct parties
          (>= (get budget job) MIN_BUDGET) (<= (get budget job) MAX_BUDGET)
          (not (is-eq client evaluator))
          (not (or (is-eq client treasury) (is-eq client authority)))
          (not (or (is-eq evaluator treasury) (is-eq evaluator authority)))
          (not (is-eq treasury authority))
          (match (get provider job) p
            (not (or (is-eq p client) (is-eq p evaluator) (is-eq p treasury) (is-eq p authority)))
            (or (is-eq status STATUS_OPEN) (is-eq status STATUS_FUNDED)
                (is-eq status STATUS_REFUNDED) (is-eq status STATUS_EXPIRED)))
          ;; escrow exists exactly while the job is live, and equals the budget
          (match (map-get? escrow-balances job-id)
            amount (and (rv-live status) (is-eq amount (get budget job)))
            (not (rv-live status)))
          ;; a submission exists exactly from submit-work on
          (is-eq (is-some (map-get? submissions job-id))
            (and (>= status STATUS_SUBMITTED) (<= status STATUS_REJECTED)))
          ;; a decision exists exactly from the decision on; disputes have an appellant
          (is-eq (is-some decision)
            (and (>= status STATUS_DECIDED) (<= status STATUS_REJECTED)))
          (match decision d
            (and (valid-decision (get decision d))
                 (if (is-eq status STATUS_DECIDED) (is-none (get appellant d)) true)
                 (if (is-eq status STATUS_DISPUTED) (is-some (get appellant d)) true))
            true)
          ;; a settled job has its outcome in the registry with the matching
          ;; result, or a pending replay; nothing else has either
          (if (or (is-eq status STATUS_COMPLETED) (is-eq status STATUS_REJECTED))
            (match (contract-call? .nayori-reputation get-outcome current-contract job-id)
              outcome (is-eq (get completed outcome) (is-eq status STATUS_COMPLETED))
              (is-some (map-get? reputation-pending job-id)))
            (and (is-none (map-get? reputation-pending job-id))
                 (is-none (contract-call? .nayori-reputation get-outcome current-contract job-id))))
          ;; a provider exists exactly once the job has been offered (or refunded/expired)
          (if (and (>= status STATUS_OFFERED) (<= status STATUS_REJECTED)) (is-some (get provider job)) true)))
      (> job-id (var-get job-counter)))))

;; The escrow's real STX balance equals the sum of live escrows.
;; #[env(simnet)]
(define-read-only (invariant-balance-equals-escrows)
  (is-eq (stx-get-balance current-contract)
         (fold rv-add-escrow RV_JOB_IDS u0)))

;; #[env(simnet)]
(define-read-only (invariant-jobs-consistent)
  (fold rv-job-ok RV_JOB_IDS true))

;; #[env(simnet)]
(define-read-only (invariant-harness-capacity)
  (<= (var-get job-counter) RV_MAX_JOBS))
