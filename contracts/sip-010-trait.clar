;; SIP-010 Fungible Token Trait
;; Declared locally so the escrow contract has a network-agnostic trait reference.
;; The canonical sBTC token conforms to this shape implicitly:
;;   mainnet 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
;;   testnet 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token

(define-trait sip-010-trait
  (
    ;; Transfer from the caller to a recipient
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))

    (get-name () (response (string-ascii 32) uint))

    (get-symbol () (response (string-ascii 32) uint))

    (get-decimals () (response uint uint))

    (get-balance (principal) (response uint uint))

    (get-total-supply () (response uint uint))

    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
