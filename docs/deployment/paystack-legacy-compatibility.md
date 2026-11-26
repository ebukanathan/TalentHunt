# Paystack TEST legacy signature compatibility

Paystack may send both `Paystack-Signature` and `X-Paystack-Signature` even when the operator has no separate webhook signing credentials. With an empty modern-key list, the previous verifier treated the unconfigured modern header as authoritative and rejected an otherwise authentic legacy HMAC.

The verifier now selects the modern mechanism only when a modern key is configured. Otherwise, the existing explicit TEST-only legacy opt-in verifies HMAC-SHA512 over the exact original raw bytes with the configured TEST API secret, using constant-time comparison. Missing, malformed, wrong-key and altered-body signatures still fail. If any modern key is configured, an invalid modern header still cannot fall back to legacy.

No allocation, provider-verification, reference, amount, NGN, payment-status, immutable-evidence or unique-ledger behavior changes. The legacy option remains forbidden for live mode. No schema, dependency or frontend changes are included.

The regression reproduces the former failure, and the HTTP/database suite runs raw-byte authentication and concurrent duplicate delivery for modern-only, legacy-only and legacy-with-unconfigured-modern headers. Tests use synthetic credentials and a guarded disposable localhost database; hosted provider acceptance must be reported separately.
