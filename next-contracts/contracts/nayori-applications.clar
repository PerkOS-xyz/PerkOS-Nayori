;; nayori-applications
;; Registered agents apply to open sBTC jobs with a deposit. Each job keeps at
;; most MAX_APPLICATIONS entries, one per agent, sorted by deposit (highest
;; first, ties by arrival). When the list is full, a newcomer gets in only by
;; depositing more than the lowest entry, which is removed from the bottom and
;; refunded in the same call (the capped, sorted list of the MIA fair order
;; book). Deposits always go back to the applicant. No owner.

(define-constant SBTC 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant MIN_DEPOSIT u100)
(define-constant MAX_DEPOSIT u1000000)
(define-constant MAX_APPLICATIONS u50)

;; Escrow job statuses that still take applications: open, funded, offered.
(define-constant STATUS_OPEN u0)
(define-constant STATUS_FUNDED u1)
(define-constant STATUS_OFFERED u2)

(define-constant ERR_NOT_AUTHORIZED (err u600))
(define-constant ERR_NOT_AGENT (err u601))
(define-constant ERR_JOB_NOT_FOUND (err u602))
(define-constant ERR_NOT_ACCEPTING (err u603))
(define-constant ERR_STILL_ACCEPTING (err u604))
(define-constant ERR_INVALID_DEPOSIT (err u605))
(define-constant ERR_ALREADY_APPLIED (err u606))
(define-constant ERR_LIST_FULL (err u607))
(define-constant ERR_NOT_APPLIED (err u608))
(define-constant ERR_NOT_CLIENT (err u609))
(define-constant ERR_IS_CLIENT (err u610))
(define-constant ERR_DECLINED (err u611))
(define-constant ERR_INELIGIBLE (err u612))

(define-map applications uint (list 50 { applicant: principal, deposit: uint }))
;; Applicants the client declined; they cannot apply to that job again.
(define-map declined { job-id: uint, applicant: principal } bool)

(define-read-only (get-applications (job-id uint))
  (default-to (list) (map-get? applications job-id)))

(define-read-only (get-application (job-id uint) (applicant principal))
  (get found (fold find-step (get-applications job-id) { target: applicant, found: none })))

;; ---------------------------------------------------------------- helpers
;; The unwrap-panic calls below cannot fail: every list here holds at most
;; MAX_APPLICATIONS entries, apply-to-job makes room before inserting, and the
;; lowest entry is read only from a full (non-empty) list.

(define-private (acts-for (party principal))
  (and (is-eq tx-sender party)
       (or (is-eq contract-caller party)
           (contract-call? .nayori-permissions is-allowed party contract-caller current-contract))))

(define-private (find-step
    (entry { applicant: principal, deposit: uint })
    (acc { target: principal, found: (optional { applicant: principal, deposit: uint }) }))
  (if (is-eq (get applicant entry) (get target acc)) (merge acc { found: (some entry) }) acc))

(define-private (without-step
    (entry { applicant: principal, deposit: uint })
    (acc { target: principal, out: (list 50 { applicant: principal, deposit: uint }) }))
  (if (is-eq (get applicant entry) (get target acc))
    acc
    ;; #[allow(panic)]
    (merge acc { out: (unwrap-panic (as-max-len? (append (get out acc) entry) u50)) })))

(define-private (without (entries (list 50 { applicant: principal, deposit: uint })) (applicant principal))
  (get out (fold without-step entries { target: applicant, out: (list) })))

;; Inserts before the first entry with a strictly lower deposit, so equal
;; deposits keep their arrival order. The caller guarantees room for one more.
(define-private (insert-step
    (entry { applicant: principal, deposit: uint })
    (acc { new: { applicant: principal, deposit: uint }, placed: bool,
           out: (list 51 { applicant: principal, deposit: uint }) }))
  (if (and (not (get placed acc)) (> (get deposit (get new acc)) (get deposit entry)))
    (merge acc { placed: true,
      ;; #[allow(panic)]
      out: (unwrap-panic (as-max-len? (append (unwrap-panic (as-max-len? (append (get out acc) (get new acc)) u51)) entry) u51)) })
    ;; #[allow(panic)]
    (merge acc { out: (unwrap-panic (as-max-len? (append (get out acc) entry) u51)) })))

(define-private (insert-sorted (entries (list 50 { applicant: principal, deposit: uint }))
    (new { applicant: principal, deposit: uint }))
  (let ((res (fold insert-step entries { new: new, placed: false, out: (list) }))
        ;; #[allow(panic)]
        (out (if (get placed res) (get out res) (unwrap-panic (as-max-len? (append (get out res) new) u51)))))
    ;; #[allow(panic)]
    (unwrap-panic (as-max-len? out u50))))

(define-private (refund (amount uint) (to principal))
  (as-contract? ((with-ft SBTC "sbtc-token" amount))
    (try! (contract-call? SBTC transfer amount tx-sender to none))))

(define-private (job-of (job-id uint))
  (contract-call? .nayori-escrow-sbtc get-job job-id))

(define-private (accepting (status uint))
  (or (is-eq status STATUS_OPEN) (is-eq status STATUS_FUNDED) (is-eq status STATUS_OFFERED)))

;; ---------------------------------------------------------------- public

(define-public (apply-to-job (job-id uint) (deposit uint))
  (let ((applicant tx-sender)
        (job (unwrap! (job-of job-id) ERR_JOB_NOT_FOUND))
        (entries (get-applications job-id)))
    (asserts! (acts-for applicant) ERR_NOT_AUTHORIZED)
    (asserts! (contract-call? .nayori-agents is-registered applicant) ERR_NOT_AGENT)
    (asserts! (accepting (get status job)) ERR_NOT_ACCEPTING)
    (asserts! (not (is-eq applicant (get client job))) ERR_IS_CLIENT)
    (asserts! (not (or (is-eq applicant (get evaluator job)) (is-eq applicant (get treasury job))
      (is-eq applicant (get appeal-authority job)))) ERR_INELIGIBLE)
    (asserts! (< burn-block-height (get delivery-deadline job)) ERR_NOT_ACCEPTING)
    (asserts! (is-none (map-get? declined { job-id: job-id, applicant: applicant })) ERR_DECLINED)
    (asserts! (and (>= deposit MIN_DEPOSIT) (<= deposit MAX_DEPOSIT)) ERR_INVALID_DEPOSIT)
    (asserts! (is-none (get-application job-id applicant)) ERR_ALREADY_APPLIED)
    (try! (contract-call? SBTC transfer deposit applicant current-contract none))
    (let ((room (if (< (len entries) MAX_APPLICATIONS)
            entries
            ;; #[allow(panic)]
            (let ((lowest (unwrap-panic (element-at? entries (- (len entries) u1)))))
              (asserts! (> deposit (get deposit lowest)) ERR_LIST_FULL)
              (try! (refund (get deposit lowest) (get applicant lowest)))
              (print { event: "application-displaced", job-id: job-id,
                applicant: (get applicant lowest), refunded: (get deposit lowest) })
              (without entries (get applicant lowest))))))
      (map-set applications job-id (insert-sorted room { applicant: applicant, deposit: deposit })))
    (print { event: "applied", job-id: job-id, applicant: applicant, deposit: deposit })
    (ok true)))

(define-private (remove-and-refund (job-id uint) (applicant principal))
  (let ((entries (get-applications job-id))
        (entry (unwrap! (get-application job-id applicant) ERR_NOT_APPLIED)))
    (try! (refund (get deposit entry) applicant))
    (map-set applications job-id (without entries applicant))
    (print { event: "application-refunded", job-id: job-id, applicant: applicant, deposit: (get deposit entry) })
    (ok true)))

(define-public (withdraw (job-id uint))
  (begin
    (asserts! (acts-for tx-sender) ERR_NOT_AUTHORIZED)
    (remove-and-refund job-id tx-sender)))

(define-public (decline (job-id uint) (applicant principal))
  (let ((job (unwrap! (job-of job-id) ERR_JOB_NOT_FOUND)))
    (asserts! (acts-for (get client job)) ERR_NOT_CLIENT)
    (map-set declined { job-id: job-id, applicant: applicant } true)
    (remove-and-refund job-id applicant)))

;; Once a job stops taking applications, anyone returns a remaining deposit.
(define-public (release (job-id uint) (applicant principal))
  (let ((job (unwrap! (job-of job-id) ERR_JOB_NOT_FOUND)))
    (asserts! (not (accepting (get status job))) ERR_STILL_ACCEPTING)
    (remove-and-refund job-id applicant)))



;; ---------------------------------------------------------------- invariants
;; Simnet only: Clarinet strips every #[env(simnet)] definition from deployments.

;; Shape required by Rendezvous; it writes this map through update-context.
;; #[env(simnet)]
;; #[allow(unnecessary_tuple, unused_map)]
(define-map context (string-ascii 100) { called: uint })

;; #[env(simnet)]
(define-private (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

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
(define-private (rv-add-deposits (job-id uint) (total uint))
  (fold rv-add-deposit (get-applications job-id) total))

;; #[env(simnet)]
(define-private (rv-add-deposit (entry { applicant: principal, deposit: uint }) (total uint))
  (+ total (get deposit entry)))

;; Sorted by deposit (non-increasing), deposits within bounds, one per agent.
;; #[env(simnet)]
(define-private (rv-entry-step
    (entry { applicant: principal, deposit: uint })
    (acc { ok: bool, prev: uint, seen: (list 50 principal) }))
  { ok: (and (get ok acc)
             (<= (get deposit entry) (get prev acc))
             (>= (get deposit entry) MIN_DEPOSIT)
             (<= (get deposit entry) MAX_DEPOSIT)
             (is-none (index-of? (get seen acc) (get applicant entry)))),
    prev: (get deposit entry),
    ;; #[allow(panic)]
    seen: (unwrap-panic (as-max-len? (append (get seen acc) (get applicant entry)) u50)) })

;; #[env(simnet)]
(define-private (rv-list-ok (job-id uint) (all-ok bool))
  (let ((entries (get-applications job-id)))
    (and all-ok
         (<= (len entries) MAX_APPLICATIONS)
         (get ok (fold rv-entry-step entries { ok: true, prev: MAX_DEPOSIT, seen: (list) })))))

;; The contract's real sBTC balance equals the sum of active deposits.
;; #[env(simnet)]
(define-read-only (invariant-balance-equals-deposits)
  ;; #[allow(panic)]
  (is-eq (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
         (fold rv-add-deposits RV_JOB_IDS u0)))

;; #[env(simnet)]
(define-read-only (invariant-lists-well-formed)
  (fold rv-list-ok RV_JOB_IDS true))
