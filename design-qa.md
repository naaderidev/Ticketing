# Design QA — Landing Demo Account Cards

- Source visual truth: `C:\Users\Admin\Pictures\Screenshots\للللل.png`
- Live reference: `http://172.20.40.214:3008/cards`
- Implementation screenshot: `C:\Users\Admin\Documents\Default Project\ticketing-system\tmp\landing-cards-implementation.png`
- Implementation URL: `http://localhost:3000/`
- State: light landing page, signed out, all 12 demo-account cards visible
- Source pixels: 357 × 611 (mobile crop, 1×)
- Implementation pixels: 1264 × 930 (desktop full page, 1×)
- CSS viewport: 1264 px desktop width
- Density normalization: 1× for both captures. The source is a component-level mobile crop, so fidelity was evaluated at the card-component level while preserving the requested six-column desktop layout.

## Full-view comparison evidence

The implementation uses the same visible design language as the reference: a pale neutral canvas, white outlined cards, large colored circular icons, centered title/subtitle hierarchy, concise centered descriptions, soft elevation, generous rounded corners, and a black full-width CTA with a left arrow. The requested desktop constraint is present: exactly six cards per row and two rows for the 12 accounts.

## Focused region comparison evidence

A separate crop was not required because both the source and implementation full captures keep card typography, borders, icon treatment, CTA styling, and vertical spacing clearly readable. The implementation intentionally uses a shorter card and tighter spacing than the source because the user requested smaller cards and six columns on desktop.

## Findings

- No actionable P0/P1/P2 mismatch remains.
- Typography: Vazirmatn is used consistently; title, subtitle, body, and CTA weights preserve the reference hierarchy at the smaller desktop card size.
- Spacing and layout: card rhythm, icon-to-title spacing, description spacing, radius, border, and shadow match the reference direction. The denser six-column layout is an intentional product constraint.
- Colors and tokens: neutral background, white card surface, dark CTA, and varied saturated icon circles follow the reference palette while reusing the project theme and shadcn primitives.
- Image and icon quality: the supplied project logo remains unchanged; standard Lucide role icons remain sharp at every density and no placeholder or hand-drawn asset is used.
- Copy: account name, panel type, capability summary, and direct-login action are present without exposing mobile numbers or passwords.
- Interaction: direct login was exercised for `مشتری ۱` and `مدیر ۱`; each reached its role-specific panel without visiting the login form. No browser console warning or error was present.

## Comparison history

1. Initial implementation: CTA rendered light because the environment's media-driven dark variant conflicted with the class-based project theme. This was a P1 fidelity mismatch against the black reference CTA.
2. Fix: removed the media-sensitive dark override and bound the CTA to an explicit neutral-dark color while retaining shadcn Button behavior.
3. Post-fix evidence: `tmp/landing-cards-implementation.png` shows black CTAs on all 12 cards, with six cards per desktop row.

## Follow-up polish

- No blocking follow-up. A future content pass could give each customer card a unique capability summary if the demo personas become differentiated.

final result: passed
