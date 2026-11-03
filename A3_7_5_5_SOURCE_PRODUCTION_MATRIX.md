# A3.7.5.5 — Source vs Production Matrix

Legend: PRESENT / ABSENT / SAME. "Production" means the live frontend plus the live Supabase project, checked read-only.

## Deployment state

| Layer | Current source | Production | Comparison |
|---|---|---|---|
| Frontend (src/) | A3.7.5.2 FIX01 (byte-identical to deliverables/localseohub-a3752-fix01-tenant-security.zip) | A3.7.5.2 FIX01 (A3.7.5.3 never deployed) | SAME |
| A3.7.5.3 frontend changes | ABSENT (reverted) | NOT DEPLOYED | Nothing to deploy |
| supabase/functions | identical to A3.7.5.2 package | 44 functions ACTIVE, incl. meta-oauth-start, meta-oauth-callback, meta-connection, meta-read, meta-publishing, instagram-publishing, internal-access | SAME (no function changes in A3.7.5.3) |
| supabase/migrations | latest 20261101230430_a3752_meta_account_tenant_uniqueness | 61 applied, latest 20261101230430 | SAME |

## Feature matrix

| Capability | Expected after A3.7.5.3 | Current source | Production | Evidence |
|---|---|---|---|---|
| Meta OAuth start (4 read scopes, auth_type=rerequest) | present | PRESENT | PRESENT | meta-oauth-start/handler.ts:9, :95 |
| Callback, page permission check | present | PRESENT | PRESENT | meta-oauth-callback/handler.ts:87, :346 |
| Facebook Page selection modal | present + focus/Escape a11y | PRESENT, without A3.7.5.3 a11y | PRESENT, without a11y | MetaPageSelectModal.tsx hash e615d053… |
| Linked Instagram discovery | present | PRESENT | PRESENT | callback page/IG lookup; a3521 tests pass |
| Page/IG one-tenant uniqueness | present | PRESENT | PRESENT | migration 20261101230430, a3752 tests |
| Reconnect / reauth / error states | present | PRESENT | PRESENT | metaStatus.ts, a3512MetaRecovery tests |
| Permission explanation (PermissionsDisclosure) | present | ABSENT | ABSENT | grep → 0 matches |
| Per-channel FB/IG status chips | present | ABSENT | ABSENT | grep StatusChip → 0 |
| Publishing-consent control limited to operator | present | ABSENT (visible to any connected customer) | ABSENT | no checkInternalAccess in MetaConnectionCard |
| Internal validation route /internal/publications-validation | InternalGuard | PRESENT, guarded | PRESENT, guarded | App.tsx InternalGuard + internal-access fn (ADMIN_EMAIL) |
| Real FB/IG publishing | disabled | gated server-side | DISABLED (no arming secrets) | see security verification |
| Customer publishing UI / history | not in scope | ABSENT | ABSENT | — |

## Unrelated functionality

The `src/` and `supabase/` trees are identical to the approved A3.7.5.2 FIX01 package, so no unrelated change has been introduced. The 20 TypeScript errors match the known baseline.

## Incompatibilities

None between the current source and production. The two are the same. When the A3.7.5.3 source is restored, it needs no migration, function or secret change: A3.7.5.3 changed frontend files only, and it reads `checkInternalAccess()` from the already-deployed internal-access function.
