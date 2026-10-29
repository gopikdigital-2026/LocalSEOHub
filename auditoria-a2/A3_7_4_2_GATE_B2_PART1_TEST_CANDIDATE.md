# A3.7.4.2 — GATE B.2 PART 1 — TEST CANDIDATE PREPARATION

Date: 2026-10-29
Status: **MANUEL ACTION REQUIRED — A3.7.4.2 GATE B.2 PART 1 REQUIRES TEST C INPUT/SELECTION**

No Facebook write, no Instagram write, no arming, no attempt created, no source change.

## A–G. Candidate C
Not yet created. `publications` holds 12 rows, all created on or before 2026-10-28 09:12 UTC. None qualifies:
- A and B are frozen and excluded.
- The remaining 10 have 0 drafts and predate this gate.

C must be created by Manuel through the existing pipeline. The agent does not choose images, fabricate rows or write captions.

## H–K. Real Meta connection (read-only recheck)
- Single row, status `connected`; Page Localseohub.io, ID 1393994523793266.
- Permissions: business_management, instagram_basic, instagram_content_publish, pages_manage_posts, pages_read_engagement, pages_show_list, public_profile.
- page_tasks: ADVERTISE, ANALYZE, CREATE_CONTENT, MANAGE, MANAGE_LEADS, MESSAGING, MODERATE.
- publishing_consent_at: 2026-10-29 18:06:07 UTC. last_error NULL, revocation_status NULL.
- Pending consent states: 0.

## L. PAGE_TOKEN_READY
`DEFERRED_TO_CONTROLLED_PUBLISH_PATH`. The Page token is derived only inside the armed `facebook_publish` path. No read-only route exists, and none was added.

## M. APPSECRET_PROOF_READY
true. The 18:06 callback calls to `/me/permissions` and `/me/accounts` carried the proof and both succeeded. META_APP_SECRET is configured. The value was never read.

## N. Preflight
Not run: no candidate exists. `publication_publish_preflight` is a read-only RPC; it will be run against C once C exists.

## O–P. Attempts
- C: n/a.
- Global `publication_publish_attempts`: 0.

## Q. Idempotency identity
Pending: `pub:<C_id>:facebook:v<draft_version>` once C exists.

## R–T. Arming / writes
- META_FACEBOOK_REAL_PUBLISH_ARMED: absent.
- META_FACEBOOK_REAL_PUBLISH_USER_IDS: absent.
- REAL_FACEBOOK_PUBLISH_ARMED = false.
- 0 calls to /photos, /feed, /media or /media_publish.
- 0 Facebook posts, 0 Instagram posts.

## U. Preserved A/B
| Publication | Status | Updated at | Drafts md5 |
|---|---|---|---|
| A 65569535-5d89-4df3-a8d4-c2af6df8606d | proposals_ready | 2026-10-27 23:05:19 | 5b7366bfcaa8e008b1ba5b38138bf8dd |
| B 442059e5-11e4-4bdd-a5bc-c714b0a03b72 | proposals_ready | 2026-10-28 12:27:05 | fd3e4f7a51725b58fced11e3ef4975ac |

Both are unchanged since B.1.

## V. Regression
No source change in this step. Last run: 2854/2854 tests (82 files); tsc 20 inherited errors, 0 new.

## W. Part 2 plan (not executed)
1. Revalidate C, its draft version and its fingerprints against this report.
2. Revalidate the Meta connection, permission and Page task.
3. Manuel sets arming for his UUID only.
4. Begin the attempt transactionally.
5. Persist the attempt state before the external write.
6. Derive the Page token server-side.
7. Generate appsecret_proof server-side.
8. Load C's private image server-side.
9. Make exactly one POST /1393994523793266/photos.
10. Capture the Meta post ID.
11. Read back the result.
12. Mark SUCCEEDED only on authoritative success.
13. Mark UNKNOWN otherwise, with no blind retry.
14. Disarm immediately.
15. Verify the public post.
16. Confirm Instagram was untouched.

## X. Findings
None.

UX risk noted: the test screen exposes "Eliminar prueba" on any open publication, so Manuel must not open A or B there.
