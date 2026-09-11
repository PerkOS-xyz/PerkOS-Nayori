;; SIMNET ONLY: fault injection for the second leg of fee settlement.
;; Never use or deploy this token on a public network.
(impl-trait .sip-010-trait.sip-010-trait)
(define-fungible-token sbtc-token)
(define-data-var rejected-recipient (optional principal) none)
(define-data-var return-false bool false)

(define-public (set-rejected-recipient (recipient (optional principal)))
  (begin (var-set rejected-recipient recipient) (ok true)))
(define-public (set-return-false (enabled bool))
  (begin (var-set return-false enabled) (ok true)))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) (err u4))
    (if (is-eq (some recipient) (var-get rejected-recipient))
      (if (var-get return-false) (ok false) (err u77))
      (begin (try! (ft-transfer? sbtc-token amount sender recipient)) (ok true)))
  ))
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? sbtc-token amount recipient))
(define-read-only (get-name) (ok "sBTC fault injection"))
(define-read-only (get-symbol) (ok "sBTC"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance sbtc-token who)))
(define-read-only (get-total-supply) (ok (ft-get-supply sbtc-token)))
(define-read-only (get-token-uri) (ok none))
