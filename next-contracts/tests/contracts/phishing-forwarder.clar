;; Test-only. Forwards party actions from a contract the party calls. They
;; must fail unless the party allowed this contract in nayori-permissions.
(define-public (forward-name-provider (job-id uint) (provider principal))
  (contract-call? .nayori-escrow-sbtc name-provider job-id provider))
(define-public (forward-fund (job-id uint))
  (contract-call? .nayori-escrow-sbtc fund-job job-id))
(define-public (forward-decision (job-id uint))
  (contract-call? .nayori-escrow-sbtc record-decision job-id u1
    0x0101010101010101010101010101010101010101010101010101010101010101))
(define-public (forward-appeal (job-id uint))
  (contract-call? .nayori-escrow-sbtc appeal job-id
    0x0202020202020202020202020202020202020202020202020202020202020202))
(define-public (forward-rating (job-id uint))
  (contract-call? .nayori-escrow-sbtc rate-provider job-id u5))
(define-public (forward-handover (candidate principal))
  (contract-call? .nayori-roles propose-handover u1 candidate))

;; Composition: two actions in one call.
(define-public (forward-two-offers (job-a uint) (job-b uint) (provider principal))
  (begin
    (try! (contract-call? .nayori-escrow-sbtc name-provider job-a provider))
    (contract-call? .nayori-escrow-sbtc name-provider job-b provider)))
;; A contract must not be able to grant itself permission.
(define-public (forward-allow-self)
  (contract-call? .nayori-permissions allow-contract-caller current-contract .nayori-escrow-sbtc none))

;; Composition: one agent applies to two jobs in one call.
(define-public (forward-two-applications (job-a uint) (job-b uint) (deposit uint))
  (begin
    (try! (contract-call? .nayori-applications apply-to-job job-a deposit))
    (contract-call? .nayori-applications apply-to-job job-b deposit)))

(define-public (forward-fund-stx (job-id uint))
  (contract-call? .nayori-escrow-stx fund-job job-id))
(define-public (forward-decision-stx (job-id uint))
  (contract-call? .nayori-escrow-stx record-decision job-id u1
    0x0101010101010101010101010101010101010101010101010101010101010101))
