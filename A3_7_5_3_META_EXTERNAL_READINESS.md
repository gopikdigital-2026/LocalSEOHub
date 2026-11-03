# A3.7.5.3 — Meta External Readiness

No Meta App setting was read or changed, and no permission was requested. The project has no access to the Meta App Dashboard, so anything not evidenced in the repo is UNKNOWN.

| Item | Status | Evidence / note |
|---|---|---|
| App mode (Development vs Live) | UNKNOWN | No dashboard evidence in the repo. In Development mode only users with an app role can authorize. |
| Requested scopes | KNOWN | `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic` (code) |
| Access level per scope | UNKNOWN | Prior audits (A3.5.x) state Standard Access only works for app-role users; Advanced Access is needed for external customers. No approval evidence. |
| App Review | REQUIRED, status UNKNOWN | Needed for Advanced Access on all four scopes. NOT claimed as approved. |
| Business Verification | REQUIRED, status UNKNOWN | Prerequisite for Advanced Access. |
| External customer eligibility | BLOCKED until Live + Advanced Access | Code path is ready; external users will see a Meta-side error or empty Page list otherwise. |
| Page requirements | KNOWN | User must have a role on a Facebook Page and grant it in the Meta dialog; otherwise NO_AUTHORIZED_PAGES. |
| IG requirements | KNOWN | IG must be a professional (Business/Creator) account linked to the selected Page; otherwise shown as unavailable while Facebook stays connected. |
| `instagram_basic` | RISK, UNKNOWN | Prior audits flag this scope as potentially restricted for new reviews; owner should confirm in the Meta dashboard before submitting App Review. |
| Publishing scopes | NOT REQUESTED | `pages_manage_posts` / `instagram_content_publish` not in the commercial flow; publishing disabled. |
| Privacy policy / data deletion | PRESENT | Legal pages reference the Meta card and disconnect (a3551). |

Owner actions (manual, outside the code): confirm app mode, Business Verification, and submit App Review for the four read scopes, with a screencast of the connection flow from `/fuentes`.
