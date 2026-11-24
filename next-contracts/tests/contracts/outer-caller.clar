;; Test-only. An unrelated contract the client signs a call to; it routes through
;; the forwarder the client allowed earlier.
(define-public (innocent-action (job-id uint) (provider principal))
  (contract-call? .phishing-forwarder forward-name-provider job-id provider))
