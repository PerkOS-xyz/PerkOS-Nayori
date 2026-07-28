;; Mock sBTC token, TEST HARNESS ONLY.
;; Mirrors the canonical sBTC SIP-010 shape (8 decimals, sats) so the escrow can be
;; exercised in simnet. NEVER deploy this to testnet or mainnet: the real deployments
;; point the escrow at the canonical sBTC contract instead.

(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token sbtc-token)

(define-constant ERR_NOT_SENDER (err u4))

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (is-eq tx-sender sender) ERR_NOT_SENDER)
    (try! (ft-transfer? sbtc-token amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

;; Test-only faucet
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? sbtc-token amount recipient)
)

(define-read-only (get-name) (ok "sBTC"))
(define-read-only (get-symbol) (ok "sBTC"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance sbtc-token who)))
(define-read-only (get-total-supply) (ok (ft-get-supply sbtc-token)))
(define-read-only (get-token-uri) (ok none))
