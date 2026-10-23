# A3.5.4.1.1-R2 — Real-Data Revalidation & Final Freeze

- **Modo:** auditoría final read-only.
- **Fecha:** 2026-10-22.
- **Motor:** A3.5.4.1 Deterministic Social Signals Engine (`engineVersion: a3541-1`), con el hotfix A3.5.4.1.2 aplicado.

---

## 1. Executive verdict

**GO — FREEZE A3.5.4.1.**

El defecto F-1 está resuelto. Todas las decisiones de recencia (Facebook, Instagram, `activityState` y cross-platform) usan días completos transcurridos, y la evidencia coincide con la decisión:

- en el snapshot real, a dos `evaluatedAt` explícitos;
- en los límites 7/8 y 30/31;
- en un barrido de 0 a 40 días.

Además:

- La frescura, la frecuencia, la semántica NULL/0 y la de errores técnicos no cambiaron.
- El motor es determinista y puro.
- No hay output no soportado ni integraciones.
- Tests, TypeScript (sin errores nuevos) y build pasan.

No se ha encontrado ningún defecto nuevo.

## 2. Previous NO-GO

A3.5.4.1.1 terminó en **NO-GO — A3.5.4.1 FIX REQUIRED** por un único defecto (F-1):

- las decisiones RECENT y LONG_INACTIVITY comparaban milisegundos exactos (`≤ 7·DAY_MS`, `> 30·DAY_MS`);
- la evidencia mostraba días completos (`floor`).

Resultado: con 7 d 19 h la evidencia decía `daysSinceLastPost: 7, thresholdDays: 7`, pero el estado era NOT_DETECTED. Con 30 d 23 h 59 m, LONG daba DETECTED con `days: 30` y `thresholdDays: 30`.

## 3. Hotfix validation

Revisión del código actual de `signals.ts` y `policy.ts`:

| Punto | Estado actual |
|---|---|
| Fuente de decisión | `daysSinceLastPost = Math.floor(max(0, evaluatedAt − newest) / DAY_MS)`, cálculo único en `observePlatform` |
| RECENT | `isRecent(days)`: `days <= RECENCY_POLICY.recentMaxDays` (7) |
| LONG | `isLongInactive(days)`: `days >= RECENCY_POLICY.longInactivityMinDays` (31) |
| `activityState` | `recent` / `old` / `intermediate` mediante los mismos helpers |
| FB_ONLY / IG_ONLY | `isRecent(fbDays) && !isRecent(igDays)` y el simétrico |
| PLATFORM_RECENCY_DIFFERENCE | `abs(fbDays − igDays) >= 30` |
| Comparaciones en ms para recencia | **Ninguna.** `elapsedSinceLastMs` ya no existe; `DAY_MS` solo se usa para el cálculo de días, el span y los intervalos de frecuencia |

F-1 está corregido.

## 4. Production snapshot

Consulta solo de lectura (SELECT) a `meta_connections`, `meta_sync_state` y `meta_content_items`. Los datos son idénticos a los de A3.5.4.1.1 y A3.5.4.1.2.

**Conexión:** `status: connected`, `instagram_status: connected`, página **Localseohub.io**, Instagram **@localseohub.io**.

| | Facebook | Instagram |
|---|---|---|
| Items | 3 (`photo`) | 1 (`image`) |
| `published_at` | 2026-10-14T22:07:47Z, 22:12:35Z, 22:27:37Z | 2026-10-14T22:26:26Z |
| Texto / caption | Solo 1 de 3 (707 caracteres) | Presente (679 caracteres) |
| reaction / comment | NULL / NULL en los 3 | 0 / 0 |
| `meta_sync_state` | ok, item_count 3, pages_fetched 1 | ok, item_count 1, pages_fetched 1 |
| `last_success_at` | 2026-10-22T17:22:26.63314Z | 2026-10-22T17:22:26.696147Z |
| `last_attempt_at` | = `last_success_at` | = `last_success_at` |

No ha habido sincronizaciones nuevas. Los textos no se reproducen en este informe.

## 5. Provenance

**Meta Graph → A3.5.3 Read Layer → datos persistidos → SocialSnapshot → motor A3.5.4.1.**

- **Lectura desde Meta:** `meta-read` consulta `graph.facebook.com` con `appsecret_proof`.
  - En Facebook, el engagement se pide como `reactions/comments.summary(total_count)`.
  - En Instagram se piden `like_count` y `comments_count`, normalizados con `countOrNull`.
- **Persistencia:** solo mediante `meta_sync_claim` / `meta_sync_apply` (service_role).
- **Migraciones:** todos los `INSERT INTO meta_*` están dentro de funciones (`meta_begin_attempt`, `meta_sync_claim`, `meta_sync_apply`). No hay seeds de datos.
- **Paso al motor:** el snapshot se pasó tal cual, con las mismas columnas.
  - Los textos se sustituyeron por placeholders de la misma longitud.
  - Los `external_id` se sustituyeron por identificadores neutros (solo afectan al orden interno, no a las decisiones).

No hay mocks, fixtures, seeds, demo data ni resultados hardcodeados.

## 6. Facebook result

Ejecución con `evaluatedAt` = **2026-10-22T18:04:26.817Z**, el mismo instante de captura que en A3.5.4.1.1.

| Señal | Estado | Motivo | Evidencia clave |
|---|---|---|---|
| FB_RECENT_ACTIVITY | **DETECTED** (INFO) | — | days 7, umbral 7 |
| FB_LONG_INACTIVITY | NOT_DETECTED | — | days 7, umbral 31 |
| FB_FREQUENCY_OBSERVED | INSUFFICIENT | WINDOW_TOO_SHORT | 3 posts, span 0 d |
| FB_NO_CONTENT | NOT_DETECTED | — | 3 posts |
| FB_CONTENT_TEXT_MISSING | DETECTED (INFO) | — | 1 con texto / 2 sin, LIMITED |
| FB_CONTENT_TYPE_VARIETY | INSUFFICIENT | SAMPLE_TOO_SMALL | photo: 3 |
| FB_ENGAGEMENT_DATA_AVAILABLE | NOT_AVAILABLE | METRICS_NULL | totales null, 3 nulls |
| FB_TREND | NOT_AVAILABLE | NO_HISTORY | — |

Frescura FRESH; `activityState: recent`.

## 7. Instagram result

Mismo `evaluatedAt`.

| Señal | Estado | Motivo | Evidencia clave |
|---|---|---|---|
| IG_RECENT_ACTIVITY | **DETECTED** (INFO) | — | days 7, umbral 7 |
| IG_LONG_INACTIVITY | NOT_DETECTED | — | days 7, umbral 31 |
| IG_FREQUENCY_OBSERVED | INSUFFICIENT | SAMPLE_TOO_SMALL | 1 post |
| IG_NO_CONTENT | NOT_DETECTED | — | 1 post |
| IG_CAPTION_MISSING | NOT_DETECTED | — | 1 con caption |
| IG_CONTENT_TYPE_VARIETY | INSUFFICIENT | SAMPLE_TOO_SMALL | image: 1 |
| IG_ENGAGEMENT_DATA_AVAILABLE | INSUFFICIENT | SAMPLE_TOO_SMALL | reactionTotal 0, commentTotal 0 (ceros reales) |
| IG_TREND | NOT_AVAILABLE | NO_HISTORY | — |

Frescura FRESH; `activityState: recent`.

## 8. Recency boundaries

**Segundo `evaluatedAt` explícito, 2026-10-22T22:30:00.000Z.** Es posterior a 22:27:37Z, cuando ambas plataformas cumplen 8 × 24 h:

- FB y IG dan days 8, RECENT NOT_DETECTED y LONG NOT_DETECTED.
- `activityState` es `intermediate` en ambas.
- La frescura sigue en FRESH.

No se forzó ningún resultado. Ambos instantes están documentados y la evidencia concuerda con la decisión en los dos.

**Tests de límites (11 casos × FB e IG, todos OK):**

| Edad | days | Resultado |
|---|---|---|
| 6d23h | 6 | RECENT |
| 7d00h | 7 | RECENT |
| 7d19h | 7 | RECENT |
| 7d23h59m | 7 | RECENT |
| 8d00h | 8 | INTERMEDIATE |
| 29d | 29 | INTERMEDIATE |
| 30d00h | 30 | INTERMEDIATE |
| 30d23h59m | 30 | INTERMEDIATE |
| 31d00h | 31 | LONG |
| 31d12h | 31 | LONG |
| 45d | 45 | LONG |

También pasan:

- el test de cruce de medianoche (los días son transcurridos, no de calendario);
- el barrido de consistencia de 0 a 40 días en pasos de 7 h.

## 9. Freshness

Sin cambios en `FRESHNESS_POLICY` ni en `classifyFreshness`:

- FRESH ≤ 24 h;
- AGING > 24 h y ≤ 168 h;
- STALE > 7 días.

Se calcula solo sobre `meta_sync_state.last_success_at` y está separada de la recencia del contenido.

Los tests de límite exacto pasan: 24 h → FRESH, 7 d → AGING, 7 d + 1 ms → STALE. El test 19 confirma que los datos STALE nunca parecen actuales.

En los datos reales, la frescura es FRESH a las 18:04 y a las 22:30 (unas 5 h desde la sync), mientras la recencia pasa de 7 a 8 días. Son dos dimensiones independientes.

## 10. Frequency

- **Facebook:** 3 posts en unos 20 minutos (span 0 d) → INSUFFICIENT, `WINDOW_TOO_SHORT`.
- **Instagram:** 1 item → INSUFFICIENT, `SAMPLE_TOO_SMALL`.

`FREQUENCY_POLICY` (3 / 7 / 8 / 28) no cambió y no se produce ninguna cadencia.

## 11. Engagement

- **Facebook:** reaction y comment son NULL → NOT_AVAILABLE `METRICS_NULL`, con `reactionTotal: null` y `commentTotal: null`. NULL nunca se convierte en 0.
- **Instagram:** 0 / 0 → `reactionTotal: 0` y `commentTotal: 0`. Los ceros reales se conservan; la muestra es INSUFFICIENT.

No hay juicio de rendimiento.

## 12. Content completeness

- **Facebook:** `FB_CONTENT_TEXT_MISSING` DETECTED (INFO), con 2 de 3 posts sin texto almacenado y muestra LIMITED. Es un hecho objetivo.
- **Instagram:** caption presente → NOT_DETECTED.

Sin recomendación, score ni juicio de calidad.

## 13. Cross-platform

| evaluatedAt | FB days | IG days | FB_ONLY | IG_ONLY | DIFFERENCE |
|---|---|---|---|---|---|
| 18:04:26.817Z | 7 | 7 | NOT_DETECTED | NOT_DETECTED | NOT_DETECTED (0) |
| 22:30:00.000Z | 8 | 8 | NOT_DETECTED | NOT_DETECTED | NOT_DETECTED (0) |

Las tres señales usan días completos, sin comparaciones en ms.

Tests de límite:

- FB 7d23h59m vs IG 8d → FB_ONLY DETECTED.
- FB 8d vs IG 7d19h → IG_ONLY DETECTED.
- Diferencia de 30 días (0 vs 30) → DETECTED; de 29 días (1 vs 30) → NOT_DETECTED.

El umbral 30 sigue igual.

## 14. Error semantics

Comprobado mediante tests, sin provocar fallos reales:

- `api_error` y `malformed` (SYNC_ERROR), `reauth_required`, `rate_limited` y `permission_unavailable` → todas las señales de negocio afectadas dan NOT_AVAILABLE, con el motivo técnico y severidad null.
- Con posts de 90 días, ninguno de estos casos genera LONG_INACTIVITY, NO_CONTENT ni estado inactivo; `activityState` es `not_evaluable`.
- Si una plataforma falla y la otra está bien, la que funciona se evalúa con normalidad y el cross-platform da NOT_AVAILABLE.
- Un token caducado bloquea ambas plataformas.
- Not linked ≠ empty.

## 15. Evidence traceability

Un verificador automático reconstruyó cada decisión real a partir de su evidencia, en los dos `evaluatedAt`:

- RECENT ⇔ `days ≤ thresholdDays`.
- LONG ⇔ `days ≥ thresholdDays`, con `thresholdDays` = 31.
- FB_ONLY / IG_ONLY coherentes con los días de cada plataforma.
- `recencyDifferenceDays` = `|fb − ig|`, y DETECTED ⇔ diff ≥ umbral.
- Engagement de FB con totales null y NOT_AVAILABLE; de IG con ceros.

Resultado: **0 contradicciones**.

Frecuencia, completitud y tipo de contenido también se pueden reconstruir: el recuento de posts, el span, `postsWithText` / `postsWithoutText`, `contentTypes` y `sampleSufficiency` concuerdan con estado y motivo según la política.

## 16. Determinism

Dos ejecuciones con el mismo SocialSnapshot y el mismo `evaluatedAt` dieron `JSON.stringify(run1) === JSON.stringify(run2)` → **true**, en los dos instantes.

El test de contrato confirma que no se usan `Date.now()`, `new Date()` sin argumento ni `Math.random`.

## 17. Unsupported-output audit

Búsqueda en el código fuente del motor (sin incluir tests) de: score, recommend/recomend, trend, benchmark, rank, reach, impression, follower, sales/venta, conversion, competitor, predict, openai, `fetch(`, supabase, insert/upsert, `.rpc(`, localStorage. **0 coincidencias.**

`*_TREND` existe solo como NOT_AVAILABLE `NO_HISTORY`, que es el placeholder contractual y no produce ninguna tendencia. Los tests de contrato pasan: no hay lenguaje de recomendación ni de score en el output.

## 18. Persistence

- No hay tablas nuevas: las tablas públicas son las mismas, sin ninguna `social_*` ni `*signal*`.
- No hay migraciones nuevas: la última sigue siendo `20261022170523_a353_meta_sync_claim_min_interval`.
- Esta auditoría no hizo escrituras; solo ejecutó SELECT.
- Las señales no se persisten.
- No se modificaron los datos Meta ni `meta_sync_state` (`last_attempt_at` = `last_success_at` de la sync de las 17:22).
- El motor sigue siendo una función pura.
- El script temporal se creó dentro del proyecto y se eliminó después de usarlo.

## 19. Frozen Meta boundaries

A3.5.1, A3.5.2 y A3.5.3 siguen intactos:

- `functions-deploy-state.json` tiene 38 de 38 funciones con `hasChanged: false`, incluidas meta-oauth-start, meta-oauth-callback, meta-connection y meta-read.
- No hay migraciones nuevas: Vault, RLS, `meta_sync_apply` y `meta_sync_claim` siguen igual.
- No se han tocado OAuth, scopes, tokens ni `appsecret_proof`.
- No se han hecho llamadas a Graph ni sincronizaciones nuevas.

## 20. Integration boundaries

Ningún archivo fuera de `src/features/social-intelligence/` importa el motor (0 coincidencias de `social-intelligence` en `src`).

No hay integración con Hoy, Plan, Advisor, Twin, Resumen ni Action Layer, y no existe UI de Social Intelligence.

## 21. Specific tests

- 1 archivo de tests, **79/79 OK**: 53 de A3.5.4.1 (2 actualizados en A3.5.4.1.2) y 26 de límites y consistencia de A3.5.4.1.2.
- Los 26 de A3.5.4.1.2 son:
  - 11 casos FB y 11 casos IG;
  - cross-platform;
  - diferencia 29/30;
  - barrido;
  - cruce de medianoche.

## 22. Full regression suite

**59 archivos, 2130/2130 OK** (2104 de referencia + 26 nuevos). Sin fallos ni tests omitidos.

## 23. TypeScript

**20 errores en 8 archivos**, todos heredados e idénticos a la referencia:

| Archivo | Errores |
|---|---|
| LandingPage | 10 |
| BusinessAuditLanding | 2 |
| ContentGeneratorLanding | 2 |
| MetaAdsLanding | 2 |
| App | 1 |
| DiagnosticLanding | 1 |
| AdminDashboard | 1 |
| a3422GbpRecovery.test | 1 |

Hay 0 errores en `social-intelligence` y 0 errores nuevos atribuibles a A3.5.4.1 o A3.5.4.1.2. No se corrigieron los errores heredados.

## 24. Production build

`npm run build`: OK.

## 25. Scope audit

A3.5.4.1.2 quedó limitado a:

- `policy.ts`: `RECENCY_POLICY.longInactivityMinDays` pasa de 30 a 31, con comentario de semántica.
- `signals.ts`: helpers `isRecent` / `isLongInactive`; se elimina `elapsedSinceLastMs`; la recencia, `activityState` y el cross-platform pasan a días completos.
- El archivo de tests del motor.
- Documentación: informe A3.5.4.1 (tablas de recencia) e informe A3.5.4.1.2.

Sin cambios colaterales:

- `types.ts` y `engine.ts` no se editaron: el contrato es el mismo y la versión sigue siendo `a3541-1`.
- Las funciones, migraciones, UI y otras features no cambiaron.
- `FRESHNESS_POLICY`, `FREQUENCY_POLICY`, `COMPLETENESS_POLICY`, `CONTENT_TYPE_POLICY`, `ENGAGEMENT_POLICY`, `CROSS_PLATFORM_POLICY` y `SYNC_WINDOW` no cambiaron.

Limitación: el proyecto no es un repositorio git y la restauración del workspace alteró las fechas de los archivos. La auditoría de alcance se basa en:

- la revisión directa del código;
- `functions-deploy-state.json`;
- la lista de migraciones;
- la búsqueda de importaciones;
- los tests de contrato.

## 26. Findings

| ID | Severidad | Estado |
|---|---|---|
| F-1 (A3.5.4.1.1): recencia en ms frente a evidencia en días | Alta | **Resuelto** |
| Nuevos | — | Ninguno |

Observaciones, que no son defectos:

- **O-1:** la muestra real es mínima (3 + 1 posts). La frecuencia, el engagement y el tipo de contenido siguen en INSUFFICIENT, como corresponde.
- **O-2:** el resultado de recencia depende de `evaluatedAt`. Los datos reales pasan de RECENT a INTERMEDIATE a las 22:26:26Z (IG) y a las 22:27:37Z (FB) del 2026-10-22. Es el comportamiento intencionado.

## 27. Freeze decision

Se cumplen todos los criterios de GO:

- F-1 resuelto, con evidencia y decisiones coherentes;
- límites 7/8 y 30/31 correctos;
- misma semántica en FB, IG y cross-platform;
- frescura separada y frecuencia correcta;
- NULL ≠ 0 y ceros reales conservados;
- los errores técnicos no se convierten en señales de negocio;
- motor determinista, sin output no soportado y sin persistencia;
- fases Meta congeladas intactas e integraciones fuera;
- tests OK, sin errores TypeScript nuevos, build OK.

**A3.5.4.1 queda CONGELADO.**

## 28. Exact frozen scope

Queda congelado (`src/features/social-intelligence/`, `engineVersion a3541-1`):

- **Tipos y contratos de señales:** 19 `SignalKey`; estados DETECTED / NOT_DETECTED / INSUFFICIENT / NOT_AVAILABLE / STALE; `ReasonCode`, severidades y dimensiones; forma de `SocialSignalsReport`.
- **Contrato de evidencia:** campos por dimensión, incluidos `thresholdDays`, `daysSinceLastPost`, `recencyDifferenceDays`, totales null o numéricos y `sampleSufficiency`.
- **Políticas de suficiencia:** recencia, frecuencia, completitud, tipo de contenido y engagement.
- **Política de frescura:** 24 h / 168 h sobre `last_success_at`; STALE con `lastKnownStatus`.
- **Política de recencia:** días completos transcurridos; RECENT ≤ 7, INTERMEDIATE 8–30, LONG ≥ 31.
- **Cálculos de frecuencia:** 3 / 7 / 8 / 28, mediana de intervalos y `windowTruncated`.
- **Señales de actividad:** RECENT_ACTIVITY, LONG_INACTIVITY, NO_CONTENT y `activityState`.
- **Señales de completitud:** CONTENT_TEXT_MISSING y CAPTION_MISSING.
- **Tipo de contenido:** CONTENT_TYPE_VARIETY (mínimo 8).
- **Disponibilidad de engagement:** ENGAGEMENT_DATA_AVAILABLE (48 h / 3 / 10 / 0.8); NULL ≠ 0.
- **Señales cross-platform:** FB_ONLY / IG_ONLY sobre días completos; PLATFORM_RECENCY_DIFFERENCE como `|fbDays − igDays|` ≥ 30.
- **Semántica de nulls y errores:** bloqueos técnicos → NOT_AVAILABLE con motivo; not linked ≠ empty.
- **Comportamiento del motor:** determinista y puro, con `evaluatedAt` explícito y sin red, IA, base de datos, reloj implícito ni aleatoriedad.

Cualquier cambio posterior sobre este alcance tendrá que tratarse como una fase o un hotfix explícito.

## 29. Exact next step

**A3.5.4.2 — SOCIAL FINDINGS & RECOMMENDATIONS ENGINE.** No se ha implementado en esta fase.

GO — FREEZE A3.5.4.1
