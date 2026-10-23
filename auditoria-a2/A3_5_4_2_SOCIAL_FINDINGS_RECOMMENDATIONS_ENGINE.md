# A3.5.4.2 — Social Findings & Recommendations Engine

- **Modo:** implementación controlada.
- **Fecha:** 2026-10-22.
- **Motor nuevo:** `engineVersion: a3542-1`, sobre `SocialSignalsReport` `a3541-1` (congelado).
- **Ubicación:** `src/features/social-intelligence/findings/` (`types.ts`, `policy.ts`, `rules.ts`, `engine.ts`, `copy.ts`, `__tests__/a3542SocialFindings.test.ts`).

---

## 1. Executive verdict

**GO — listo para validación con datos reales.**

Se implementó una capa determinista SIGNALS → EVIDENCE → FINDINGS → RECOMMENDATIONS → PRIORITY que consume exclusivamente el `SocialSignalsReport` congelado de A3.5.4.1.

| Comprobación | Resultado |
|---|---|
| Suite específica A3.5.4.2 | 59/59 |
| Suite social-intelligence (A3.5.4.1 + A3.5.4.2) | 138/138 |
| Regresión completa | 60 ficheros, 2189/2189 (baseline 2130 + 59 nuevos) |
| TypeScript | 20 errores, todos legacy; 0 nuevos |
| `npm run build` | OK |
| Ficheros congelados A3.5.4.1 | md5/sha256 idénticos |
| Persistencia / migraciones / edge functions | ninguna |
| UI / integraciones | ninguna (el código no aparece en el bundle de producción) |

Sin IA, sin score, sin porcentajes, sin persistencia, sin UI y sin integración con otras capas.

## 2. Architecture

```
SocialSignalsReport (a3541-1, congelado)
  └─ engine.evaluateSocialFindings(report)
       ├─ guard de versión (a3541-1)
       ├─ rules.applyRules        → findings por plataforma + cross, mapa coveredBy
       ├─ dedup D1/D2/D3          → CROSS_PLATFORM_<shared>, <PLATFORM>_LIMITED_HISTORY, absorción cross
       ├─ resolveRecommendation   → catálogo + safety class + gate por estado
       ├─ ordenación estable
       └─ trace (19 señales)
copy.formatSocialMessage(lang, key, params, platform)   ← i18n ES/EN, fuera del motor
```

- Función pura. No usa reloj (`evaluatedAt` se hereda del informe de señales), red, base de datos ni aleatoriedad.
- No importa `engine/policy/signals` de A3.5.4.1; solo importa **tipos** (`../types`).
- No existe ningún import de `social-intelligence` fuera de su carpeta.

## 3. Input contract

- **Entrada única:** `SocialSignalsReport` con `engineVersion === 'a3541-1'`. Cualquier otra versión lanza `UNSUPPORTED_SIGNALS_ENGINE_VERSION`.
- **Campos usados:**
  - `platforms[*].blockedReason`, `syncStatus`, `lastSuccessAt` y `sufficiency.*`;
  - `signals[*].status`, `reason`, `freshness` y `evidence`.
- **`lastKnownStatus` no se usa nunca.**
- Si falta una señal esperada se lanza `MISSING_SIGNAL:<key>`.
- No se releen las tablas Meta: la validación con datos reales consulta las tablas solo para reconstruir el snapshot, en modo lectura.
- La entrada no se muta (comprobado por test).

## 4. Finding contract

`SocialFinding`:

| Campo | Contenido |
|---|---|
| `findingKey` | `FACEBOOK_* / INSTAGRAM_* / CROSS_PLATFORM_*` |
| `topic` | tema del hallazgo |
| `platform` | `facebook / instagram / cross_platform` |
| `category` | `data_quality / activity / frequency / content / engagement` |
| `status` | `ACTIVE / INFORMATIONAL / INSUFFICIENT_DATA / NOT_AVAILABLE / STALE` |
| `priority` | `HIGH / MEDIUM / LOW / INFO` |
| `titleKey`, `summaryKey` | `social.finding.<TOPIC>.title/summary` |
| `params` | valores copiados literalmente de la evidencia |
| `evidence` | `[{signalKey, signalStatus, values}]` |
| `sourceSignals` | señales de origen |
| `sufficiency` | `SUFFICIENT / LIMITED / INSUFFICIENT / NOT_AVAILABLE` |
| `freshness` | frescura de los datos |
| `groupedFindings` | detalle de los hallazgos agrupados |
| `recommendationKeys` | solo las recomendaciones publicadas |

## 5. Recommendation contract

`SocialRecommendation`:

| Campo | Contenido |
|---|---|
| `recommendationKey` | clave soportada |
| `findingKey`, `platform` | hallazgo y plataforma de origen |
| `safetyClass` | `DIRECT / CONTEXTUAL` (UNSUPPORTED es irrepresentable en el tipo publicado) |
| `priority` | prioridad resultante |
| `messageKey` | `social.rec.<KEY>` |
| `params` | parámetros del mensaje |
| `evidenceRefs` | igual a `sourceSignals` del hallazgo |
| `actionType` | tipo de acción |

`actionType` admite `REVIEW / PLAN / CREATE / CONNECT / REFRESH_DATA / WAIT_FOR_MORE_DATA`.

- **Desviación documentada:** `REFRESH_DATA` se añade a la lista de la especificación para no disfrazar "actualizar datos" como `CONNECT`.
- Ninguna recomendación ejecuta nada; son claves de mensaje con parámetros.

## 6. Traceability model

- Cada hallazgo:
  - tiene `sourceSignals` no vacío;
  - su `evidence` coincide 1:1 con `sourceSignals`;
  - cada valor de evidencia es idéntico al de la señal;
  - cada `param` existe con el mismo valor en la evidencia.
- Cada recomendación referencia su hallazgo, y `evidenceRefs` es igual a `sourceSignals`.
- `trace` contiene exactamente las 19 señales, en el orden del informe de entrada, con una disposición:

| Disposición | Significado |
|---|---|
| `FINDING` | la señal genera su propio hallazgo |
| `GROUPED` | la señal está dentro de un hallazgo agrupado |
| `COVERED` | la explica otro hallazgo (acceso, datos caducados o sin contenido) |
| `NO_FINDING` | solo NOT_DETECTED o NOT_AVAILABLE no bloqueante, p. ej. TREND |

Todo esto está verificado sobre 14 escenarios.

## 7. Safety classes

| Clase | Claves | Publicable |
|---|---|---|
| DIRECT | REVIEW_POSTS_WITHOUT_TEXT, REVIEW_POSTS_WITHOUT_CAPTION, REFRESH_DATA, RECONNECT_META, REVIEW_META_PERMISSIONS, RETRY_LATER, WAIT_FOR_MORE_HISTORY | sí |
| CONTEXTUAL | CONSIDER_NEW_CONTENT, CONNECT_PLATFORM (redacción condicional "Si… / If…", prioridad máxima LOW/INFO) | sí |
| UNSUPPORTED | POST_MORE_OFTEN, SWITCH_TO_REELS, PLATFORM_PERFORMANCE_COMPARISON, SALES_UPLIFT, COMPETITOR_COMPARISON, BEST_TIME_TO_POST, FORMAT_ENGAGEMENT_UPLIFT | **nunca** |

Las claves UNSUPPORTED están catalogadas con `missingData` (el motivo por el que no se pueden afirmar).

- `resolveRecommendation` devuelve `null` para ellas.
- No tienen texto en `copy.ts`.
- Ninguna regla las referencia.

`resolveRecommendation` también devuelve `null` si:
- la acción no está permitida para el estado del hallazgo;
- el hallazgo no tiene señales de origen.

Acciones permitidas por estado:

| Estado | Acciones permitidas |
|---|---|
| ACTIVE | REVIEW, PLAN, CREATE |
| INFORMATIONAL | ninguna |
| INSUFFICIENT_DATA | WAIT_FOR_MORE_DATA |
| NOT_AVAILABLE | CONNECT, REFRESH_DATA, WAIT_FOR_MORE_DATA |
| STALE | REFRESH_DATA |

## 8. Activity findings

- **Actividad reciente** (`RECENT_ACTIVITY` DETECTED): RECENT_ACTIVITY, INFORMATIONAL / INFO, sin recomendación.
- **Inactividad larga** (`LONG_INACTIVITY` DETECTED, ≥ 31 días completos): LONG_INACTIVITY, ACTIVE / MEDIUM, con CONSIDER_NEW_CONTENT (CONTEXTUAL, PLAN, limitada a LOW).
  - El texto es condicional: "Si {platform} forma parte de tu estrategia activa, puedes valorar planificar contenido nuevo."
- **Actividad intermedia** (8–30 días, ambas NOT_DETECTED): INTERMEDIATE_ACTIVITY, INFORMATIONAL / INFO, sin recomendación.
- **Sin contenido** (`NO_CONTENT` DETECTED): NO_CONTENT, ACTIVE / LOW, con CONSIDER_NEW_CONTENT (CONTEXTUAL). Las señales con motivo NO_DATA quedan como COVERED y no generan avisos duplicados de "datos insuficientes".
- **Sin fechas** (`NO_TIMESTAMPS`): RECENCY_INSUFFICIENT, INSUFFICIENT_DATA / INFO.
- **Límites probados:** 30 días + 23 h es intermedia; 31 días es inactividad larga.

## 9. Frequency findings

- DETECTED: FREQUENCY_OBSERVED (INFORMATIONAL, solo `postsWithTimestamp` y `medianIntervalDays`, sin benchmark).
- INSUFFICIENT: FREQUENCY_INSUFFICIENT, cuya única recomendación es WAIT_FOR_MORE_HISTORY.
  - **Nunca "publica más".** POST_MORE_OFTEN es UNSUPPORTED.
  - Ningún hallazgo genera PLAN o CREATE por frecuencia.

## 10. Content findings

**Texto ausente**
- FB_CONTENT_TEXT_MISSING genera TEXT_MISSING; IG_CAPTION_MISSING genera CAPTION_MISSING. Ambos son ACTIVE.
- La prioridad es MEDIUM con suficiencia SUFFICIENT (≥ 5 publicaciones) y LOW con LIMITED.
- Recomendación DIRECT/REVIEW: "Revisa si las publicaciones sin texto (n) necesitan unas palabras que expliquen o den contexto al contenido."
  - No promete beneficios.
  - Un test prohíbe que el texto mencione engagement, alcance, ventas, aumento o mejora.
- Un pie de foto presente no genera un hallazgo falso.

**Tipo de contenido**
- DETECTED o NOT_DETECTED: CONTENT_TYPE_MIX, INFORMATIONAL.
- INSUFFICIENT (< 8 publicaciones): CONTENT_TYPE_INSUFFICIENT.
- Nunca hay recomendación de formato: SWITCH_TO_REELS y FORMAT_ENGAGEMENT_UPLIFT son UNSUPPORTED, y no hay copy sobre reels, vídeo o carrusel.

## 11. Engagement findings

| Señal | Hallazgo | Notas |
|---|---|---|
| NOT_AVAILABLE / METRICS_NULL | ENGAGEMENT_METRICS_UNAVAILABLE (NOT_AVAILABLE, INFO) | texto: "Meta no ha proporcionado suficientes métricas…"; nunca dice "0" ni "cero" |
| INSUFFICIENT / SAMPLE_TOO_SMALL | ENGAGEMENT_SAMPLE_INSUFFICIENT | los ceros reales se conservan en la evidencia (0/0), pero no hay afirmación de "bajo" o "low" |
| DETECTED | ENGAGEMENT_DATA_AVAILABLE (INFORMATIONAL) | no valora los números |

- NULL frente a 0 se conserva literalmente: test 36/37.

## 12. Stale-data handling

- Si alguna señal propia está STALE, se emite un único `<PLATFORM>_DATA_STALE`.
  - Valores: STALE, `data_quality`, LOW, suficiencia NOT_AVAILABLE.
  - Parámetro: `lastSuccessAt`.
  - Recomendación: REFRESH_DATA (DIRECT).
- No se emite ningún hallazgo de negocio de esa plataforma.
- La evidencia solo contiene `syncStatus`, `errorCode` y `lastSuccessAt`.
- `lastKnownStatus`, por ejemplo LONG_INACTIVITY = DETECTED, **no se usa nunca** (test 14).
- Si ambas plataformas están caducadas, se emite un solo `CROSS_PLATFORM_DATA_STALE` (D1).
- Las señales cross quedan COVERED.

## 13. Technical-error handling

Un `blockedReason` genera un único hallazgo de acceso, sin diagnóstico de negocio en esa plataforma:

| Bloqueo | Prioridad | Recomendación |
|---|---|---|
| REAUTH_REQUIRED | MEDIUM | RECONNECT_META (DIRECT, CONNECT) |
| PERMISSION_UNAVAILABLE | LOW | REVIEW_META_PERMISSIONS |
| RATE_LIMITED | INFO | RETRY_LATER (WAIT_FOR_MORE_DATA) |
| SYNC_ERROR (api_error, malformed…) | INFO | RETRY_LATER |
| NOT_CONNECTED / NOT_LINKED | INFO | CONNECT_PLATFORM (CONTEXTUAL) |
| NEVER_SYNCED | INFO | REFRESH_DATA |

La plataforma sana sigue analizándose con normalidad. Las señales cross quedan COVERED por el hallazgo de acceso.

## 14. Cross-platform findings

- Solo se emiten si ninguna plataforma está bloqueada, caducada o sin datos.
- FB_ONLY_RECENT, IG_ONLY_RECENT y RECENCY_DIFFERENCE: INFORMATIONAL / INFO, sin recomendaciones.
- Solo muestran días desde la última publicación y la diferencia en días ("Solo describe fechas.").
- No contienen "mejor", "peor", "rendimiento" ni "funciona" (test 21). PLATFORM_PERFORMANCE_COMPARISON es UNSUPPORTED.

## 15. Priority policy

- **HIGH:** reservado. Ninguna regla actual tiene evidencia sólida suficiente para emitirlo, y está verificado en todos los escenarios.
- **MEDIUM:**
  - REAUTH_REQUIRED (pérdida total de acceso);
  - LONG_INACTIVITY;
  - texto o pie ausente con muestra SUFFICIENT.
- **LOW:**
  - texto ausente con muestra LIMITED;
  - NO_CONTENT;
  - DATA_STALE;
  - PERMISSION_UNAVAILABLE.
- **INFO:** todo lo demás (informativos, insuficientes, no disponibles, cross).

La prioridad de una recomendación es `min(prioridad del hallazgo, maxPriority del catálogo)`, así que nunca supera a su hallazgo. Las CONTEXTUAL quedan limitadas a LOW/INFO.

## 16. Sufficiency/confidence

- Solo se usan SUFFICIENT / LIMITED / INSUFFICIENT / NOT_AVAILABLE, derivados de `PlatformAssessment.sufficiency` o del estado de la señal.
- STALE y NOT_AVAILABLE dan NOT_AVAILABLE; INSUFFICIENT_DATA da INSUFFICIENT.
- No hay porcentajes de confianza; un test prohíbe `\d+%`, score, rating, stars y health tanto en el copy como en la salida.

## 17. Deduplication

- **D1:** el mismo tema compartido (acceso o caducidad) en FB e IG se convierte en `CROSS_PLATFORM_<topic>`, conservando ambos hallazgos en `groupedFindings`.
- **D2:** dos o más hallazgos INSUFFICIENT_DATA en una plataforma se agrupan en `<PLATFORM>_LIMITED_HISTORY`.
  - Se emite una sola WAIT_FOR_MORE_HISTORY por plataforma.
  - El detalle de cada miembro (clave, mensaje, parámetros y señales) se conserva.
  - Si solo hay uno, no se agrupa.
- **D3:** RECENCY_DIFFERENCE absorbe FB_ONLY_RECENT / IG_ONLY_RECENT.
- Las señales con motivo NO_DATA bajo NO_CONTENT quedan COVERED.
- No hay claves de hallazgo repetidas ni pares (recomendación, plataforma) repetidos.

## 18. Deterministic ordering

- **Hallazgos:** prioridad (HIGH → INFO), después categoría (`data_quality`, `activity`, `frequency`, `content`, `engagement`), después plataforma (facebook, instagram, cross), después `findingKey`.
- **Recomendaciones:** orden estable por prioridad, manteniendo el orden de los hallazgos.
- La misma entrada con el mismo `evaluatedAt` produce la misma salida byte a byte (test 33, en los 14 escenarios).

## 19. i18n architecture

- El motor emite solo claves y parámetros.
- `copy.ts` contiene `SOCIAL_FINDINGS_MESSAGES` en ES y EN, con conjuntos de claves idénticos (verificado).
- `formatSocialMessage(lang, key, params, platform)`:
  - `{platform}` se sustituye por el nombre de la plataforma;
  - null se muestra como "—";
  - los objetos se muestran como "k: n";
  - una clave inexistente lanza `MISSING_SOCIAL_MESSAGE:<key>`.
- Todo mensaje emitido en todos los escenarios se renderiza en ES y EN sin placeholders sin resolver.
- El tipo `Lang` se reutiliza de `lib/i18n`.

## 20. Persistence decision

**No hay persistencia.** El motor es una función pura y barata, recalculable en cada lectura a partir del snapshot.

- No se crearon tablas, migraciones ni edge functions (la última migración sigue siendo `20261022170523_a353_meta_sync_claim_min_interval.sql`).
- Si A3.5.4.4 necesitara historial de hallazgos, se planteará antes como decisión separada.

## 21. Security/privacy

- La salida no contiene:
  - texto de publicaciones;
  - `external_id`;
  - tokens;
  - payloads.
- Esto se verifica con marcadores en el test de privacidad.
- No hay llamadas de red ni de IA, ni acceso a Supabase, `localStorage`, reloj o aleatoriedad. Lo garantiza un test sobre el código fuente.
- La validación con datos reales usó solo SELECT, en modo lectura.

## 22. Real-data validation

**Datos**
- Snapshot releído de producción (solo lectura) a las 2026-10-22 18:52:47Z. Coincide exactamente con REAL_SNAPSHOT:
  - FB: 3 fotos del 14/10, 2 sin texto, reacciones y comentarios NULL;
  - IG: 1 imagen con texto, 0/0;
  - sync ok a las 17:22Z.
- Ejecutado mediante un script temporal empaquetado, que se eliminó después.

**evaluatedAt = 2026-10-22T18:52:47.824Z**

| # | Hallazgo | Estado | Prioridad | Suficiencia | Detalle |
|---|---|---|---|---|---|
| 1 | FACEBOOK_TEXT_MISSING | ACTIVE | LOW | LIMITED | 2 de 3 publicaciones |
| 2 | FACEBOOK_LIMITED_HISTORY | INSUFFICIENT_DATA | INFO | INSUFFICIENT | frecuencia (3 con fecha), formato (3) |
| 3 | INSTAGRAM_LIMITED_HISTORY | INSUFFICIENT_DATA | INFO | INSUFFICIENT | frecuencia (1), formato (1), interacción (muestra 1/1) |
| 4 | FACEBOOK_RECENT_ACTIVITY | INFORMATIONAL | INFO | SUFFICIENT | 7 días completos (umbral 7) |
| 5 | INSTAGRAM_RECENT_ACTIVITY | INFORMATIONAL | INFO | SUFFICIENT | 7 días completos |
| 6 | FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE | NOT_AVAILABLE | INFO | NOT_AVAILABLE | 3 publicaciones observadas |

| Recomendación | Plataforma | Clase | Acción | Prioridad |
|---|---|---|---|---|
| REVIEW_POSTS_WITHOUT_TEXT | facebook | DIRECT | REVIEW | LOW |
| WAIT_FOR_MORE_HISTORY | facebook | DIRECT | WAIT_FOR_MORE_DATA | INFO |
| WAIT_FOR_MORE_HISTORY | instagram | DIRECT | WAIT_FOR_MORE_DATA | INFO |

**Texto renderizado (ES)**
- "Parte del contenido observado en Facebook no incluye texto: 2 de 3 publicaciones."
- "Revisa si las publicaciones sin texto (2) necesitan unas palabras que expliquen o den contexto al contenido."
- "Meta no ha proporcionado suficientes métricas de interacción en Facebook para analizar este aspecto."
- "El análisis será más completo a medida que se sincronicen más publicaciones."

**Trace**
- 4 FINDING: FB/IG RECENT, FB_CONTENT_TEXT_MISSING, FB_ENGAGEMENT.
- 5 GROUPED: frecuencia y formato FB/IG, IG_ENGAGEMENT.
- 10 NO_FINDING: LONG ×2, NO_CONTENT ×2, IG_CAPTION_MISSING, TREND ×2 y las 3 cross (NOT_DETECTED).

**Lo que no aparece**
- Ningún HIGH ni MEDIUM.
- Ningún hallazgo de pie de foto en IG.
- Ningún cross-platform.
- Ningún "engagement bajo" en IG.
- Ningún "0 interacciones" en FB.
- Ninguna recomendación de frecuencia o formato.

**evaluatedAt = 2026-10-22T22:30Z** (más de 8 días completos)
- RECENT_ACTIVITY pasa a INTERMEDIATE_ACTIVITY (INFO) en ambas plataformas.
- Las recomendaciones no cambian.
- La salida es coherente con el límite congelado de A3.5.4.1.

## 23. Specific tests

El fichero `findings/__tests__/a3542SocialFindings.test.ts` contiene **59 tests, todos superados**.

Los 40 casos mínimos de §28 están numerados en el fichero (1–40). Además incluye:
- límites de prioridad por suficiencia;
- límite 30/31;
- NO_CONTENT;
- frecuencia, formato e interacción informativos;
- ambas plataformas caducadas (D1);
- NOT_CONNECTED / NOT_LINKED;
- gate de acciones por estado;
- copy condicional de las CONTEXTUAL;
- completitud de i18n;
- guard de versión;
- agrupación de un solo miembro;
- absorción cross;
- unicidad de claves;
- privacidad;
- validación real a las dos horas.

Escenarios usados (14): real, inactividad larga, histórico rico, FB caducado, reauth, rate limit, permisos, error de sincronización, vacío, sin fechas, solo FB reciente, solo IG reciente, no conectado, IG no vinculado.

## 24. Full regression

`npm test`: **60 ficheros, 2189/2189 superados** (baseline 2130 + 59 nuevos). No hay regresiones.

## 25. TypeScript

`tsc --noEmit -p tsconfig.app.json`: **20 errores, idénticos al baseline legacy**:

| Fichero | Errores |
|---|---|
| LandingPage | 10 |
| BusinessAuditLanding | 2 |
| ContentGeneratorLanding | 2 |
| MetaAdsLanding | 2 |
| App | 1 |
| DiagnosticLanding | 1 |
| AdminDashboard | 1 |
| a3422GbpRecovery.test | 1 |

Hay 0 errores en `social-intelligence`.

## 26. Production build

`npm run build`: OK.

El código de hallazgos no aparece en `dist/` (comprobado buscando claves de hallazgo y de mensaje), lo que es coherente con que no hay UI ni integración.

## 27. Frozen A3.5.4.1 verification

| Fichero | md5 | sha256 | Estado |
|---|---|---|---|
| engine.ts | a088e2e9a6dd720f47ae70046abc8e73 | 457d613c24f768c0faec6219890aee3154d9dbf659ef9c9782ee11fb319f5fef | intacto |
| policy.ts | 9a2b024cc333912d508d92d6a3aabdaf | 45604a0cfa549fc198751dccf5a4676b27e32200ef1d63e5ceb5c91b041a9f07 | intacto |
| signals.ts | 7d2a19a406dc1b86d3eb425967c37c5a | c9aaf99d719c1537208e90b19d7af9b187da840ec6ca79f4b9dc8311ecbdf0ed | intacto |
| types.ts | b9e9509c2289ef8011bf8a98da86917b | 2061f89f166f9333f44693944a798cd0af43dfe1d77ba4036ec44c1b849b5808 | intacto |
| a3541SocialSignals.test.ts | c91ccc294a8ff24fdc0867c31b3acc13 | — | intacto (79/79) |

- El test 38 fija los sha256 como guard permanente.
- No se encontró ningún defecto en A3.5.4.1, así que no se necesita hotfix.

## 28. Known limitations

1. HIGH no se emite en ningún caso. Es intencionado hasta que existan señales con evidencia sólida (p. ej. tendencia histórica, hoy NOT_AVAILABLE).
2. `REFRESH_DATA` amplía la lista de `actionType` de la especificación (ver §5).
3. El copy de DATA_STALE fija "7 días". Coincide con `FRESHNESS_POLICY.agingMaxHours / 24`, comprobado por test; si la política cambiara, el test fallaría.
4. Las señales TREND (siempre NOT_AVAILABLE / NO_HISTORY) no generan hallazgo, para no repetir avisos de historial limitado.
5. Con el volumen real (3 + 1 publicaciones), casi todo es INFO o insuficiente. El único hallazgo accionable es el texto ausente en FB.
6. El motor no está conectado a ninguna pantalla. Su valor de producto se medirá en A3.5.4.3 / A3.5.4.4.
7. El nombre de la plataforma en el copy no se traduce (Facebook / Instagram / "Facebook e Instagram").

## 29. Exact next step

**A3.5.4.2-V — Real-data validation (read-only)** del motor de hallazgos:
- revisar el texto ES/EN renderizado y la prioridad con el negocio;
- confirmar la decisión sobre `REFRESH_DATA`;
- decidir si se congela A3.5.4.2.

No se congela A3.5.4.2 todavía, y no se implementan A3.5.4.3 (UI) ni A3.5.4.4 (integración).

GO — READY FOR A3.5.4.2 REAL-DATA VALIDATION
