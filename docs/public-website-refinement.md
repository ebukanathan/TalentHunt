# Public website refinement

Parent issue: #42. Payment implementation remains paused. This work is stacked on leaderboard privacy PR #48; no PR is merged automatically.

## Design and navigation (#49)

Keep the navy/gold palette, serif headings and Geist body text. Public CSS tokens define surfaces, control borders, spacing, label/body sizes and corner radius. Buttons and paging links share focus and touch-target styles. Reduced-motion support remains enabled.

The main navigation uses a disclosure on small screens, with expanded state, active-page indication and Escape returning focus to the menu button. Tab can leave the disclosure without a focus trap. Changing routes closes it. A no-JavaScript fallback keeps navigation available. Route skeletons announce the requested content. Leaderboard overflow is a named, focusable region with a semantic table.

Manual acceptance: at 320, 360, 390, 768 and 1440px, check the header, footer, listing, profile and leaderboard for overflow and readable wrapping; repeat at 200% zoom. Tab/Shift+Tab through the menu, Enter/Space to toggle, Escape to close and restore focus, and follow a link then use Back. Check reduced motion and keyboard scrolling in a wide leaderboard. Browser evidence is recorded separately from source/component tests.
