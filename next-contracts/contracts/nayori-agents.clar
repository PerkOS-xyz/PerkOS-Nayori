;; nayori-agents
;; Agent identity. An agent's wallet is the principal that registers it (as
;; tx-sender, directly or through a contract it allowed in
;; nayori-permissions), with one agent per wallet. No owner.

(define-constant ERR_NOT_AUTHORIZED (err u500))
(define-constant ERR_ALREADY_REGISTERED (err u501))
(define-constant ERR_NOT_REGISTERED (err u502))
(define-constant ERR_INVALID_NAME (err u503))

(define-data-var agent-count uint u0)

(define-map agents principal { name: (string-ascii 64), uri: (string-ascii 256), registered-at: uint })

(define-read-only (get-agent (wallet principal))
  (map-get? agents wallet))

(define-read-only (is-registered (wallet principal))
  (is-some (map-get? agents wallet)))

(define-read-only (get-agent-count)
  (var-get agent-count))

(define-private (acts-for (party principal))
  (and (is-eq tx-sender party)
       (or (is-eq contract-caller party)
           (contract-call? .nayori-permissions is-allowed party contract-caller current-contract))))

(define-public (register (name (string-ascii 64)) (uri (string-ascii 256)))
  (begin
    (asserts! (acts-for tx-sender) ERR_NOT_AUTHORIZED)
    (asserts! (> (len name) u0) ERR_INVALID_NAME)
    (asserts! (is-none (map-get? agents tx-sender)) ERR_ALREADY_REGISTERED)
    (map-set agents tx-sender { name: name, uri: uri, registered-at: burn-block-height })
    (var-set agent-count (+ (var-get agent-count) u1))
    (print { event: "agent-registered", wallet: tx-sender, name: name, uri: uri })
    (ok true)))

(define-public (update (name (string-ascii 64)) (uri (string-ascii 256)))
  (let ((agent (unwrap! (map-get? agents tx-sender) ERR_NOT_REGISTERED)))
    (asserts! (acts-for tx-sender) ERR_NOT_AUTHORIZED)
    (asserts! (> (len name) u0) ERR_INVALID_NAME)
    (map-set agents tx-sender (merge agent { name: name, uri: uri }))
    (print { event: "agent-updated", wallet: tx-sender, name: name, uri: uri })
    (ok true)))
