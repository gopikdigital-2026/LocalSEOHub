# A3.7.4.3 — GATE B.3 — FIX02 — MANIFEST FINAL

## Verdict

**NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES FURTHER CORRECTION**

## New files

| File | SHA-256 |
|---|---|
| supabase/migrations/20261031172241_a3743_instagram_status_attempt_read_grant.sql | 71c2354572b94779b5a22b1698004fe90ad82eab0b58c5a3ed0747f2ddfdae71 |
| src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts | a45d72aac1626b69b1026734e811cc52b44abdae674a0d781ee2fbb50bbe9246 |

## Authorized re-pins

| File | Old SHA-256 | New SHA-256 |
|---|---|---|
| src/components/__tests__/a281TrustCleanup.test.ts | 2f4b6d27fd7f1d2f7851251f5a2fc3dfd71f6558be1b7dd9724e1b387d0a0a9a | 67ba5b56ce48065241d41032d74beab25c9960628f64b80c1c41fae667a3f821 |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | b7705d22de2d2cbab4bbcf06f11d004c0bb11f448fba2701ac944c3ae4e9236e | 5d849bcb2e852126ec87d49d6d1fc6a96059f6f80d497371ee90d0c5899fe462 |

## Change-scope verification

- A pre-change snapshot of 79 tracked files was re-checked with `sha256sum -c`. Only the two authorized re-pins differ.
- Every other file is byte-identical: Instagram engine, Graph transport, derivative, preflight, UI, Facebook, App.tsx and config.toml.

## Historical manifest integrity (sha256sum -c against the pre-change snapshot: all OK)

A3_7_2_FREEZE, A3_7_3_1_FREEZE, A3_7_3_3_FREEZE, A3_7_3_4_FREEZE, A3_7_4_1_FREEZE, A3_7_4_2_FREEZE, A3_7_4_2_GATE_A, A3_7_4_3_GATE_A (24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4), A3_7_4_3_GATE_B1, A3_7_4_3_GATE_B2_PART1, A3_7_4_3_GATE_B2_PART2, A3_7_4_3_GATE_B3_FIX01, A3_7_4_3_GATE_B3_FIX02 (diagnosis), A3_7_4_3_GATE_B3_PART1. All byte-identical.

## Unmodified failing governed tests (require further exception)

| File | Current SHA-256 | Needed change |
|---|---|---|
| src/features/email-verification/__tests__/f03Stage2b.test.ts | ac94b043dcc87dd2acd0d68e239f0de14d051dd24a34bcfdc7f4e021bb58b390 | L229, L283: 59 → 60 |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 300a87c8605856aaae31fd6ef666cd2f02bd0868f1ddcf45e95918bb4dde03c0 | L354: 59 → 60 |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | b5df9213adbb8ef98712b733ec88ad46e44e56d083647027bf6a2f2e446d30b1 | L131: 59 → 60 |
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | f137e0a69c496c509b2a3dcaf16df05746992112446c7ea15d79619a10a0f61d | L516 re-pin hash(es) of the two authorized files |

## Regression

- Vitest: 2,978 passed, 5 failed, 2,983 total; 84 of 88 files pass.
- tsc: 20 inherited errors, 0 new.
- Build: OK.
