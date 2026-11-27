# Paystack legacy signature compatibility

Paystack may send both `Paystack-Signature` and `X-Paystack-Signature` even when the operator has no separate webhook signing credentials. With an empty modern-key list, the previous verifier treated the unconfigured modern header as authoritative and rejected an otherwise authentic legacy HMAC.

The verifier selects the modern mechanism only when a modern key is configured. Otherwise, the explicit legacy opt-in verifies HMAC-SHA512 over the exact original raw bytes with the configured mode's API secret, using constant-time comparison. Missing, malformed, wrong-key and altered-body signatures still fail. If any modern key is configured, an invalid modern header still cannot fall back to legacy.

No allocation, provider-verification, reference, amount, NGN, payment-status, immutable-evidence or unique-ledger behavior changes. LIVE legacy configuration additionally requires every existing production origin, callback, activation, webhook and finalization gate, and a matching LIVE secret. It remains disabled by default. No schema, dependency or frontend changes are included.

Some Paystack dashboards expose only Secret/Public Key and webhook/callback URL fields in LIVE as well as TEST. Supporting the documented `X-Paystack-Signature` mechanism in that configuration does not activate live payments: production resources, credentials, runtime flags and any real-money test require separate operator approval. Keep `PAYSTACK_WEBHOOK_SIGNING_KEYS=[]` explicit when no modern signing keys are configured. TEST and LIVE credentials and webhook inbox environments remain separate.

The regression reproduces the former failure, and the HTTP/database suite runs raw-byte authentication and concurrent duplicate delivery for modern-only, legacy-only and legacy-with-unconfigured-modern headers. Tests use synthetic credentials and a guarded disposable localhost database; hosted provider acceptance must be reported separately.
