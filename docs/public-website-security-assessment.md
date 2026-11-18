# Framework security assessment

Assessed 18 November 2026 (Africa/Lagos), issue #53. The installed Next.js version is 16.4.2. Production commands emit a known-vulnerability notice; an identical retry completes without suppressing the notice. Passing builds and application tests do not establish that the framework is patched.

The official [16.4.5 release](https://github.com/vercel/next.js/releases/tag/v16.4.5) contains November security fixes. Review and upgrade Next.js and its matching ESLint configuration in a separate feature branch before production release, then rerun public HTTP/privacy, image, authentication and production-build regressions. Verify the appropriate current patched version when doing that upgrade. This refinement does not change framework versions or payment processing.

Relevant observations, distinguished from an exploit assessment:

- [SVG rejection bypass](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2) affects the installed version and is patched in 16.4.5. The new optimiser uses an exact managed origin, WebP-only paths, no query/redirect/local-IP fetching, and sanitised backend WebP uploads. These limit accepted assets; they do not replace the framework fix.
- [Fallback-shell cache poisoning](https://github.com/vercel/next.js/security/advisories/GHSA-vvgp-ww4w-46vf) lists `partialPrefetching: true` as a workaround. This repository already enables it. Public data remains request-time/no-store, and no application `use cache`/`unstable_cache` calls were found in this inspection. That is a source observation, not proof against every caching advisory.
- [Edge cookie exposure](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2) concerns cookies set on Edge routes. No Edge runtime routes were found here; protected session handling remains on the existing Node/Express path. Recheck runtime/deployment configuration during upgrade.

The assessment covers the observed build notice and these directly relevant advisories. It is not a penetration test or an exhaustive dependency audit. No exploit, real provider request, production deployment or hosted-data mutation was performed.
