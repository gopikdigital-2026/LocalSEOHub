# A3.5.4.1 — DETERMINISTIC SOCIAL SIGNALS ENGINE

Fecha: 2026-10-22
Modo: implementación controlada.
Precedente: A3.5.4.0, con veredicto GO — SOCIAL INTELLIGENCE ARCHITECTURE READY.

---

## 1. Executive verdict

Se ha implementado un motor determinista, puro y sin persistencia, que transforma los datos sociales reales almacenados por A3.5.3 en:

`REAL DATA → SUFFICIENCY → SIGNAL → EVIDENCE`

Lo que el motor NO hace:
- No genera recomendaciones.
- No llama a IA.
- No calcula Social Score.
- No genera tendencias.
- No consulta Meta Graph API.
- No accede a tokens.
- No escribe en la base de datos.
- No está integrado en ninguna pantalla ni capa (Hoy, Plan, Advisor, Twin, Resumen, Action Layer).

Estado de verificación:
- Suite específica: 53 tests superados.
- Suite completa: 59 ficheros, 2104 tests superados.
- Build de producción: OK.
- El motor se ha validado contra una copia exacta, de solo lectura, de las filas reales de producción (FB 3, IG 1). Los resultados coinciden con lo esperado (§19, bloque "real production data validation").

A3.5.4.1 **no se declara congelada**; queda pendiente la validación formal con datos reales.

---

## 2. Architecture

```
src/features/social-intelligence/
  types.ts     contrato de entrada, Signal, Evidence, informe
  policy.ts    umbrales centralizados + freshness + sufficiency
  signals.ts   observación por plataforma + evaluadores por dimensión
  engine.ts    gates (conexión, vinculación, sync, frescura) + ensamblado estable
  __tests__/a3541SocialSignals.test.ts
```

- Punto de entrada único: `evaluateSocialSignals(snapshot, evaluatedAt)`.
- Funciones puras: sin React, sin Supabase, sin red, sin reloj implícito.
- Ningún fichero de la aplicación importa todavía el motor (verificado). No se añade ninguna UX.
- La única dependencia externa es el tipo `MetaConnectionStatus` / `InstagramStatus` de `meta-connection/metaStatus.ts`, importado solo como tipo. No se modificó.

---

## 3. Input contract

`SocialSnapshot`:

| Campo | Origen | Columnas |
|---|---|---|
| `connection` | `meta_connections` | `status`, `instagram_status` |
| `syncStates[]` | `meta_sync_state` | `platform`, `status`, `error_code`, `item_count`, `pages_fetched`, `last_success_at` |
| `items[]` | `meta_content_items` | `platform`, `external_id`, `content_type`, `text_content`, `published_at`, `reaction_count`, `comment_count` |

- Se usan los nombres de columna reales (snake_case), para que A3.5.4.3 pueda pasar las filas leídas bajo RLS sin transformarlas.
- `meta_connections.last_synced_at` **no forma parte del contrato** y un test verifica que el código del motor no lo menciona.
- `evaluatedAt` es obligatorio (Date o ISO). Si no es válido, lanza `INVALID_EVALUATED_AT`.
- El orden de las filas de entrada no afecta al resultado (test con entrada invertida).
- La entrada no se modifica (test).

---

## 4. Signal contract

```ts
interface SocialSignal {
  signalKey; platform: 'facebook'|'instagram'|'cross_platform';
  dimension: 'recency'|'frequency'|'activity'|'content_completeness'|'content_type'|'engagement_availability'|'cross_platform'|'trend';
  status: 'DETECTED'|'NOT_DETECTED'|'INSUFFICIENT'|'NOT_AVAILABLE'|'STALE';
  lastKnownStatus: SignalStatus|null;   // solo con STALE
  severity: 'INFO'|'LOW'|'MEDIUM'|'HIGH'|null;  // solo con DETECTED
  reason: ReasonCode|null;              // por qué no se evaluó
  freshness: 'FRESH'|'AGING'|'STALE'|'UNKNOWN';
  evidence: SignalEvidence;
  evaluatedAt: string;
}
```

- Colección estable: siempre las mismas 19 señales en el mismo orden, sea cual sea el escenario (test). 8 por plataforma + 3 cross-platform.
- Se añadieron dos dimensiones respecto a la propuesta: `content_type` (separada de completitud) y `trend` (siempre NOT_AVAILABLE).

`ReasonCode`: `NOT_CONNECTED`, `NOT_LINKED`, `NEVER_SYNCED`, `REAUTH_REQUIRED`, `RATE_LIMITED`, `PERMISSION_UNAVAILABLE`, `SYNC_ERROR`, `STALE_DATA`, `NO_DATA`, `NO_TIMESTAMPS`, `SAMPLE_TOO_SMALL`, `WINDOW_TOO_SHORT`, `METRICS_NULL`, `NO_HISTORY`.

Severidad (solo cuando DETECTED):

| Señal | Severidad |
|---|---|
| `*_LONG_INACTIVITY` | MEDIUM |
| `*_NO_CONTENT` | LOW |
| `*_RECENT_ACTIVITY`, falta de texto/caption, señales cross-platform | INFO |
| Frecuencia, variedad de tipos, disponibilidad de engagement | `null` (son mediciones, no alertas) |

Ninguna señal usa HIGH en esta fase.

Además, el informe incluye `platforms.{facebook,instagram}` con: `blockedReason`, `syncStatus`, `freshness`, `lastSuccessAt`, `hoursSinceSuccess`, `activityState` y la suficiencia por dimensión.

---

## 5. Evidence contract

`SignalEvidence` es un tipo cerrado. Solo admite estos campos, que son datos reales o cálculos derivados de ellos:

- **Estado de sincronización:** `lastSuccessAt`, `syncStatus`, `errorCode`.
- **Muestra y recencia:** `observedPostCount`, `postsWithTimestamp`, `oldestObservedPostAt`, `newestObservedPostAt`, `daysSinceLastPost`, `thresholdDays`.
- **Frecuencia:** `observedSpanDays`, `medianIntervalDays`, `postsPer30Days`, `windowTruncated`, `sampleSufficiency`.
- **Completitud y tipos:** `postsWithText`, `postsWithoutText`, `contentTypes`, `distinctContentTypes`.
- **Engagement:** `eligibleEngagementCount`, `availableEngagementCount`, `missingEngagementCount`, `reactionObservedCount`, `reactionNullCount`, `commentObservedCount`, `commentNullCount`, `reactionTotal`, `commentTotal`.
- **Cross-platform:** `facebookDaysSinceLastPost`, `instagramDaysSinceLastPost`, `recencyDifferenceDays`, `facebookReason`, `instagramReason`.

Minimización:
- La evidencia **no contiene textos de publicaciones ni `external_id`**. Un test lo verifica con un marcador.
- Solo se usa la presencia o ausencia del texto.
- `reactionTotal` / `commentTotal` son NULL si ningún elemento tiene el valor. Nunca se suma un NULL como 0.

---

## 6. Freshness policy

Basada exclusivamente en `meta_sync_state.last_success_at`, por plataforma.

| Estado | Edad |
|---|---|
| FRESH | ≤ 24 h |
| AGING | > 24 h y ≤ 7 días |
| STALE | > 7 días |
| UNKNOWN | sin `last_success_at` válido (la plataforma queda como `NEVER_SYNCED`) |

**Decisión:** se adoptan los umbrales de la especificación A3.5.4.1, más conservadores que los propuestos en A3.5.4.0 (7/30 días). La sincronización solo es manual, así que es preferible marcar antes los datos como antiguos que presentarlos como actuales.

Efectos:
- **AGING:** se evalúa normalmente y la señal lleva `freshness: 'AGING'`.
- **STALE:**
  - toda señal (salvo la de tendencia) pasa a `status: 'STALE'`, con `lastKnownStatus`, `severity: null` y `reason: 'STALE_DATA'`;
  - la evidencia se conserva para describir la última información disponible;
  - `activityState` pasa a `not_evaluable`.
- **Cross-platform:** usa la peor frescura de las dos plataformas.

Los límites se comprueban en tests: 24 h exactas = FRESH; 7 días exactos = AGING; 7 días + 1 ms = STALE.

---

## 7. Sufficiency policy

Centralizada en `policy.ts`, evaluada por dimensión:

| Dimensión | SUFFICIENT | LIMITED | INSUFFICIENT |
|---|---|---|---|
| Recency | ≥ 1 publicación con fecha | — | 0 |
| Frequency | ≥ 8 publicaciones **y** span ≥ 28 días | ≥ 3 publicaciones, span ≥ 7 días, sin llegar a SUFFICIENT | < 3 publicaciones **o** span < 7 días |
| Content completeness | ≥ 5 publicaciones | 2–4 | < 2 |
| Content type | ≥ 8 publicaciones | — | < 8 |
| Engagement | ≥ 10 publicaciones elegibles (≥ 48 h) con ambas métricas no NULL **y** cobertura ≥ 80 % | ≥ 3 | < 3 |
| Trend | nunca | — | siempre NOT_AVAILABLE (`NO_HISTORY`) |
| Cross-platform | ≥ 1 publicación con fecha en ambas plataformas, sin bloqueo y no STALE | — | resto |

- **LIMITED nunca produce cálculo.** La señal queda INSUFFICIENT y la evidencia indica `sampleSufficiency: 'LIMITED'`.
- Son umbrales internos de LocalSEOHub, no benchmarks de mercado.

---

## 8. Recency signals

`FB_RECENT_ACTIVITY`, `FB_LONG_INACTIVITY`, `IG_RECENT_ACTIVITY`, `IG_LONG_INACTIVITY`.

| Condición | Resultado |
|---|---|
| `daysSinceLastPost` ≤ 7 | RECENT = DETECTED (INFO) |
| `daysSinceLastPost` ≥ 31 | LONG_INACTIVITY = DETECTED (MEDIUM) |
| `daysSinceLastPost` 8–30 | Ambas NOT_DETECTED (sin conclusión fuerte), `activityState: 'intermediate'` |
| Sin contenido | INSUFFICIENT, `NO_DATA` |
| Contenido sin fechas | INSUFFICIENT, `NO_TIMESTAMPS` |

- La recencia no habla de frecuencia.
- Evidencia: `newestObservedPostAt`, `daysSinceLastPost` (días completos), `thresholdDays`, `postsWithTimestamp`.
- (A3.5.4.1.2) Todas las decisiones de recencia usan días completos transcurridos: `daysSinceLastPost = floor((evaluatedAt − newestObservedPostAt) / 24 h)`. No son días de calendario. `thresholdDays` es 7 en RECENT y 31 en LONG_INACTIVITY, ambos inclusivos, así que la evidencia nunca contradice el estado.

---

## 9. Frequency signals

`FB_FREQUENCY_OBSERVED`, `IG_FREQUENCY_OBSERVED`.

- **INSUFFICIENT** si la muestra no es SUFFICIENT. Motivos posibles:
  - `SAMPLE_TOO_SMALL`
  - `WINDOW_TOO_SHORT`
  - `NO_DATA` / `NO_TIMESTAMPS`
- **DETECTED** (sin severidad) solo con muestra suficiente. Calcula:
  - `medianIntervalDays`: mediana de los intervalos consecutivos;
  - `postsPer30Days`: (n − 1) / span × 30, redondeado a 1 decimal;
  - `observedSpanDays`;
  - `windowTruncated`.
- `windowTruncated = true` si `item_count ≥ 100` o `pages_fetched ≥ 4`. Mismos límites que meta-read; un test verifica que siguen alineados. En ese caso la frecuencia es un mínimo observado.
- Sin benchmarks ni juicios.

---

## 10. Activity signals

- `FB_NO_CONTENT` / `IG_NO_CONTENT`: DETECTED (LOW) cuando la plataforma está sincronizada y no hay contenidos. Significa únicamente "no se encontraron contenidos en la muestra disponible"; no se interpreta como abandono.
- `activityState` por plataforma:

| Valor | Cuándo |
|---|---|
| `no_content` | Sin contenidos |
| `recent` | `daysSinceLastPost` ≤ 7 |
| `intermediate` | `daysSinceLastPost` 8–30 |
| `old` | `daysSinceLastPost` ≥ 31 |
| `insufficient_context` | Hay contenidos, pero sin fechas |
| `not_evaluable` | Plataforma bloqueada o datos STALE |

---

## 11. Content completeness

`FB_CONTENT_TEXT_MISSING` / `IG_CAPTION_MISSING`.

- Un texto cuenta como ausente si es NULL o solo contiene espacios.
- DETECTED (INFO) si al menos un contenido observado no tiene texto; NOT_DETECTED si todos lo tienen; INSUFFICIENT (`NO_DATA`) si no hay contenidos.
- Evidencia: `observedPostCount`, `postsWithText`, `postsWithoutText`, `sampleSufficiency`. Con 3 posts es LIMITED; la evidencia lo indica para que A3.5.4.2 no generalice.
- No hay juicio de calidad.

---

## 12. Content-type handling

`*_CONTENT_TYPE_VARIETY`.

- La distribución observada (`contentTypes`, claves ordenadas) se incluye siempre como hecho.
- Con < 8 contenidos: INSUFFICIENT (`SAMPLE_TOO_SMALL`).
- Con muestra suficiente: DETECTED si hay ≥ 2 tipos distintos y NOT_DETECTED si hay uno solo. Sin severidad.
- Ninguna salida sugiere qué tipo publicar.

---

## 13. Engagement availability

`*_ENGAGEMENT_DATA_AVAILABLE`. Evalúa solo si hay datos suficientes; nunca si el engagement es bueno o malo.

| Caso | Resultado |
|---|---|
| Todas las métricas NULL | NOT_AVAILABLE (`METRICS_NULL`), totales NULL |
| Hay métricas, pero menos de 10 elegibles o cobertura < 80 % | INSUFFICIENT (`SAMPLE_TOO_SMALL`) |
| Muestra suficiente | DETECTED (sin severidad) |

- **Elegible:** contenido con fecha y antigüedad ≥ 48 h, y con ambas métricas no NULL.
- **Ceros reales:** se conservan (`reactionTotal: 0`).
- Contadores separados de NULL y de valores observados para reacciones y comentarios.
- Solo se aceptan enteros seguros ≥ 0, igual que `countOrNull` de A3.5.3.

---

## 14. Cross-platform signals

`FB_ONLY_RECENT_ACTIVITY`, `IG_ONLY_RECENT_ACTIVITY`, `PLATFORM_RECENCY_DIFFERENCE`.

Requisitos: ambas plataformas sin bloqueo, ≥ 1 contenido con fecha en cada una, y ninguna STALE. Si una plataforma está STALE, las tres señales pasan a STALE.

| Señal | DETECTED (INFO) cuando |
|---|---|
| `FB_ONLY_RECENT_ACTIVITY` | FB `daysSinceLastPost` ≤ 7 y IG ≥ 8 |
| `IG_ONLY_RECENT_ACTIVITY` | IG `daysSinceLastPost` ≤ 7 y FB ≥ 8 |
| `PLATFORM_RECENCY_DIFFERENCE` | `abs(fbDays − igDays)` ≥ 30, sobre días completos |

- Si una plataforma está bloqueada: NOT_AVAILABLE, con el motivo de cada plataforma en la evidencia.
- Si falta muestra: INSUFFICIENT.
- No se compara engagement ni frecuencia entre plataformas en esta fase.

---

## 15. Null/no-data/error semantics

| Estado | Representación |
|---|---|
| ZERO | Número 0 en la evidencia |
| NULL | `null` + contadores `*NullCount` |
| NO_DATA | `reason: 'NO_DATA'` + `*_NO_CONTENT` DETECTED |
| NOT_AVAILABLE | `status: 'NOT_AVAILABLE'` (métricas NULL, plataforma bloqueada, tendencia) |
| INSUFFICIENT | `status: 'INSUFFICIENT'` + motivo |
| SYNC_ERROR | `reason` ∈ SYNC_ERROR / RATE_LIMITED / PERMISSION_UNAVAILABLE / REAUTH_REQUIRED |
| STALE | `status: 'STALE'` + `lastKnownStatus` |

Orden de los bloqueos por plataforma:
1. Sin conexión → `NOT_CONNECTED`.
2. Conexión `reauth_required` → `REAUTH_REQUIRED`.
3. Instagram no conectado (`instagram_status ≠ connected`, o sync `not_linked`) → `NOT_LINKED`.
4. Sin fila de sincronización, `never`, o sin `last_success_at` → `NEVER_SYNCED`.
5. Estado de error → su motivo; cualquier estado desconocido cuenta como `SYNC_ERROR`.

Con una plataforma bloqueada:
- Todas sus señales son NOT_AVAILABLE y su evidencia se limita al estado técnico.
- **No se leen sus contenidos guardados**, para que un problema técnico (rate limit, permisos, token) nunca se convierta en "inactividad". Hay tests para cada estado.

---

## 16. Determinism

- Sin `Math.random`, `Date.now()`, `new Date()` sin argumentos, IA ni red. Un test analiza el código fuente del motor.
- Elementos ordenados por `external_id` y fechas ordenadas; la distribución por tipo tiene claves ordenadas; el orden de las señales es fijo.
- Tests: misma entrada → mismo JSON; entrada en otro orden → mismo resultado; `evaluatedAt` se refleja exactamente; la entrada no se modifica.

---

## 17. Persistence decision

**Sin persistencia.**

- Las señales se calculan en milisegundos a partir de las tablas existentes.
- Persistirlas duplicaría datos que quedarían desfasados tras cada sincronización y requeriría ampliar la purga.
- No se creó ninguna tabla ni migración.

---

## 18. Security boundaries

Verificado en el código del motor y por test:

| Comprobación | Resultado |
|---|---|
| Llamadas a Graph API | Ninguna |
| OpenAI / modelos / prompts / consumo de IA | Ninguno |
| Supabase / `functions.invoke` | Ninguno |
| Tokens, `access_token`, `appsecret` | Ninguno |
| Nuevos permisos Meta o secretos | Ninguno |
| OAuth, meta-read, meta-connection | Sin cambios |
| Recomendaciones (deberías / recomendamos / publica / mejora / haz / conviene / should / recommend / improve) | Ninguna en la salida |
| Score / health / rating / ranking / benchmark | Ninguno, ni en la salida ni en el código |
| Alcance, impresiones, seguidores, crecimiento, ventas, conversiones, competidores | Ninguno en la salida |
| Base de datos | Solo consultas de lectura (`SELECT`) para auditoría; ningún cambio |

---

## 19. Tests

Fichero: `src/features/social-intelligence/__tests__/a3541SocialSignals.test.ts`. **53 tests superados.**

| # | Caso | Cubierto |
|---|---|---|
| 1–4 | Recencia FB/IG reciente e inactividad larga | Sí |
| 5 | Sin contenido ≠ abandono | Sí |
| 6 | 1 post → frecuencia INSUFFICIENT | Sí |
| 7 | Varios posts en 20 min → INSUFFICIENT (`WINDOW_TOO_SHORT`) | Sí |
| 8 | Muestra suficiente → mediana 4 d, 7.5 / 30 d | Sí |
| 9–10 | FB reaction/comment NULL → NOT_AVAILABLE | Sí |
| 11–12 | IG 0 / 0 → ceros reales | Sí |
| 13–14 | Falta texto FB / caption IG | Sí |
| 15–16 | Tipos mixtos / muestra insuficiente | Sí |
| 17–19 | FRESH / AGING / STALE + límites exactos | Sí |
| 20–22 | api_error, malformed, reauth, rate_limited, permission_unavailable ≠ inactividad | Sí |
| 23 | Una plataforma con error y otra OK | Sí |
| 24–25 | Cross-platform suficiente / insuficiente | Sí |
| 26 | Sin tendencias | Sí |
| 27–28, 32–34 | Sin score, recomendaciones, métricas no soportadas, competidores ni ventas | Sí |
| 29–30 | Determinismo | Sí |
| 31 | NULL ≠ 0 | Sí |
| 35 | Contratos A3.5.3 (límites meta-read y CHECK de status y content_type de la migración) | Sí |

Casos adicionales:
- Rango intermedio de 8–30 días completos (corregido en A3.5.4.1.2).
- Contenido sin fecha.
- Muestra LIMITED.
- Ventana truncada.
- Publicaciones de menos de 48 h no elegibles.
- Caption presente.
- Token expirado bloquea ambas plataformas.
- IG no vinculado frente a IG vacío.
- Nunca sincronizado o desconectado.
- Cross-platform STALE.
- Colección de señales estable.
- Severidad solo con DETECTED.
- Evidencia sin textos ni IDs.
- Auditoría del código fuente.

**Validación con datos reales** (copia de solo lectura de producción, `evaluatedAt` = 2026-10-22T18:00Z):

| Comprobación | Resultado |
|---|---|
| FB frequency | INSUFFICIENT (`WINDOW_TOO_SHORT`, 3 posts, span 0 días) ✔ |
| IG frequency | INSUFFICIENT (`SAMPLE_TOO_SMALL`) ✔ |
| FB engagement | NOT_AVAILABLE (`METRICS_NULL`), totales NULL ✔ |
| IG engagement | `reactionTotal: 0`, `commentTotal: 0`; estado INSUFFICIENT ✔ |
| FB texto | 1 con texto, 2 sin texto → DETECTED (INFO) |
| IG caption | Presente → NOT_DETECTED ✔ |
| Frescura | FB e IG FRESH |
| Recencia | 7 días completos desde el último post → RECENT DETECTED en FB e IG (tras A3.5.4.1.2; antes NOT_DETECTED por el defecto F-1) |
| Tipos | `{photo: 3}` INSUFFICIENT; IG `{image: 1}` INSUFFICIENT |
| Cross-platform | Diferencia 0 días → NOT_DETECTED |
| Social Score / recomendaciones / tendencias | Ninguno ✔ |

---

## 20. Regression tests

Suite completa: **59 ficheros, 2104 tests superados** (antes: 58 / 2051; +53 de A3.5.4.1). Incluye las suites de:
- A3.5.1, A3.5.1.2 y A3.5.2.1 (Meta);
- A3.5.3 (read layer);
- GBP (A3.4.1, A3.4.2.2, listado de ubicaciones, reseñas);
- consentimiento y Meta Pixel (A3.5.1A, A3, A3.1);
- Auth, verificación de email y reset de contraseña;
- Stripe y billing;
- Hoy (A2.7.2), Plan (A2.7.3), Herramientas, Fuentes y Action Layer.

Type check: 0 errores en los ficheros nuevos. Persisten 20 avisos anteriores en 8 ficheros no relacionados (landings, legacy y un test GBP). No se tocaron.

---

## 21. Build result

`npm run build`: OK.

---

## 22. Frozen-phase verification

- **Ficheros:** no se modificó ningún fichero de `supabase/functions/meta-*`, `src/features/meta-connection/*` ni `supabase/migrations/*`. Conservan la marca de tiempo de la restauración del workspace, anterior al inicio de este trabajo.
- **Base de datos y servidor:** no se ejecutó `apply_migration` ni `deploy_edge_functions`.
- **Integraciones:** Hoy, Plan, Advisor, Twin, Resumen y Action Layer no se modificaron y no importan el motor.
- **Contratos con A3.5.3:** los tests verifican que siguen alineados con el motor.

---

## 23. Known limitations

1. Sin histórico: las tendencias y el crecimiento siguen siendo NOT_AVAILABLE (`NO_HISTORY`).
2. No se distingue por qué falta el engagement de FB (permiso denegado u omitido por Meta); solo `METRICS_NULL`.
3. `media_count` de IG (perfil) no forma parte del contrato de entrada. La cobertura "N de M publicaciones" queda para una fase posterior.
4. Las comparaciones cross-platform se limitan a la recencia. La frecuencia y el engagement entre plataformas no se comparan.
5. Con contenidos sin texto, la completitud se informa aunque la muestra sea LIMITED o INSUFFICIENT. A3.5.4.2 debe usar `sampleSufficiency` para no generalizar.
6. Aún no existe la función de lectura de `meta_content_items` para el navegador. Se añadirá con su primer consumidor (A3.5.4.3), para no dejar código sin uso.
7. Con los datos reales actuales, casi todas las dimensiones son INSUFFICIENT. Es el comportamiento correcto.

---

## 24. Exact next step

**A3.5.4.1 — Real-data validation.** Ejecutar el motor sobre las filas reales actuales (FB 3, IG 1), leídas en solo lectura, y confirmar formalmente:
- FB frequency = INSUFFICIENT;
- IG frequency = INSUFFICIENT;
- FB engagement = NOT_AVAILABLE;
- IG engagement conserva los ceros reales;
- sin Social Score, sin recomendaciones, sin tendencias.

Después, decidir la congelación. No implementar A3.5.4.2 hasta entonces.

GO — READY FOR A3.5.4.1 REAL-DATA VALIDATION
