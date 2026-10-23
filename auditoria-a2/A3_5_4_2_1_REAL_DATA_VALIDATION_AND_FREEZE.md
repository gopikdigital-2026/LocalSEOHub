# A3.5.4.2.1 — SOCIAL FINDINGS & RECOMMENDATIONS REAL-DATA VALIDATION & FREEZE

Modo: AUDITORÍA FINAL / READ-ONLY. No se ha modificado código, mensajes, políticas, datos, migraciones ni despliegues. No se ha ejecutado sync con Meta. Los scripts de ejecución fueron temporales (dentro del proyecto, `.a35421-tmp/`) y se eliminaron tras su uso. A3.5.4.3 y A3.5.4.4 no se han implementado.

---

## 1. Executive verdict

**GO — FREEZE A3.5.4.2**

La cadena completa `datos A3.5.3 → SocialSignalsReport (a3541-1) → SocialFindingsReport (a3542-1)` produce, sobre el snapshot real de producción, exactamente los 6 findings esperados (con la variante INTERMEDIATE en lugar de RECENT por el `evaluatedAt` real, tal y como prevé la especificación), 3 recomendaciones seguras, 0 HIGH, 0 MEDIUM, trazabilidad 19/19 y salida determinista byte a byte. Los 14 escenarios de fixtures (stale, errores técnicos, cross-platform, gate UNSUPPORTED) cumplen el contrato. No se ha detectado ningún defecto.

## 2. Production snapshot

Lectura read-only (SELECT sobre `meta_content_items`, `meta_sync_state`, `meta_connections`). `db_now = 2026-10-22T22:31:43.303Z`.

| Plataforma | Item | Tipo | published_at (UTC) | has_text | reactions | comments |
|---|---|---|---|---|---|---|
| facebook | 1 | photo | 2026-10-14 22:07:47 | false | NULL | NULL |
| facebook | 2 | photo | 2026-10-14 22:12:35 | false | NULL | NULL |
| facebook | 3 | photo | 2026-10-14 22:27:37 | true | NULL | NULL |
| instagram | 1 | image | 2026-10-14 22:26:26 | true | 0 | 0 |

| Plataforma | sync status | error_code | item_count | last_success_at |
|---|---|---|---|---|
| facebook | ok | null | 3 | 2026-10-22T17:22:26.633Z |
| instagram | ok | null | 1 | 2026-10-22T17:22:26.696Z |

Conexión: `status = connected`, `instagram_status = connected`.

- FB: 3 posts, 2 sin texto, reacciones/comentarios NULL — confirmado.
- IG: 1 post, caption presente, 0/0 ceros reales — confirmado.
- `evaluatedAt` explícito utilizado: **2026-10-22T22:31:43.303Z** (= db_now). Ambas plataformas FRESH (5 h desde el último éxito).

## 3. Provenance

- A3.5.4.2 consume únicamente `SocialSignalsReport`; sólo contiene `import type` desde `../types` (contrato congelado) y módulos locales; `copy.ts` importa `type Lang` de `lib/i18n`.
- Sin acceso a tablas Meta, supabase, `fetch`, `.from(`, `.rpc(`, Graph API (grep sobre fuentes y test 39/40).
- Gate de versión: si `engineVersion !== 'a3541-1'` lanza `UNSUPPORTED_SIGNALS_ENGINE_VERSION`.
- Ejecución real: signals `a3541-1`, findings `a3542-1`, `evaluatedAt` propagado.
- Toda evidencia de finding es subconjunto exacto de la evidencia de la señal origen: 11/11 entradas `match=true`.

## 4. Real findings

`evaluatedAt = 2026-10-22T22:31:43.303Z` (8 días completos desde el último post → INTERMEDIATE; no se ha forzado RECENT).

| findingKey | platform | status | priority | sufficiency | sourceSignals | recommendationKeys |
|---|---|---|---|---|---|---|
| FACEBOOK_TEXT_MISSING | facebook | ACTIVE | LOW | LIMITED | FB_CONTENT_TEXT_MISSING | REVIEW_POSTS_WITHOUT_TEXT |
| FACEBOOK_LIMITED_HISTORY | facebook | INSUFFICIENT_DATA | INFO | INSUFFICIENT | FB_FREQUENCY_OBSERVED, FB_CONTENT_TYPE_VARIETY | WAIT_FOR_MORE_HISTORY |
| INSTAGRAM_LIMITED_HISTORY | instagram | INSUFFICIENT_DATA | INFO | INSUFFICIENT | IG_FREQUENCY_OBSERVED, IG_CONTENT_TYPE_VARIETY, IG_ENGAGEMENT_DATA_AVAILABLE | WAIT_FOR_MORE_HISTORY |
| FACEBOOK_INTERMEDIATE_ACTIVITY | facebook | INFORMATIONAL | INFO | SUFFICIENT | FB_RECENT_ACTIVITY, FB_LONG_INACTIVITY | — |
| INSTAGRAM_INTERMEDIATE_ACTIVITY | instagram | INFORMATIONAL | INFO | SUFFICIENT | IG_RECENT_ACTIVITY, IG_LONG_INACTIVITY | — |
| FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE | facebook | NOT_AVAILABLE | INFO | NOT_AVAILABLE | FB_ENGAGEMENT_DATA_AVAILABLE | — |

Variante RECENT: con `evaluatedAt = 2026-10-22T18:52:47.824Z` (ejecución previa) y en el test de datos reales a 18:00Z, la salida es idéntica salvo `FACEBOOK_RECENT_ACTIVITY` / `INSTAGRAM_RECENT_ACTIVITY` (fuente única `*_RECENT_ACTIVITY`, 7 días). El test real cubre 18:00Z y 22:30Z.

## 5. Real recommendations

| recommendationKey | findingKey | safetyClass | priority | actionType | evidenceRefs |
|---|---|---|---|---|---|
| REVIEW_POSTS_WITHOUT_TEXT | FACEBOOK_TEXT_MISSING | DIRECT | LOW | REVIEW | FB_CONTENT_TEXT_MISSING |
| WAIT_FOR_MORE_HISTORY | FACEBOOK_LIMITED_HISTORY | DIRECT | INFO | WAIT_FOR_MORE_DATA | FB_FREQUENCY_OBSERVED, FB_CONTENT_TYPE_VARIETY |
| WAIT_FOR_MORE_HISTORY | INSTAGRAM_LIMITED_HISTORY | DIRECT | INFO | WAIT_FOR_MORE_DATA | IG_FREQUENCY_OBSERVED, IG_CONTENT_TYPE_VARIETY, IG_ENGAGEMENT_DATA_AVAILABLE |

Sin CONSIDER_NEW_CONTENT, REFRESH_DATA ni CONNECT en datos reales (correcto: datos frescos, conectado, sin inactividad larga).

## 6. Facebook text finding

- Params `{postsWithoutText: 2, observedPostCount: 3}`; evidencia `{observedPostCount 3, postsWithText 1, postsWithoutText 2, sampleSufficiency LIMITED}` → evidencia 2/3/1 confirmada.
- LOW porque la suficiencia es LIMITED (MEDIUM sólo con SUFFICIENT).
- ES: "Parte del contenido observado en Facebook no incluye texto: 2 de 3 publicaciones."
- EN: "Some of the content observed on Facebook has no text: 2 of 3 posts."
- Recomendación DIRECT / REVIEW / LOW: "Revisa si las publicaciones sin texto (2) necesitan unas palabras que expliquen o den contexto al contenido." — no promete resultados, alcance ni interacción.

## 7. Limited-history handling

- D2 agrupa por plataforma los findings INSUFFICIENT_DATA:
  - FB: FREQUENCY_INSUFFICIENT `{postsWithTimestamp 3, observedSpanDays 0}` + CONTENT_TYPE_INSUFFICIENT `{observedPostCount 3}`.
  - IG: FREQUENCY + CONTENT_TYPE + ENGAGEMENT_SAMPLE_INSUFFICIENT `{availableEngagementCount 1, eligibleEngagementCount 1}`.
- `groupedFindings` conserva key + params de cada sub-finding; sourceSignals = unión; trace marca las fuentes como GROUPED → LIMITED_HISTORY.
- Copy: "…aún no podemos evaluar algunos aspectos. Esto describe los límites del análisis, no la situación de tu negocio."
- WAIT_FOR_MORE_HISTORY: "El análisis será más completo a medida que se sincronicen más publicaciones." — significa literalmente esperar más datos; actionType WAIT_FOR_MORE_DATA, prioridad INFO.

## 8. Engagement semantics

- FB: `reactionTotal null, commentTotal null, availableEngagementCount 0, reactionNullCount 3` → señal NOT_AVAILABLE → finding `FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE` NOT_AVAILABLE/INFO, sin recomendación. NULL no se convierte en 0 en ningún punto de la cadena.
- IG: `reactionTotal 0, commentTotal 0, availableEngagementCount 1` (ceros reales) → INSUFFICIENT (muestra 1) → agrupado en LIMITED_HISTORY. Ningún finding ni texto afirma "low engagement"/"engagement bajo".
- Copy FB: "Meta no ha proporcionado suficientes métricas de interacción…" — atribuye la ausencia a la fuente, no al negocio.

## 9. Activity semantics

- RECENT e INTERMEDIATE: INFORMATIONAL / INFO, sin recomendaciones (ALLOWED_ACTIONS INFORMATIONAL = ∅).
- INTERMEDIATE ES: "La última publicación observada es de hace 8 días completos. No se considera actividad reciente ni una inactividad prolongada."
- LONG_INACTIVITY (fixture): ACTIVE / MEDIUM → CONSIDER_NEW_CONTENT CONTEXTUAL / PLAN / LOW (capado por maxPriority), con texto condicional: "Si {platform} forma parte de tu estrategia activa, puedes valorar planificar contenido nuevo."

## 10. Stale handling

| Fixture | Findings | Recomendaciones |
|---|---|---|
| STALE_FB (FB last_success 20 d) | FACEBOOK_DATA_STALE STALE/LOW; IG normal | REFRESH_DATA facebook DIRECT/REFRESH_DATA/LOW |
| STALE_BOTH (9 d y 10 d) | CROSS_PLATFORM_DATA_STALE STALE/LOW (D1) | REFRESH_DATA cross_platform DIRECT/REFRESH_DATA/LOW |

- `lastKnownStatus` no se utiliza: en STALE_FB las señales FB_LONG_INACTIVITY, IG_ONLY_RECENT_ACTIVITY y PLATFORM_RECENCY_DIFFERENCE tenían `lastKnownStatus = DETECTED` y **no** generaron findings de inactividad ni cross-platform; en STALE_BOTH, FB/IG_RECENT_ACTIVITY con `lastKnownStatus DETECTED` tampoco.
- Una plataforma stale emite un único finding DATA_STALE; trace 19/19, 0 sin explicar, 0 referencias colgantes.

## 11. REFRESH_DATA decision

| Estado | Recomendación | actionType | Verificado |
|---|---|---|---|
| STALE | REFRESH_DATA | REFRESH_DATA | fixtures STALE_FB / STALE_BOTH |
| NEVER_SYNCED | REFRESH_DATA | REFRESH_DATA | NEVER_SYNCED_IG / NEVER_SYNCED_BOTH |
| REAUTH_REQUIRED | RECONNECT_META | CONNECT | REAUTH |
| PERMISSION_UNAVAILABLE | REVIEW_META_PERMISSIONS | CONNECT (según contrato) | PERMISSION_IG |
| NOT_CONNECTED / NOT_LINKED | CONNECT_PLATFORM | CONNECT | NOT_CONNECTED / NOT_LINKED_IG |
| RATE_LIMITED / SYNC_ERROR | RETRY_LATER | WAIT_FOR_MORE_DATA | RATE_LIMITED_IG / SYNC_ERROR_IG |

CONNECT nunca aparece cuando sólo hace falta actualizar datos. Copy REFRESH_DATA: "Actualiza los datos antes de sacar conclusiones sobre la situación actual."

## 12. Technical errors

| Fixture | blockedReason | Findings plataforma bloqueada | Findings de negocio en plataforma bloqueada |
|---|---|---|---|
| REAUTH | REAUTH_REQUIRED / REAUTH_REQUIRED | CROSS_PLATFORM_ACCESS_REAUTH_REQUIRED (MEDIUM) | 0 |
| RATE_LIMITED_IG | — / RATE_LIMITED | INSTAGRAM_ACCESS_RATE_LIMITED (INFO) | 0 |
| PERMISSION_IG | — / PERMISSION_UNAVAILABLE | INSTAGRAM_ACCESS_PERMISSION_UNAVAILABLE (LOW) | 0 |
| SYNC_ERROR_IG | — / SYNC_ERROR | INSTAGRAM_ACCESS_SYNC_ERROR (INFO) | 0 |
| NOT_CONNECTED | NOT_CONNECTED ×2 | CROSS_PLATFORM_ACCESS_NOT_CONNECTED (INFO) | 0 |
| NOT_LINKED_IG | — / NOT_LINKED | INSTAGRAM_ACCESS_NOT_LINKED (INFO) | 0 |
| NEVER_SYNCED_IG | — / NEVER_SYNCED | INSTAGRAM_ACCESS_NEVER_SYNCED (INFO) | 0 |
| NEVER_SYNCED_BOTH | NEVER_SYNCED ×2 | CROSS_PLATFORM_ACCESS_NEVER_SYNCED (INFO) | 0 |

En los fixtures IG con error, IG tenía un post de hace 200 días en la tabla: no se generó LONG_INACTIVITY para IG (sólo finding de acceso). La plataforma sana continúa evaluándose normalmente.

## 13. Cross-platform

| Fixture | Finding | Texto ES |
|---|---|---|
| FB_ONLY_RECENT (2 d / 15 d) | CROSS_PLATFORM_FB_ONLY_RECENT INFORMATIONAL/INFO | "Se ha observado actividad reciente en Facebook (hace 2 días), pero no actividad reciente equivalente en Instagram (hace 15 días)." |
| IG_ONLY_RECENT (15 d / 2 d) | CROSS_PLATFORM_IG_ONLY_RECENT INFORMATIONAL/INFO | simétrico |
| RECENCY_DIFFERENCE (40 d / 3 d) | CROSS_PLATFORM_RECENCY_DIFFERENCE INFORMATIONAL/INFO | "Última publicación observada: Facebook hace 40 días, Instagram hace 3 días (37 días de diferencia). Solo describe fechas." |

Sin recomendaciones cross-platform, sin comparación de rendimiento. D3 verificado: en RECENCY_DIFFERENCE no aparece IG_ONLY_RECENT (absorbido).

## 14. Unsupported gate

7 claves UNSUPPORTED: POST_MORE_OFTEN, SWITCH_TO_REELS, PLATFORM_PERFORMANCE_COMPARISON, SALES_UPLIFT, COMPETITOR_COMPARISON, BEST_TIME_TO_POST, FORMAT_ENGAGEMENT_UPLIFT.

- actionType null, `missingData` documentado, 0 textos de usuario (withCopy = 0).
- `resolveRecommendation` devuelve null para UNSUPPORTED; ninguna aparece en datos reales ni en los 16 escenarios ejecutados ni en los 14 del suite.

## 15. Priority audit

- Datos reales: 0 HIGH, 0 MEDIUM, 1 LOW (FACEBOOK_TEXT_MISSING / REVIEW_POSTS_WITHOUT_TEXT), resto INFO.
- No existe ninguna regla HIGH en TOPIC_POLICY.
- MEDIUM sólo en LONG_INACTIVITY, TEXT/CAPTION_MISSING con SUFFICIENT, ACCESS_REAUTH_REQUIRED.
- Prioridad de recomendación = min(prioridad finding, maxPriority): CONSIDER_NEW_CONTENT LOW sobre finding MEDIUM verificado.

## 16. Sufficiency

Valores categóricos (SUFFICIENT / LIMITED / INSUFFICIENT / NOT_AVAILABLE). Ningún porcentaje, ratio ni puntuación en findings, recomendaciones ni copy (búsqueda `%` en copy: 0 coincidencias).

## 17. Deduplication

- D1: STALE_BOTH → CROSS_PLATFORM_DATA_STALE; REAUTH / NOT_CONNECTED / NEVER_SYNCED_BOTH → finding de acceso cross_platform único.
- D2: FB (2) e IG (3) INSUFFICIENT → LIMITED_HISTORY.
- D3: RECENCY_DIFFERENCE absorbe FB_ONLY / IG_ONLY.
- FACEBOOK_TEXT_MISSING (ACTIVE / LIMITED) **no** es absorbido en LIMITED_HISTORY: D2 sólo agrupa status INSUFFICIENT_DATA.

## 18. Trace coverage

Datos reales: 19/19 señales con disposición.

| Disposición | Señales |
|---|---|
| FINDING (6) | FB_RECENT_ACTIVITY, FB_LONG_INACTIVITY, FB_CONTENT_TEXT_MISSING, FB_ENGAGEMENT_DATA_AVAILABLE, IG_RECENT_ACTIVITY, IG_LONG_INACTIVITY |
| GROUPED (5) | FB_FREQUENCY_OBSERVED, FB_CONTENT_TYPE_VARIETY, IG_FREQUENCY_OBSERVED, IG_CONTENT_TYPE_VARIETY, IG_ENGAGEMENT_DATA_AVAILABLE |
| NO_FINDING (8) | FB_NO_CONTENT, IG_NO_CONTENT, IG_CAPTION_MISSING, FB_TREND, IG_TREND, FB_ONLY_RECENT_ACTIVITY, IG_ONLY_RECENT_ACTIVITY, PLATFORM_RECENCY_DIFFERENCE |

(FINDING = 6 señales, GROUPED = 5, NO_FINDING = 8; total 19.) TREND = NOT_AVAILABLE → NO_FINDING. En los 14 fixtures: trace = 19, 0 NO_FINDING con estado distinto de NOT_DETECTED/NOT_AVAILABLE, 0 findingKey colgantes.

## 19. Evidence traceability

- Cada finding referencia sus `sourceSignals`; cada recomendación tiene `evidenceRefs = sourceSignals` del finding.
- 11/11 entradas de evidencia coinciden exactamente con la evidencia de la señal origen.
- Sin IDs externos, texto de posts ni tokens en la salida (§25).

## 20. Determinism

- Ejecución 1 vs 2 (mismo SignalsReport clonado): idéntico byte a byte.
- Ejecución 1 vs 3 (snapshot clonado → signals → findings recalculados): idéntico byte a byte (10 313 bytes).
- 14 fixtures: `det=true` en todos.
- Sin `Date.now`, `new Date()` ni `Math.random` en fuentes de findings; orden por prioridad → categoría → plataforma → key.

## 21. i18n

ES 61 claves, EN 61 claves, diferencia 0; placeholders idénticos en todos los pares. Todos los mensajes reales renderizados en ambos idiomas sin placeholders sin resolver.

## 22. Copy safety

Búsqueda sobre los 122 textos visibles: ventas/sales, conversi*, competidor/competitor, benchmark, reach/alcance, impression/impresión, trend/tendencia, score/puntuación, rating, health/salud, ranking, posicionamiento, low engagement, engagement bajo, estrellas/stars, %, debes/you must, garantiza/guarantee, IA/AI → **0 coincidencias**.

Claves internas que contienen "ENGAGEMENT" o "TREND" (FB_ENGAGEMENT_DATA_AVAILABLE, FB_TREND, FORMAT_ENGAGEMENT_UPLIFT…) son identificadores internos, no texto visible; el test 34 excluye sourceSignals/evidenceRefs antes de validar.

## 23. Social Score / AI audit

Sin Social Score, sin puntuaciones agregadas, sin llamadas a IA/LLM (grep openai/anthropic/gpt-/prompt/functions.invoke: 0 en fuentes; test 37).

## 24. Persistence

Motor puro: sin supabase, `.insert/.upsert/.rpc`, localStorage, sessionStorage, indexedDB. Migraciones: 49, última `20261022170523_a353_meta_sync_claim_min_interval.sql` (A3.5.3) — ninguna nueva. Sin edge functions nuevas.

## 25. Security / privacy

Salida real sin external IDs, `text_content`, `access_token`, referencias Graph ni texto de posts (verificado sobre JSON: todas `false`). Sin secretos ni `import.meta.env`. Ninguna escritura ni sync realizada durante la auditoría.

## 26. Frozen A3.5.4.1 integrity

| Archivo | md5 | sha256 |
|---|---|---|
| engine.ts | a088e2e9a6dd720f47ae70046abc8e73 | 457d613c24f768c0faec6219890aee3154d9dbf659ef9c9782ee11fb319f5fef |
| policy.ts | 9a2b024cc333912d508d92d6a3aabdaf | 45604a0cfa549fc198751dccf5a4676b27e32200ef1d63e5ceb5c91b041a9f07 |
| signals.ts | 7d2a19a406dc1b86d3eb425967c37c5a | c9aaf99d719c1537208e90b19d7af9b187da840ec6ca79f4b9dc8311ecbdf0ed |
| types.ts | b9e9509c2289ef8011bf8a98da86917b | 2061f89f166f9333f44693944a798cd0af43dfe1d77ba4036ec44c1b849b5808 |
| __tests__/a3541SocialSignals.test.ts | c91ccc294a8ff24fdc0867c31b3acc13 | — |

Todos intactos (test 38 los verifica en cada ejecución).

## 27. Product integration boundaries

- Ningún archivo fuera de `src/features/social-intelligence/` importa el módulo (grep: sólo el propio test).
- No está en el bundle de producción (`FACEBOOK_TEXT_MISSING`, `social.rec.REFRESH_DATA`, `a3542-1`: ausentes en `dist/assets`).
- Sin UI, sin React, sin integración con action-layer / today-intelligence / business-advisor / digital-twin / weekly / roadmap.

## 28. Specific tests

`src/features/social-intelligence/findings`: **59 / 59** (baseline 59). `src/features/social-intelligence`: **138 / 138**.

Huellas md5 del módulo A3.5.4.2 que se congela:

| Archivo | Líneas | md5 |
|---|---|---|
| findings/types.ts | 109 | 06e724e679c4de177b2cf1ca00ccbaa6 |
| findings/policy.ts | 92 | 8f40dfbe7480c1cb7d43876f7396a623 |
| findings/rules.ts | 239 | 2dbf1084d04d7855f8fd476054a351ee |
| findings/engine.ts | 178 | b923294cce5e86d0356a0a639fd261d9 |
| findings/copy.ts | 153 | 5c2c0e33acf23897acdb04f463c1f339 |
| findings/__tests__/a3542SocialFindings.test.ts | 620 | 25e8e1cebfc4457e01b7615f6f17d9b1 |

## 29. Full regression

60 archivos, **2189 / 2189** tests (baseline 2189). 0 fallos.

## 30. TypeScript

`tsc --noEmit -p tsconfig.app.json`: **20 errores legacy, 0 nuevos** — LandingPage 10, BusinessAuditLanding 2, ContentGeneratorLanding 2, MetaAdsLanding 2, App 1, DiagnosticLanding 1, AdminDashboard 1, a3422GbpRecovery.test 1. Ninguno en social-intelligence.

## 31. Production build

`npm run build`: OK (✓ built). Módulo ausente del bundle (§27).

## 32. Findings

Defectos: **ninguno**.

Observaciones no bloqueantes:
1. Con el `evaluatedAt` real (db_now) la actividad es INTERMEDIATE (8 días completos); RECENT sólo antes de cumplirse 8 días (verificado a 18:00Z / 18:52Z). Comportamiento correcto; no se ha forzado.
2. REVIEW_META_PERMISSIONS usa actionType CONNECT — permitido "según contrato".
3. NEVER_SYNCED → REFRESH_DATA con prioridad INFO, STALE → LOW: coherente (sin datos previos no hay conclusiones obsoletas que corregir).
4. Las señales cross pasan a STALE cuando una plataforma lo está; su `lastKnownStatus` (DETECTED) se ignora correctamente.
5. Los textos DATA_STALE fijan "7 días/7 days"; el test vincula el valor a `FRESHNESS_POLICY.agingMaxHours / 24`. Si en el futuro cambia la política, el test fallará intencionadamente.

## 33. Freeze decision

Criterios: snapshot confirmado ✓ · provenance ✓ · 6 findings esperados (variante INTERMEDIATE válida) ✓ · recomendación de texto DIRECT/REVIEW/LOW ✓ · limited history ✓ · NULL ≠ 0 ✓ · actividad informativa ✓ · stale → REFRESH_DATA sin lastKnownStatus ✓ · errores técnicos sólo acceso ✓ · cross factual ✓ · gate UNSUPPORTED ✓ · 0 HIGH / 0 MEDIUM ✓ · sin porcentajes ✓ · D1/D2/D3 ✓ · trace 19/19 ✓ · determinismo ✓ · i18n ✓ · copy safety ✓ · sin Score/IA/persistencia/secretos ✓ · A3.5.4.1 intacto ✓ · sin integración ✓ · tests 59 / 2189 ✓ · tsc 20/0 ✓ · build ✓.

**Decisión: FREEZE A3.5.4.2.**

## 34. Exact frozen scope

Congelado en `src/features/social-intelligence/findings/` (huellas §28), engineVersion `a3542-1`, sobre signals `a3541-1`:

- Contratos `SocialFinding`, `SocialRecommendation`, `SocialFindingsReport` y modelo de trazabilidad (FINDING / GROUPED / COVERED / NO_FINDING, `absorbedInto`, evidenceRefs = sourceSignals).
- Safety classes (DIRECT / CONTEXTUAL / UNSUPPORTED) y RECOMMENDATION_CATALOG con maxPriority.
- TOPIC_POLICY (políticas por tema) y reglas de prioridad (sin HIGH; cap por maxPriority).
- Semántica de suficiencia categórica.
- Reglas de deduplicación D1 / D2 / D3.
- Orden determinista (prioridad → categoría → plataforma → key; recomendaciones estables por prioridad).
- Gate supported/unsupported (7 claves) y ALLOWED_ACTIONS por status.
- Semántica REFRESH_DATA (STALE / NEVER_SYNCED) frente a CONNECT (REAUTH / PERMISSION / NOT_CONNECTED / NOT_LINKED) y RETRY_LATER (RATE_LIMITED / SYNC_ERROR).
- Claves i18n y mensajes ES/EN (61 + 61).
- Manejo de errores técnicos (un único finding de acceso por plataforma bloqueada).
- Interpretación cross-platform factual (sólo fechas, sin recomendaciones).
- Arquitectura pura: sin persistencia, sin red, sin IA, sin UI.

Cualquier cambio sobre este alcance requiere una fase de unfreeze explícita.

## 35. Exact next step

**A3.5.4.3 — SOCIAL INTELLIGENCE UI**, que deberá diseñarse e implementarse en una fase separada, consumiendo `SocialFindingsReport` sin modificar A3.5.4.1 ni A3.5.4.2. No implementado en esta fase.

---

GO — FREEZE A3.5.4.2
