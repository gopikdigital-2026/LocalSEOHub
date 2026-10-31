# A3.7.4.3 GATE B.3 — FIX02 GO MANIFEST

Date: 2026-10-31.

## Files changed in this step

| File | Previous sha256 | New sha256 |
|---|---|---|
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | 8336db4745299da460dda784ebe076bd52310ae19d076432879c4d5e90a214d9 | 4760b8f315ba110767dbbe33d6c6ac07b0cc725a8db53f7a156fc44f649f7827 |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | d1b0c3d01d0c940a75fb90484d05b9fcd6f5927a851361a219e739e3a5306327 | b1dc0995d8c2db7499dc94e48a8c6e3788cfb9e025c32b7c9136d160795ed617 |

## FIX02 artifacts (unchanged)

| File | sha256 |
|---|---|
| supabase/migrations/20261031172241_a3743_instagram_status_attempt_read_grant.sql | 71c2354572b94779b5a22b1698004fe90ad82eab0b58c5a3ed0747f2ddfdae71 |
| src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts | a45d72aac1626b69b1026734e811cc52b44abdae674a0d781ee2fbb50bbe9246 |
| src/components/__tests__/a281TrustCleanup.test.ts | 67ba5b56ce48065241d41032d74beab25c9960628f64b80c1c41fae667a3f821 |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | 5d849bcb2e852126ec87d49d6d1fc6a96059f6f80d497371ee90d0c5899fe462 |
| src/features/email-verification/__tests__/f03Stage2b.test.ts | 3b14aad6a5098895d6b1f156006048dacf2562028b86c063e175f5b8e4e44e81 |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 1225076b1f1f8a882c844e54541d7052b22f16cb45e94d7025bf7091278e9606 |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | f5b72768a745b70ea7cba7684f41fb0b30aa3e302c0719e5a5f875711b5fedf6 |

## Completed hash chain

a273 / a272 → pinned by a3741 (L520/L524) → a3741 4760b8f3… pinned by a3743InstagramGateA T36 (L782) → Gate A b1dc0995… (no test pins it; chain end).

## Historical freeze comparison (all byte-identical to ZIP 37)

| Manifest | sha256 prefix | Status |
|---|---|---|
| A3_7_2_FREEZE_MANIFEST | ced8edffe1020456 | identical |
| A3_7_3_1_FREEZE_MANIFEST | 8c97c60295c66fa9 | identical |
| A3_7_3_3_FREEZE_MANIFEST | d4a9700687fea405 | identical |
| A3_7_3_4_FREEZE_MANIFEST | 81217523283748bf | identical |
| A3_7_4_1_FREEZE_MANIFEST | ee28cd0e9f1a52e7 | identical |
| A3_7_4_2_FREEZE_MANIFEST | 34feabd3781ea3fc | identical |
| A3_7_4_2_GATE_A_MANIFEST | 6112bda74721ec6b | identical |
| A3_7_4_3_GATE_A_MANIFEST | 24c9c054c3fe5f71 | identical |
| A3_7_4_3_GATE_B1_MANIFEST | 4d2694dd8d7ecd8b | identical |
| A3_7_4_3_GATE_B2_PART1_MANIFEST | 6421dc8e521c5568 | identical |
| A3_7_4_3_GATE_B2_PART2_MANIFEST | cd50db5fc1695b81 | identical |
| A3_7_4_3_GATE_B3_PART1_MANIFEST | c3e887209c503d8c | identical |
| A3_7_4_3_GATE_B3_FIX01_MANIFEST | 2209ac279aa8caf4 | identical |
| A3_7_4_3_GATE_B3_FIX02_MANIFEST | 5e168ad1a097945e | identical |
| A3_7_4_3_GATE_B3_FIX02_MANIFEST_FINAL | 0f35d9bb8c24ebeb | identical |
| A3_7_4_3_GATE_B3_FIX02_FINAL_FREEZE_MANIFEST | 8ebc2b359e84e711 | identical |

Evidence: a full-tree sha256 comparison before and after the edits (684 files) shows only the two test files above changed.

## Regression

Vitest 2,983 / 0 failed (88 files). Targeted Instagram + Facebook + freeze subset 259 / 259. tsc 20 inherited, 0 new. Build OK.

## Verdict

GO — A3.7.4.3 GATE B.3 FIX02 FULL REGRESSION PASSED; OWNER STATUS RETEST PENDING
