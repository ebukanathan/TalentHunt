# Public website refinement

Parent issue: #42. Payment implementation remains paused. This work is stacked on leaderboard privacy PR #48; no PR is merged automatically.

## Design and navigation (#49)

Keep the navy/gold palette, serif headings and Geist body text. Public CSS tokens define surfaces, control borders, spacing, label/body sizes and corner radius. Buttons and paging links share focus and touch-target styles. Reduced-motion support remains enabled.

The main navigation uses a disclosure on small screens, with expanded state, active-page indication and Escape returning focus to the menu button. Tab can leave the disclosure without a focus trap. Changing routes closes it. A no-JavaScript fallback keeps navigation available. Route skeletons announce the requested content. Leaderboard overflow is a named, focusable region with a semantic table.

Manual acceptance: at 320, 360, 390, 768 and 1440px, check the header, footer, listing, profile and leaderboard for overflow and readable wrapping; repeat at 200% zoom. Tab/Shift+Tab through the menu, Enter/Space to toggle, Escape to close and restore focus, and follow a link then use Back. Check reduced motion and keyboard scrolling in a wide leaderboard. Browser evidence is recorded separately from source/component tests.

## Public images and video (#50)

Set `NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN` to the public Supabase HTTPS origin at build time. It contains no secret. Next Image permits only that exact origin and the public `contestant-images/contestants/**` bucket path, with no query parameters or redirects. Local-IP fetching and SVG are disabled. The renderer only optimises canonical managed WebP object keys; legacy HTTPS images remain browser-only. Missing/failed images retain their named fallback.

Hero/profile images load eagerly with high fetch priority; cards/thumbnails and YouTube players remain lazy. Portrait variants provide responsive sizes and intrinsic dimensions. Videos continue to use validated IDs, descriptive titles and `youtube-nocookie.com` in responsive 16:9 frames; no submitted video URL is fetched by the backend.

Manual acceptance: inspect image requests at mobile/desktop sizes with the configured origin; managed portraits should request `/_next/image` variants, legacy portraits should request their original URL, and failed portraits should show the fallback. With network throttling, confirm above-fold portraits start early and offscreen players defer loading. Test zero, one and two videos, keyboard/fullscreen playback and blocked third-party requests. Do not use admin storage secrets in public configuration.
