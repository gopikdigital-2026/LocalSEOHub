# A3.7.5.5 — Commercial Meta Connection — Pre-Deploy Audit

Mode: read-only. No deployment, publishing, secret change, migration or source modification.
Date: 2026-11-03. Baseline: A3.7.5.4 audit.

## Verdict

**NO-GO — DEPLOYMENT BLOCKERS REQUIRE CORRECTION**

## Blocker B1 (critical): approved A3.7.5.3 source is not present

The workspace has been reverted to the A3.7.5.2 FIX01 state. The A3.7.5.3 reports and A3.7.5.4 reports still exist in the root, but the code they describe does not.

| File | Approved A3.7.5.3 SHA-256 | Current SHA-256 | Match |
|---|---|---|---|
| src/features/meta-connection/MetaConnectionCard.tsx | 3729892653ebfdba30f89d70c2e5f37790f2a340c4c99479939bee75c7a9b064 | 8e3d9265e6f1cdb4f19861562de92b9cd71c957354a8578003bbc51a1515b7cc | NO |
| src/features/meta-connection/metaStatus.ts | 50845c8d1b85d2bed1a65d34e8ddbf8b9d98aa3620ef7b8f280adb08e9b31c73 | c2615204659166500345771fbf90f001b9097a047e925af141b89c91f4f51ad6 | NO |
| src/features/meta-connection/MetaPageSelectModal.tsx | e4e5b66a372e97c84c8c246e8c6c3aba4aa9dd64ec45098cf02b27891de61dc1 | e615d053ad73ad1e89dd5db7b08340894993906676419a40b7cbed30f5dbc39d | NO |
| src/features/meta-connection/MetaCallbackPage.tsx | 5bfc455450d14345fd7fc2e1a1181b43fc572559e1d11516ad3a9b310b26dbf1 | 10ad1772397214a03e8e0486d9c1f2a949259b75c8eaae6b930fd473faa14520 | NO |
| src/features/meta-connection/__tests__/a3753CommercialConnection.test.tsx | da754befec158efc121eb9b74b83a1f0f123274c950c1914a1fbf178fdd2c04a | file absent | NO |

Evidence:
- `diff -rq src <A3.7.5.2 FIX01 package>/src` → no differences. `supabase/` → no differences.
- `grep PermissionsDisclosure|StatusChip|checkInternalAccess|permissionsTitle` in MetaConnectionCard.tsx / metaStatus.ts → 0 matches.
- `deliverables/localseohub-a3753-commercial-meta-connection.zip` and `deliverables/localseohub-a3754-meta-app-review-audit.zip` are absent; only the a3743 and a3752 packages remain.
- Test totals dropped from 3118 (92 files) to 3098 (91 files) — exactly the 20 A3.7.5.3 tests.

Consequence: deploying the current frontend would ship A3.7.5.2 FIX01, i.e. what production already runs. Without the permissions explanation, per-channel status chips and operator gating of the publishing-consent control, the A3.7.5.3 objective is not met. The A3.7.5.4 recording R1 (permission explanation) remains impossible.

Likely cause: an earlier version was restored from Version History after A3.7.5.4. That must be confirmed by the owner. It was not modified in this phase per "no source modifications".

## What remains true (current source = production)

- Facebook Page selection and linked Instagram discovery: present (A3.5.1/A3.5.2.1 flow, MetaPageSelectModal, meta-oauth-callback PAGE_PERMISSIONS).
- Reconnect, reauth_required and error states: present (metaStatus.ts, a3512 recovery).
- Permission explanations and per-channel status chips: ABSENT.
- Publishing-consent control in /fuentes: shown to any connected customer (A3.7.5.2 behaviour). Server still blocks real publishing — see the security verification.

## Safety (unchanged, PASS)

Publishing disabled server-side; 0 active entitlements; no new attempts since 2026-11-01 21:07:27Z; frozen engines hash 58956f46…7606 unchanged. Details: A3_7_5_5_SECURITY_VERIFICATION.md.

## Verification

| Check | Result |
|---|---|
| Full suite | 91 files, 3098/3098 pass |
| Meta + publishing + access subset | 30 files, 1006/1006 pass |
| Build | pass |
| TypeScript | 20 errors, all pre-existing (see below), 0 new |

Pre-existing TS errors (unchanged baseline): LandingPage.tsx 10, BusinessAuditLanding.tsx 2, ContentGeneratorLanding.tsx 2, MetaAdsLanding.tsx 2, App.tsx 1, DiagnosticLanding.tsx 1, AdminDashboard.tsx 1, a3422GbpRecovery.test.ts 1. None in Meta or publishing files.

## Correction required before GO

1. Restore the A3.7.5.3 source. Either restore the Version History entry that contains it, or re-apply the A3.7.5.3 changes in an authorized implementation phase.
2. Re-verify the five SHA-256 values above, or record new approved hashes if re-implemented.
3. Re-run this pre-deploy audit, then follow A3_7_5_5_DEPLOYMENT_RUNBOOK.md.
