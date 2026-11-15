;; ============================================
;; Rendezvous harness (test only, never deployed)
;; ============================================
;; rv-sync.sh appends this file to the real sbtc-commerce-v5 source. The top
;; of the generated contract is the deployed code with one test-only patch
;; (review window 12 -> 144 burn blocks, see README.md); everything below this
;; line exists only in the fuzzing project.
;;
;; Setup at deploy: the protocol is initialized with the mainnet appeal window
;; (144 burn blocks), the default token is the mock sBTC, the escrow is an authorized caller of
;; reputation-registry-v3, and every fuzz wallet holds both mock tokens.
;;
;; The contract owner (deployer) is not a fuzz caller (rv.config.json), so
;; owner-only administration is exercised only as unauthorized attempts.
;; Two-step owner and appeal-authority handover are covered by the unit tests.

;; ---- rendezvous invariant-mode bookkeeping ----------------------------------

(define-map context (string-ascii 100) { called: uint })

(define-private (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))

;; ---- fixtures ---------------------------------------------------------------

(define-constant RV_DEPLOYER 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM)
(define-constant RV_ESCROW 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-commerce-v5)
(define-constant RV_TOKEN 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-sbtc-token)
(define-constant RV_TOKEN_ALT 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-sbtc-token-alt)
(define-constant RV_APPEAL_AUTHORITY 'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0)
(define-constant RV_TREASURY 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ)
(define-constant RV_WALLETS (list
  'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
  'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0
  'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ))
(define-constant RV_WALLET_SATS u1000000000)
;; Jobs the per-job invariants inspect. invariant-harness-capacity fails the
;; run if a campaign creates more, instead of silently checking fewer.
(define-constant RV_MAX_JOBS u400)
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
    u181 u182 u183 u184 u185 u186 u187 u188 u189 u190 u191 u192 u193 u194 u195 u196 u197 u198 u199 u200
    u201 u202 u203 u204 u205 u206 u207 u208 u209 u210 u211 u212 u213 u214 u215 u216 u217 u218 u219 u220
    u221 u222 u223 u224 u225 u226 u227 u228 u229 u230 u231 u232 u233 u234 u235 u236 u237 u238 u239 u240
    u241 u242 u243 u244 u245 u246 u247 u248 u249 u250 u251 u252 u253 u254 u255 u256 u257 u258 u259 u260
    u261 u262 u263 u264 u265 u266 u267 u268 u269 u270 u271 u272 u273 u274 u275 u276 u277 u278 u279 u280
    u281 u282 u283 u284 u285 u286 u287 u288 u289 u290 u291 u292 u293 u294 u295 u296 u297 u298 u299 u300
    u301 u302 u303 u304 u305 u306 u307 u308 u309 u310 u311 u312 u313 u314 u315 u316 u317 u318 u319 u320
    u321 u322 u323 u324 u325 u326 u327 u328 u329 u330 u331 u332 u333 u334 u335 u336 u337 u338 u339 u340
    u341 u342 u343 u344 u345 u346 u347 u348 u349 u350 u351 u352 u353 u354 u355 u356 u357 u358 u359 u360
    u361 u362 u363 u364 u365 u366 u367 u368 u369 u370 u371 u372 u373 u374 u375 u376 u377 u378 u379 u380
    u381 u382 u383 u384 u385 u386 u387 u388 u389 u390 u391 u392 u393 u394 u395 u396 u397 u398 u399 u400))

(define-private (rv-mint (who principal) (minted bool))
  (and minted
    (is-ok (contract-call? .mock-sbtc-token mint RV_WALLET_SATS who))
    (is-ok (contract-call? .mock-sbtc-token-alt mint RV_WALLET_SATS who))))

(begin
  (unwrap-panic (initialize-protocol MAINNET_APPEAL_WINDOW_BURN_BLOCKS RV_APPEAL_AUTHORITY RV_TREASURY))
  (unwrap-panic (set-payment-token RV_TOKEN))
  (unwrap-panic (contract-call? .reputation-registry-v3 add-protocol-caller RV_ESCROW))
  (unwrap-panic (if (fold rv-mint RV_WALLETS true) (ok true) (err u0))))

;; rv dialers get no simnet handle; dialers.js reads the chain height from this
;; result to pick expiries the escrow can actually reach. No state changes.
(define-public (rv-clock)
  (ok block-height))

;; ---- helpers ----------------------------------------------------------------

(define-private (rv-live (status uint))
  (or (is-eq status STATUS_FUNDED) (is-eq status STATUS_SUBMITTED)
      (is-eq status STATUS_DECISION_PENDING) (is-eq status STATUS_DISPUTED)))

(define-private (rv-final (status uint))
  (or (is-eq status STATUS_COMPLETED) (is-eq status STATUS_REJECTED)))

(define-private (rv-decided (status uint))
  (or (is-eq status STATUS_DECISION_PENDING) (is-eq status STATUS_DISPUTED) (rv-final status)))

(define-private (rv-escrow-for-token (job-id uint) (acc { token: principal, total: uint }))
  (if (is-eq (map-get? job-payment-tokens job-id) (some (get token acc)))
    (merge acc { total: (+ (get total acc) (default-to u0 (map-get? escrow-balances job-id))) })
    acc))

(define-private (rv-escrowed (token principal))
  (get total (fold rv-escrow-for-token RV_JOB_IDS { token: token, total: u0 })))

(define-private (rv-add-balance (who principal) (total uint))
  (+ total (unwrap-panic (contract-call? .mock-sbtc-token get-balance who))))

;; Escrow exists exactly while the job is live, equals the budget and has a pinned token.
(define-private (rv-job-escrow-ok (job-id uint) (status uint) (budget uint))
  (match (map-get? escrow-balances job-id)
    amount (and (rv-live status) (> amount u0) (is-eq amount budget)
                (is-some (map-get? job-payment-tokens job-id)))
    (not (rv-live status))))

;; Client, provider, evaluator, appeal authority and treasury are distinct.
(define-private (rv-job-parties-ok
    (client principal) (provider (optional principal)) (evaluator principal)
    (authority principal) (treasury principal))
  (and
    (not (is-eq client evaluator)) (not (is-eq client authority)) (not (is-eq client treasury))
    (not (is-eq evaluator authority)) (not (is-eq evaluator treasury))
    (not (is-eq authority treasury))
    (match provider p
      (and (not (is-eq p client)) (not (is-eq p evaluator))
           (not (is-eq p authority)) (not (is-eq p treasury)))
      true)))

;; A decision exists exactly from the evaluator's decision on; only the losing
;; side appeals; a final decision exists exactly when the job is settled and
;; matches the status; without an appeal it equals the original decision.
(define-private (rv-job-decision-ok
    (job-id uint) (status uint) (client principal) (provider (optional principal)))
  (match (map-get? decisions job-id)
    d (and (rv-decided status)
           (is-valid-decision (get original-decision d))
           (if (is-eq status STATUS_DISPUTED) (is-some (get appealed-by d)) true)
           (if (is-eq status STATUS_DECISION_PENDING) (is-none (get appealed-by d)) true)
           (match (get appealed-by d) appellant
             (is-eq (some appellant)
               (if (is-eq (get original-decision d) DECISION_APPROVE) (some client) provider))
             true)
           (is-eq (is-some (get final-decision d)) (rv-final status))
           (match (get final-decision d) final
             (and (is-eq final (if (is-eq status STATUS_COMPLETED) DECISION_APPROVE DECISION_REJECT))
                  (or (is-some (get appealed-by d)) (is-eq final (get original-decision d))))
             true))
    (and (not (rv-decided status))
         (is-none (map-get? service-fee-waivers job-id)))))

;; Settled once, only for a decided job: gross = budget = net + fee, the fee is
;; 2% (or 0 under a waiver), the right party is paid, refunds never exceed the
;; fee and need a waiver. Timeout and expiry never record a fee settlement.
(define-private (rv-job-settlement-ok
    (job-id uint) (status uint) (budget uint) (client principal)
    (provider (optional principal)) (treasury principal))
  (match (map-get? service-fee-settlements job-id)
    s (and (rv-final status)
           (is-eq (get gross s) budget)
           (is-eq (+ (get net s) (get charged-fee s)) (get gross s))
           (or (is-eq (get charged-fee s) u0)
               (is-eq (get charged-fee s) (/ (get gross s) SERVICE_FEE_DIVISOR)))
           (or (is-eq (get charged-fee s) (/ (get gross s) SERVICE_FEE_DIVISOR))
               (is-some (map-get? service-fee-waivers job-id)))
           (is-eq (some (get recipient s)) (if (is-eq status STATUS_COMPLETED) provider (some client)))
           (not (is-eq (get recipient s) treasury))
           (<= (get refunded-fee s) (get charged-fee s))
           (or (is-eq (get refunded-fee s) u0) (is-some (map-get? service-fee-waivers job-id))))
    (not (rv-final status))))

;; Ratings only on completed jobs; reputation is synced exactly once per settled
;; job, with the matching outcome, and is never left pending here because the
;; escrow is an authorized registry caller.
(define-private (rv-job-reputation-ok
    (job-id uint) (status uint) (client principal) (evaluator principal))
  (and
    (if (or (has-rated-job job-id client) (has-rated-job job-id evaluator))
      (is-eq status STATUS_COMPLETED)
      true)
    (match (map-get? reputation-sync job-id)
      r (and (rv-final status)
             (not (get pending r))
             (is-eq (get outcome r) (if (is-eq status STATUS_COMPLETED) OUTCOME_COMPLETED OUTCOME_DISPUTED))
             (is-ok (contract-call? .reputation-registry-v3 get-job-outcome RV_ESCROW job-id)))
      (and (not (rv-final status))
           (is-err (contract-call? .reputation-registry-v3 get-job-outcome RV_ESCROW job-id))))))

(define-private (rv-check-job (job-id uint) (all-ok bool))
  (and all-ok
    (match (map-get? jobs job-id)
      job (and
        (<= job-id (var-get job-counter))
        (rv-job-escrow-ok job-id (get status job) (get budget job))
        (rv-job-parties-ok (get client job) (get provider job) (get evaluator job)
          (get appeal-authority job) (get treasury job))
        (rv-job-decision-ok job-id (get status job) (get client job) (get provider job))
        (rv-job-settlement-ok job-id (get status job) (get budget job) (get client job)
          (get provider job) (get treasury job))
        (rv-job-reputation-ok job-id (get status job) (get client job) (get evaluator job)))
      (> job-id (var-get job-counter)))))

;; ---- invariants -------------------------------------------------------------

;; The escrow holds exactly the sum of live escrows, per token: nothing is
;; paid twice, nothing is stranded and the second token never enters.
(define-read-only (invariant-escrow-equals-token-balance)
  (and
    (is-eq (unwrap-panic (contract-call? .mock-sbtc-token get-balance RV_ESCROW))
           (rv-escrowed RV_TOKEN))
    (is-eq (unwrap-panic (contract-call? .mock-sbtc-token-alt get-balance RV_ESCROW))
           (rv-escrowed RV_TOKEN_ALT))))

;; No sats leave the set of job parties: wallets plus escrow always hold the
;; whole supply minted at deploy.
(define-read-only (invariant-sbtc-conserved)
  (is-eq
    (+ (fold rv-add-balance RV_WALLETS u0)
       (unwrap-panic (contract-call? .mock-sbtc-token get-balance RV_ESCROW)))
    (unwrap-panic (contract-call? .mock-sbtc-token get-total-supply))))

;; Every job satisfies the escrow, roles, decision, fee and reputation rules above.
(define-read-only (invariant-jobs-consistent)
  (fold rv-check-job RV_JOB_IDS true))

;; Non-owners cannot change the owner, the default token, the appeal authority
;; or the treasury, and the three roles stay distinct.
(define-read-only (invariant-roles-stable)
  (and
    (var-get protocol-configured)
    (is-eq (var-get contract-owner) RV_DEPLOYER)
    (is-eq (var-get payment-token) RV_TOKEN)
    (is-eq (var-get appeal-authority) RV_APPEAL_AUTHORITY)
    (is-eq (var-get service-treasury) RV_TREASURY)
    (is-eq (var-get appeal-window-burn-blocks) MAINNET_APPEAL_WINDOW_BURN_BLOCKS)))

(define-read-only (invariant-harness-capacity)
  (<= (var-get job-counter) RV_MAX_JOBS))

;; ---- properties (rv test) ---------------------------------------------------

;; The quoted 2% fee is floor(gross / 50) and fee + net always equals gross.
(define-private (test-service-fee-split (gross uint))
  (let ((q (unwrap-panic (get-service-fee-for-amount gross))))
    (asserts! (is-eq (+ (get fee q) (get net q)) gross) (err u1))
    (asserts! (<= (* (get fee q) SERVICE_FEE_DIVISOR) gross) (err u2))
    (asserts! (< gross (* (+ (get fee q) u1) SERVICE_FEE_DIVISOR)) (err u3))
    (ok true)))
