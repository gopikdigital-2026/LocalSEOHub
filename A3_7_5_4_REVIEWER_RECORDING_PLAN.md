# A3.7.5.4 — Meta Reviewer Recording Plan

General precautions (all recordings): dedicated reviewer LocalSEOHub account (no real customer data); dedicated test Facebook Page owned by the owner's Business portfolio; linked test Instagram professional account; reviewer Meta user given a role on the app (or app in Live mode with Standard access test); browser at desktop width, language set; no tokens, URLs with `code=`/`#token=` or emails visible (callback clears the URL); record in one take per permission; real API results only.

Test assets needed (owner provides): reviewer email/password, test business "LocalSEOHub Review Demo", test Page, test IG professional account, one approved test photo.

| # | Permissions | Steps & screens | Expected visible result | Real API? | Possible today? |
|---|---|---|---|---|---|
| R1 | `pages_show_list`, `business_management`, (`public_profile`) | Login → `/fuentes` → open "Which permissions do we request?" → Connect → Meta dialog (show requested permissions) → choose test Page in Meta → return → Page selection dialog | Card shows Facebook: test Page · Active | Yes (`/me/accounts`) | YES in production for app-role users, but the permission explanation needs the A3.7.5.3 deploy |
| R2 | `instagram_basic` | Continue from R1 → card shows Instagram @handle · Active → `/herramientas/social` → IG section | IG username, followers/media counts, recent media with likes/comments | Yes (`/{ig}`, `/{ig}/media`) | YES (app-role users) |
| R3 | `pages_read_engagement` | `/herramientas/social` → sync → Facebook section | Page followers, recent published posts with reaction/comment counts, derived findings | Yes (`/{page}`, `/{page}/published_posts`) | YES (app-role users) |
| R4 | `pages_manage_posts` | Customer content flow: upload test photo → choose proposal → review Facebook text → explicit "Publish to Facebook" confirmation → result with link → open Page showing the post | Real post on the test Page; history row "Published" with timestamp/permalink | **Yes, real publication** | **NO**: customer flow missing; arming absent |
| R5 | `instagram_content_publish` | Same as R4 for Instagram | Real post on test IG; history row | **Yes, real publication** | **NO** (same) |
| R6 | Disconnect (data deletion evidence) | `/fuentes` → Disconnect → confirm | Card returns to Not connected | Yes (revocation) | YES |
| — | `instagram_manage_insights` | No recording: remove from submission | — | — | Not applicable |

## Preconditions for R4/R5 (real publications)
1. Implementation steps P2–P4 of the minimal plan completed, tested, and deployed with owner approval.
2. Separate written owner authorization for a time-boxed arming window, naming the reviewer user UUID, the test Page/IG and (IG) exact publication UUIDs.
3. Only the test photo; captions free of personal data; recorded once; arming secrets deleted immediately after; production read-only verification that no other attempts occurred.
4. If Meta reviewers must reproduce publishing themselves, a second window is required for the duration of the review with the same constraints; otherwise submit the screencast plus written test instructions.

Never use simulated results or recordings of the internal harness presented as the customer product.
