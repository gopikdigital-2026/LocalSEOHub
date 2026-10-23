# A3.5.4.0 — SOCIAL INTELLIGENCE CAPABILITY AUDIT

Fecha: 2026-10-22
Modo: auditoría / diseño. READ-ONLY.
No se ha modificado código, base de datos, datos de producción, Edge Functions ni permisos Meta. No se ha implementado ningún motor.

Fuentes auditadas: esquema real en producción (`meta_connections`, `meta_sync_state`, `meta_content_items`), migraciones A3.5.1–A3.5.3, Edge Function `meta-read` (`handler.ts`, `index.ts`), normalizadores, frontend `meta-connection/*`, tests `a353MetaReadLayer`, y los puntos de integración existentes (`actions/rules.ts`, `today-intelligence/model.ts`, `roadmap/model.ts`, `digital-twin/engine.ts`, `business-advisor-v2/logic.ts`).

---

## 1. Executive verdict

**GO — SOCIAL INTELLIGENCE ARCHITECTURE READY**

Los datos reales disponibles permiten construir un motor determinista de señales de **actividad, recencia, completitud y disponibilidad de datos**, con trazabilidad completa hasta la fila de Meta y con una semántica clara de NULL / sin datos / datos antiguos.

GO significa solo que la arquitectura es suficientemente segura y veraz para empezar A3.5.4.1. No significa que Social Intelligence esté implementado.

Límites asumidos (no bloquean A3.5.4.1, ver §20):
- No hay histórico: cada sincronización sustituye la ventana de contenidos y el perfil → **tendencias y crecimiento son imposibles hoy**.
- Engagement de Facebook = NULL en producción y no se registra el motivo → solo puede tratarse como "no disponible".
- Muestra actual mínima (FB 3, IG 1) → casi todas las dimensiones quedarán en INSUFFICIENT/LIMITED para la cuenta de prueba, que es el comportamiento correcto.
- **Social Score: posponer** (§12).

---

## 2. Current real-data inventory

### Tablas
| Tabla | Rol | Lectura desde navegador |
|---|---|---|
| `meta_connections` | Conexión, Página e IG seleccionados, permisos concedidos, estado | SELECT propio (RLS), sin grants de escritura |
| `meta_sync_state` | Una fila por plataforma: estado, error, recuento, perfil normalizado, timestamps | SELECT propio (RLS) |
| `meta_content_items` | Publicaciones/media recientes normalizados | SELECT propio (RLS). Hoy **ningún** componente frontend la lee |

### Estado real en producción (cuenta de prueba)
| Dato | Facebook | Instagram |
|---|---|---|
| status | ok | ok |
| last_success_at | 2026-10-22 17:22:26 UTC | 2026-10-22 17:22:26 UTC |
| items | 3 | 1 |
| pages_fetched | 1 | 1 |
| Fechas de publicación | 2026-10-14 22:07, 22:12, 22:27 UTC | 2026-10-14 22:26 UTC |
| content_type | photo ×3 | image ×1 |
| Texto | 1 de 3 con mensaje | 1 de 1 con caption |
| Engagement | reaction_count NULL ×3, comment_count NULL ×3 | like 0, comments 0 (valores enviados por Meta) |
| Perfil | fan_count 0, followers_count 0 | followers 2, follows (numérico), media_count 1 |

Observación: las 3 publicaciones de Facebook se hicieron en un intervalo de 20 minutos del mismo día → no hay base para medir frecuencia.

### Restricciones estructurales relevantes
- Ventana: máximo 25 por página × 4 páginas = **100 elementos por plataforma**; los que dejan de aparecer se borran.
- Sin histórico de contenidos ni de perfil (`profile` se sobrescribe en cada sincronización correcta).
- La sincronización solo ocurre al pulsar "Sincronizar" (no hay sincronización programada).
- `meta_connections.last_synced_at` es el momento de conexión de A3.5.2 → **excluido** como referencia. La referencia es `meta_sync_state.last_success_at`.

---

## 3. Facebook capabilities

| Campo | Origen | Almacenado en | Clasificación |
|---|---|---|---|
| Page ID | selección A3.5.2 | `meta_connections.page_id`, `meta_sync_state.external_account_id`, `meta_content_items.account_external_id` | AVAILABLE |
| Nombre de Página | Meta | `meta_connections.page_name`, `profile.name` | AVAILABLE |
| Categoría | Meta | `profile.category` | NULLABLE |
| About | Meta | `profile.about` | NULLABLE |
| Enlace de Página | Meta | `profile.link` | NULLABLE |
| Web | Meta | `profile.website` | NULLABLE (null en prod) |
| fan_count | Meta | `profile.fan_count` | NULLABLE (0 real en prod) |
| followers_count | Meta | `profile.followers_count` | NULLABLE (0 real en prod) |
| Post ID | Meta | `external_id` | AVAILABLE |
| created_time | Meta | `published_at` | NULLABLE (si Meta envía una fecha no parseable) |
| message | Meta | `text_content` | NULLABLE (2 de 3 null en prod) |
| permalink_url | Meta | `permalink` | NULLABLE |
| status_type → tipo | Meta | `content_type` (photo/video/link/status/event/post) | AVAILABLE (fallback `post`) |
| reactions total | Meta (summary) | `reaction_count` | NULLABLE (NULL en prod) |
| comments total | Meta (summary) | `comment_count` | NULLABLE (NULL en prod) |
| Fecha de lectura | servidor | `fetched_at`, `last_success_at` | AVAILABLE |
| Shares, reach, impresiones, clics, vídeo views, texto de comentarios, autores, media URL, hashtags | — | — | NOT AVAILABLE |
| Historial de seguidores | — | — | NOT AVAILABLE |

---

## 4. Instagram capabilities

| Campo | Almacenado en | Clasificación |
|---|---|---|
| IG account ID | `meta_connections.instagram_account_id`, `external_account_id` | AVAILABLE (solo si `instagram_status = connected`) |
| username | `meta_connections.instagram_username`, `profile.username` | AVAILABLE |
| name | `profile.name` | NULLABLE |
| biography | `profile.biography` | NULLABLE |
| website | `profile.website` | NULLABLE (null en prod) |
| followers_count | `profile.followers_count` | NULLABLE |
| follows_count | `profile.follows_count` | NULLABLE |
| media_count | `profile.media_count` | NULLABLE (permite medir cobertura de la ventana) |
| media ID | `external_id` | AVAILABLE |
| timestamp | `published_at` | NULLABLE |
| caption | `text_content` | NULLABLE |
| media_type / media_product_type → tipo | `content_type` (image/video/reel/carousel/other) | AVAILABLE |
| permalink | `permalink` | NULLABLE |
| like_count | `reaction_count` | NULLABLE (Meta lo omite si los likes están ocultos) |
| comments_count | `comment_count` | NULLABLE |
| Reach, impresiones, guardados, compartidos, reproducciones, stories, texto de comentarios, demografía, historial de seguidores | — | NOT AVAILABLE |

---

## 5. Deterministic metrics

Todas se calculan sin IA y solo a partir de filas propias (RLS) con `status` en `ok`/`empty`.

**A. Recency**
- `last_post_at = max(published_at)` ignorando NULL.
- `days_since_last_post = floor((now − last_post_at) / 1 día)`.
- Presencia/ausencia de publicaciones en los últimos 30 días.
- Si no hay ningún `published_at`, el resultado es NOT ENOUGH DATA, no "inactivo".

**B. Frequency**
- `observed_posts` = número de elementos con fecha.
- `observed_span_days` = (último − primero).
- Mediana de intervalos entre publicaciones consecutivas. Se usa la mediana, no la media, para no deformar por ráfagas como la de la cuenta de prueba.
- Publicaciones por 30 días = `observed_posts / max(span, 1) × 30`, solo si la suficiencia es SUFFICIENT (§6).
- Ventana truncada si `item_count ≥ 100` o `pages_fetched ≥ 4`. En ese caso la frecuencia es un **mínimo observado** y se etiqueta así.

**C. Platform activity**
- Actividad por plataforma: `active` = publicación en ≤ 30 días; `quiet` = 31–60 días; `inactive_observed` = > 60 días; `unknown` cuando no es evaluable.
- Instagram `not_linked` → plataforma no aplicable, nunca "inactiva".

**D. Content completeness**
- Porcentaje de elementos con `text_content` NULL.
- Porcentaje con `permalink`.
- Distribución por `content_type` y número de tipos distintos.
- No se evalúa la calidad del texto.

**E. Engagement availability**
- Porcentaje de elementos con `reaction_count` / `comment_count` no NULL.
- Si todos son NULL → engagement NOT AVAILABLE para esa plataforma.
- La media de engagement por publicación solo se calcula sobre elementos no NULL y si la suficiencia lo permite. Nunca se suma un NULL como 0.
- Publicaciones de menos de 48 h se excluyen del engagement, porque es inestable.

**F. Cross-platform**
- Diferencia de `days_since_last_post` entre plataformas, solo si ambas son evaluables.
- Ratio de publicaciones observadas en el mismo intervalo de tiempo, solo si ambas tienen frecuencia SUFFICIENT.
- Se presentan como hechos ("Instagram: última publicación hace 40 días; Facebook: hace 3 días"), sin juicio de calidad.

**Cobertura (IG):** `coverage = items / media_count` (si `media_count` no es NULL). Sirve para indicar "analizamos N de M publicaciones".

---

## 6. Sample sufficiency policy

Umbrales internos de LocalSEOHub, conservadores y explicables. **No son benchmarks de mercado** y deben comunicarse como "mínimo de datos para poder evaluar".

Precondición para todas las dimensiones: plataforma con `status` en `ok`/`empty` y frescura distinta de STALE (§11); si no, la dimensión no se evalúa.

| Dimensión | SUFFICIENT | LIMITED | INSUFFICIENT |
|---|---|---|---|
| Recency | ≥ 1 publicación con fecha | — | 0 publicaciones con fecha |
| Frequency | ≥ 8 publicaciones con fecha **y** span ≥ 28 días | 3–7 publicaciones **o** span 7–27 días | < 3 publicaciones **o** span < 7 días |
| Engagement | ≥ 10 publicaciones de > 48 h con métrica no NULL **y** ≥ 80 % de cobertura | 3–9 publicaciones con métrica | < 3 publicaciones con métrica, o todas NULL (estado NOT AVAILABLE) |
| Completitud de contenido | ≥ 5 publicaciones | 2–4 | < 2 |
| Variedad de tipos | ≥ 8 publicaciones | — | < 8 (no se emite señal de variedad) |
| Tendencias | **Nunca evaluable** sin histórico (§20) | — | Siempre INSUFFICIENT |
| Cross-platform recency | Recency SUFFICIENT en ambas | — | Alguna no evaluable |
| Cross-platform frequency | Frequency SUFFICIENT en ambas | — | Cualquier otro caso |

Cuenta de prueba (hoy): recency FB/IG = SUFFICIENT (7 días); frequency FB = INSUFFICIENT (span 0 días), IG = INSUFFICIENT (1 publicación); engagement FB = NOT AVAILABLE, IG = INSUFFICIENT; completitud FB = LIMITED, IG = INSUFFICIENT; tendencias = INSUFFICIENT.

Texto obligatorio cuando una dimensión es INSUFFICIENT: "Todavía no hay suficientes datos para evaluar esta dimensión", indicando además qué falta (p. ej., "necesitamos al menos 8 publicaciones repartidas en 4 semanas").

---

## 7. Signal catalogue

Convención: `signal_key`, plataforma (FB / IG / BOTH / ANY), severidad posible (`info` / `attention` / `priority`). Ninguna señal usa benchmarks externos.

| signal_key | Plataforma | Datos | Condición | No se evalúa si | Severidad | Evidencia obligatoria | Riesgo de mala interpretación |
|---|---|---|---|---|---|---|---|
| SOCIAL_SYNC_REQUIRED | ANY | sync_state | `status = never` o sin fila | — | attention | estado | Bajo |
| SOCIAL_SYNC_ERROR | FB/IG | status, error_code, last_success_at | status ∈ permission_unavailable/rate_limited/malformed/api_error | — | attention | status, error_code, last_success_at | Confundir con inactividad → bloquea el resto de señales de esa plataforma |
| SOCIAL_REAUTH_REQUIRED | ANY | status | `reauth_required` | — | priority | status | Bajo |
| SOCIAL_DATA_STALE | FB/IG | last_success_at | frescura STALE (§11) | Sin last_success_at | attention | last_success_at, días | Bajo |
| IG_NOT_LINKED | IG | instagram_status | `not_linked` | — | info | estado | Presentarlo como fallo; es un hecho neutro |
| SOCIAL_LOW_SAMPLE | FB/IG | items con fecha | Frequency INSUFFICIENT | Sync no ok | info | observed_posts, span_days | Bajo |
| FB_RECENT_ACTIVITY / IG_RECENT_ACTIVITY | FB/IG | published_at | days_since_last_post ≤ 30 | Recency INSUFFICIENT, STALE o error | info | last_post_at, days | Bajo |
| FB_NO_RECENT_ACTIVITY / IG_NO_RECENT_ACTIVITY | FB/IG | published_at | 31–60 días | Ídem | attention | last_post_at, days | Puede ser estacional o deliberado |
| FB_LONG_INACTIVITY / IG_LONG_INACTIVITY | FB/IG | published_at | > 60 días | Ídem | attention (priority solo si la plataforma está en los objetivos del negocio, en una fase futura) | last_post_at, days | Puede no usar la red a propósito |
| SOCIAL_NO_CONTENT | FB/IG | status = empty | 0 publicaciones observadas | Sync no ok | attention | status, last_success_at | Meta solo devuelve publicaciones publicadas por la Página |
| FB_IG_RECENCY_GAP | BOTH | recency de ambas | Una ≤ 30 días y la otra > 60 días | Alguna no evaluable | info | last_post_at y days de ambas | No implica que una sea mejor |
| FB_IG_FREQUENCY_GAP | BOTH | frecuencia de ambas | Ratio ≥ 3× en el mismo intervalo | Frequency no SUFFICIENT en ambas | info | posts/30d de ambas, span | Ídem |
| ENGAGEMENT_DATA_UNAVAILABLE | FB/IG | reaction/comment_count | 100 % NULL | Sin items | info | n items, n NULL | Confundir con "0 interacciones" → prohibido |
| ENGAGEMENT_LIMITED_SAMPLE | FB/IG | métricas no NULL | Engagement LIMITED | — | info | n con métrica | Bajo |
| CAPTION_MISSING_SHARE | FB/IG | text_content | ≥ 50 % sin texto | Completitud INSUFFICIENT | info | n sin texto / n total | En IG el caption es casi siempre visible; en FB las fotos sin texto son habituales → solo info |
| CONTENT_TYPE_SINGLE | FB/IG | content_type | 1 tipo distinto | Variedad INSUFFICIENT | info | distribución | No implica peor rendimiento |
| WINDOW_TRUNCATED | FB/IG | item_count, pages_fetched | ≥ 100 items o 4 páginas | — | info | item_count, pages | Frecuencia mínima, no exacta |
| IG_PARTIAL_COVERAGE | IG | media_count, items | items < media_count | media_count NULL | info | items / media_count | Bajo |

Señales **descartadas** por falta de datos: crecimiento de seguidores, mejor hora/día de publicación, rendimiento por tipo de contenido (requiere engagement SUFFICIENT por tipo), sentimiento de comentarios, alcance, tendencias, comparación con competidores.

Señales a la espera de suficiencia: engagement medio por publicación (solo con engagement SUFFICIENT; se presenta como valor observado y nunca como "bueno/malo" sin referencia propia histórica).

---

## 8. Evidence model

```
Observation (filas reales: meta_content_items / meta_sync_state)
  → Metric        (valor calculado + sufficiency + freshness)
  → Signal        (signal_key, platform, severity, evaluated|not_evaluated + motivo)
  → Evidence      (lista de pares {field, value, source, as_of})
  → Finding       (frase factual, plantilla determinista, ES/EN)
  → Recommendation(class DIRECT|CONTEXTUAL, plantilla, condiciones)
```

Contrato mínimo de Evidence:
- `source`: `meta_content_items` | `meta_sync_state` | `meta_connections`.
- `as_of`: `meta_sync_state.last_success_at` de la plataforma.
- `values`: solo valores reales o derivados aritméticamente (p. ej., `last_post_at`, `days_since_last_post`, `observed_posts`, `null_metric_count`).
- `sample`: `{ sufficiency, n, span_days }`.
- Referencias opcionales a `external_id` y `permalink` para que el usuario pueda abrir la publicación.

Ejemplo:
- Signal `IG_LONG_INACTIVITY`
- Evidence `last_post_at=2026-08-01`, `days_since_last_post=82`, `as_of=2026-10-22T17:22Z`
- Finding: "No hemos encontrado publicaciones en Instagram desde el 1 ago 2026 (hace 82 días)."
- Recommendation (CONTEXTUAL): "Si Instagram forma parte de tu estrategia, valora publicar contenido nuevo."
- "¿Por qué me dices esto?" → muestra la evidencia y la fecha de sincronización.

Regla: sin Evidence no hay Finding; sin Finding no hay Recommendation.

---

## 9. Recommendation safety

| Clase | Definición | Ejemplo | Permitida |
|---|---|---|---|
| DIRECT | Reformula un hecho observado | "No has publicado en Facebook en los últimos 45 días." | Sí |
| CONTEXTUAL | Sugerencia razonable condicionada, sin resultado prometido | "Valora retomar una publicación regular si Facebook es importante para tu negocio." | Sí, con lenguaje condicional |
| UNSUPPORTED | Promete resultados, cuantifica impacto, compara con terceros o cita benchmarks sin datos | "Publica 4 veces por semana para aumentar un 30 % tus ventas." / "Tu competencia publica más." | **No** |

Reglas para impedir UNSUPPORTED:
1. Las recomendaciones son plantillas cerradas versionadas en código, asociadas a un `signal_key`. No hay texto libre generado.
2. Lista de términos prohibidos verificada en tests: aumentará, garantiza, ventas, clientes, ingresos, %, competencia/competidores, "lo normal es", "la media del sector", "el algoritmo premia".
3. Ninguna plantilla contiene cifras salvo las de la Evidence.
4. CONTEXTUAL siempre incluye un condicional ("si…", "valora…", "puede ayudar a…"), nunca imperativos de resultado.
5. Sin recomendaciones si la plataforma está en STALE, SYNC ERROR o REAUTH: solo la acción de reparar (sincronizar o reconectar).
6. Máximo de recomendaciones visibles por plataforma (p. ej., 2) y deduplicación por `signal_key`, para evitar repetirse.
7. Si en el futuro interviene la IA, solo puede reformular plantillas ya permitidas (§13).

---

## 10. Null/no-data semantics

| Estado | Significado | Origen | Presentación |
|---|---|---|---|
| `0` | Meta devolvió explícitamente cero | número 0 en la columna | "0" |
| `NULL` | Meta no entregó el valor | columna NULL | "No disponible" (nunca 0, nunca omitido en medias) |
| NO DATA | Sincronización correcta sin contenidos | `status = empty` | "No hemos encontrado publicaciones" |
| NOT AVAILABLE | La métrica no existe con los permisos/campos actuales | catálogo (§3–4, §16) | "LocalSEOHub no puede leer este dato con la conexión actual" |
| NOT ENOUGH DATA | Hay datos, pero no alcanzan la suficiencia | §6 | "Todavía no hay suficientes datos para evaluar…" + qué falta |
| SYNC ERROR | Última lectura fallida | status de error | Motivo + fecha de los datos anteriores; sin señales nuevas |
| STALE DATA | Última sincronización correcta demasiado antigua | §11 | "Datos del <fecha>"; sin recomendaciones como actuales |
| NOT LINKED | IG no vinculado a la Página | `not_linked` | "Sin cuenta de Instagram vinculada"; neutral |
| REAUTH | Token caducado/revocado | `reauth_required` | "Vuelve a conectar con Meta"; sin análisis |
| NEVER | Nunca sincronizado | `never` / sin fila | "Sincroniza para analizar" |

Casos exigidos:
- **Conexión válida sin contenidos** → NO DATA + `SOCIAL_NO_CONTENT`; no hay frecuencia ni engagement.
- **Métricas NULL** → `ENGAGEMENT_DATA_UNAVAILABLE`; recencia y frecuencia siguen evaluándose.
- **FB con datos e IG sin datos** → se evalúa cada plataforma por separado; las señales cruzadas no se evalúan.
- **IG conectado sin publicaciones** → NO DATA en IG (distinto de NOT LINKED).
- **Sincronización parcial** → la plataforma correcta se evalúa; la fallida queda en SYNC ERROR; el estado general es "parcial".
- **Error de sincronización** → no se generan señales nuevas para esa plataforma. Los datos anteriores se pueden mostrar como históricos y fechados.
- **Token expirado** → REAUTH para ambas; nada de análisis.
- **Datos antiguos** → STALE: hechos fechados, sin recomendaciones como actuales.
- **Muestra pequeña** → NOT ENOUGH DATA por dimensión, sin agregados.

---

## 11. Freshness policy

Referencia única: `meta_sync_state.last_success_at` por plataforma. Nunca `meta_connections.last_synced_at`.

| Estado | Edad de last_success_at | Efecto |
|---|---|---|
| FRESH | ≤ 7 días | Señales y recomendaciones normales |
| AGING | 8–30 días | Señales con aviso "Datos del <fecha>"; recomendaciones permitidas con la fecha visible; botón Sincronizar destacado |
| STALE | > 30 días o NULL | Solo hechos fechados y la acción "Sincroniza para actualizar"; sin recomendaciones como actuales |

Reglas:
- La frescura se evalúa por plataforma; el estado general toma el peor de las plataformas aplicables.
- `days_since_last_post` se calcula siempre contra `now`, pero la Evidence muestra `as_of`. Si los datos son AGING, la frase debe indicarlo: "según los datos del 22 oct".
- Un status de error con `last_success_at` reciente no se considera FRESH para nuevas señales: prevalece SYNC ERROR.
- Hoy no hay sincronización automática → STALE será frecuente. Una sincronización programada es una evolución opcional separada (no en A3.5.4).

---

## 12. Social Score decision

**Recomendación: B) POSPONER.**

Motivos:
- Con 3 + 1 publicaciones, engagement de FB NULL y sin histórico, cualquier 0–100 sería falsa precisión: el número cambiaría de forma brusca por una sola publicación.
- No hay referencia legítima para normalizar (no hay benchmarks reales ni histórico propio). Una escala inventada violaría la regla de veracidad.
- El Digital Twin ya usa un modelo de bandas de conocimiento; añadir otro número compite con él y confunde.
- Las bandas cualitativas por dimensión (§6 + §5C) aportan el mismo valor sin precisión fingida.

Condiciones mínimas antes de replantearlo:
1. Histórico de snapshots (contenido y perfil) de ≥ 90 días.
2. Frequency SUFFICIENT en las plataformas evaluadas.
3. Engagement SUFFICIENT (≥ 80 % de cobertura no NULL) en al menos una plataforma.
4. Referencia basada en el propio histórico del negocio, no en benchmarks externos.
5. Descomposición explicable (cada punto trazable a una señal) y estado "sin puntuación" cuando falten datos.

---

## 13. AI boundaries

Arquitectura futura:

```
REAL DATA → DETERMINISTIC SIGNALS → EVIDENCE → RULE-BASED FINDINGS → (opcional) AI EXPLANATION
```

| Capa | Rol | Fuente de verdad | Fase |
|---|---|---|---|
| DETERMINISTIC ENGINE | Métricas, suficiencia, frescura, señales, findings, recomendaciones de plantilla | Filas reales | A3.5.4.1–4.2 |
| AI INTERPRETATION | Reformular findings ya calculados en lenguaje natural, adaptándolos al perfil del negocio | Solo el JSON de findings + evidence; nunca filas crudas ni Graph | Posterior, opcional |
| AI CONTENT GENERATION | Ideas de posts, copies, calendario | Perfil del negocio + findings | Posterior; podría reutilizar el ledger de uso de IA de weekly-content |

Reglas para la IA:
- Nunca es fuente de datos ni de métricas.
- No puede introducir cifras, fechas ni entidades que no estén en la Evidence. Se valida la salida (números ⊆ Evidence) y, si falla, se cae a la plantilla determinista.
- Hereda la lista de términos prohibidos (§9) y el patrón `not_available` del Advisor.
- La interpretación con IA se etiqueta como tal y siempre enlaza a la Evidence.
- Pasa por el sistema de límites y reservas de uso de IA ya existente.

---

## 14. UI requirements

Necesidades funcionales de una futura pantalla (no diseñada):

1. **Estado general**: OK / parcial / error / reconectar / sin sincronizar, con la frescura (FRESH/AGING/STALE) y "Última sincronización" por plataforma, tomada de `last_success_at`.
2. **Facebook** e **Instagram** por separado: estado, nº de publicaciones analizadas (y cobertura en IG), última publicación, actividad observada.
3. **Actividad reciente**: lista de las últimas publicaciones (fecha, tipo, extracto, enlace a Meta). Métricas visibles solo si no son NULL; si lo son, "No disponible".
4. **Hallazgos**: findings con severidad y el botón "¿Por qué?" que muestra la Evidence.
5. **Prioridades / acciones recomendadas**: máximo 1–2 por plataforma, con su clase (DIRECT/CONTEXTUAL) implícita en la redacción.
6. **Datos insuficientes**: bloque explícito por dimensión ("Frecuencia: necesitamos al menos 8 publicaciones en 4 semanas").
7. **Datos no disponibles con la conexión actual**: alcance, impresiones, comentarios, etc.
8. **Acciones de reparación**: Sincronizar / Reconectar, reutilizando los flujos congelados.

Ubicación sugerida: sección ampliable dentro de /fuentes en el bloque Meta, o una subpágina propia. Se decide en A3.5.4.3.

---

## 15. LocalSEOHub integration map

| Superficie | Punto de integración actual | Uso futuro | Precondición |
|---|---|---|---|
| HOY | `today-intelligence/model.ts` (`TodayAction`, `KEY_ORDER`, `TODAY_MAX = 3`) | Como máximo 1 acción social (p. ej., reconectar Meta, sincronizar datos STALE, actividad tras larga inactividad) | Señal evaluada, FRESH/AGING, sin desplazar prioridades GBP/perfil sin una regla explícita |
| PLAN | `roadmap/model.ts` (`MISSION_KEYS`, fases now/next/later) | Misión "Retomar actividad en Instagram/Facebook", "Completar textos de publicaciones" | Nueva `ActionKey` social y regla de fase |
| ACCIONES | `actions/rules.ts` (`ACTION_RULES`, `EvaluationContext`), categoría `content` existente | Reglas sociales con dedup por `signal_key` | El contexto de evaluación debe aceptar un snapshot social |
| ADVISOR | `business-advisor-v2/logic.ts` (`BusinessFacts`, `connected_sources`, `not_available`, `NEVER_KNOWN`) | Añadir hechos sociales verificados (last_post_at, actividad, disponibilidad) y mantener engagement, reach y tendencias en `not_available` | Server-side: leer las tablas con service role filtrando por user_id; no se comparte código entre funciones |
| TWIN | `digital-twin/engine.ts` (`Provenance = 'verified'`, bloques) | Provenance `verified` para la presencia social (Página/IG existen, última actividad); posible bloque `social` | Decidir si afecta a `TWIN_WEIGHTS` (recomendación: no en la primera versión) |
| RESUMEN | `WeeklySummaryPage` | Línea "Situación social" factual y fechada | Señales disponibles |

Fases necesarias: A3.5.4.4a (Hoy + Plan + Acciones) y A3.5.4.4b (Advisor + Twin + Resumen), separadas porque la segunda toca una Edge Function con IA y el modelo del Twin.

---

## 16. Meta permission limitations

Permisos congelados: `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic` (+ `public_profile` por defecto).

Lo que **no** se puede analizar con ellos:

| Análisis | Motivo |
|---|---|
| Alcance, impresiones, clics, vídeo views, demografía (FB) | Requiere permisos de insights de Página (`read_insights`) |
| Alcance, impresiones, guardados, compartidos, reproducciones, demografía (IG) | Requiere `instagram_manage_insights` |
| Texto y autores de comentarios | Fuera de alcance; requeriría permisos de contenido de usuarios/comentarios |
| Mensajes / DMs | Requiere permisos de mensajería |
| Publicar o programar | Requiere permisos de publicación |
| Anuncios y resultados | Requiere permisos de Ads |
| Moderación | Requiere permisos de gestión |
| Stories IG | No se solicitan y no están en `/media` |
| Totales de reacciones/comentarios FB | Disponibles solo cuando Meta los entrega; en producción hoy = NULL |

Cualquier ampliación sería una fase futura separada, con App Review y auditoría propias. No se propone en A3.5.4.

---

## 17. Privacy/data minimization

- Los datos actuales **son suficientes** para el catálogo de §7. Social Intelligence no necesita payloads de Meta ni campos nuevos para A3.5.4.1–4.4.
- Las señales y findings pueden calcularse al vuelo desde las tablas existentes → **no hace falta persistir señales** en la primera versión. Así se evita duplicar datos y que queden desfasados.
- Los textos (`text_content`) se usan solo para comprobar si existen y para mostrar un extracto; no se envían a la IA en A3.5.4.1–4.4.
- La purga existente (desconexión o cambio de Página/IG) cubre todo lo derivado si no se persiste nada nuevo.

Campos futuros posibles (no implementar):

| Campo | Para qué | Justificación |
|---|---|---|
| `meta_sync_state.engagement_status` (`available` / `denied` / `omitted`) | Explicar el motivo de `ENGAGEMENT_DATA_UNAVAILABLE` | Hoy no se distingue el reintento por permiso de la simple omisión de Meta. Solo un enum, sin payload |
| Tabla de snapshots diarios de agregados (nº posts, followers_count, media_count) | Tendencias, crecimiento, Social Score | Sin esto las tendencias son imposibles. Solo agregados, sin contenido |
| `meta_sync_state.window_truncated` | Señal `WINDOW_TRUNCATED` exacta | Hoy se infiere de item_count/pages_fetched |

---

## 18. Proposed A3.5.4 phases

| Fase | Alcance cerrado | Toca | No toca |
|---|---|---|---|
| **A3.5.4.0** | Esta auditoría | — | Todo |
| **A3.5.4.1 — Deterministic Social Signals Engine** | Módulo puro (sin E/S) que recibe filas de `meta_sync_state` + `meta_content_items` y `now`, y devuelve métricas, suficiencia, frescura y señales con Evidence. Lectura de solo SELECT bajo RLS. Tests exhaustivos (NULL ≠ 0, todos los estados de §10, umbrales de §6, ventana truncada) | Nuevo módulo + función de lectura en el repositorio Meta | BD, Edge Functions, UI, fases congeladas |
| **A3.5.4.2 — Findings & Recommendations** | Plantillas ES/EN por `signal_key`, clases DIRECT/CONTEXTUAL, lista prohibida verificada por test, límites y dedup | Módulo de copy + reglas | UI, IA |
| **A3.5.4.3 — Social Intelligence UI** | Vista de solo lectura según §14, "¿Por qué?", estados vacíos/error/STALE | Frontend | Hoy/Plan/Advisor/Twin |
| **A3.5.4.4a — Hoy / Plan / Acciones** | ≤ 1 acción social en Hoy, misiones en Plan | Reglas de acciones/roadmap | Advisor, Twin |
| **A3.5.4.4b — Advisor / Twin / Resumen** | Hechos sociales verificados como contexto; provenance `verified` | Edge Function advisor (contexto), twin, resumen | Prompts de IA más allá del bloque de hechos |
| **A3.5.4.5 — Post-E2E Audit & Freeze** | Auditoría real | — | — |

Evoluciones **fuera** de A3.5.4 (fases independientes, cada una con su auditoría): histórico/snapshots y tendencias; sincronización programada; interpretación con IA; generación de contenido con IA; ampliación de permisos (insights) y Social Score.

---

## 19. Risks

| # | Riesgo | Prioridad | Mitigación |
|---|---|---|---|
| R1 | IA inventando conclusiones o cifras | P0 | Sin IA en 4.1–4.4; luego, IA solo sobre findings, validando que los números ⊆ Evidence y con fallback a plantilla |
| R2 | Mezcla entre usuarios | P0 | Solo lectura bajo RLS (`auth.uid() = user_id`); en servidor, filtrar siempre por el user_id del JWT. Test obligatorio |
| R3 | NULL tratado como 0 | P0 | Tipos `number \| null` sin coalescencia; tests con fixtures de todos NULL; métricas FB NULL en producción como caso real |
| R4 | Recomendaciones demasiado fuertes o de resultado | P1 | Plantillas cerradas, lista prohibida en tests, clases DIRECT/CONTEXTUAL |
| R5 | Falsa precisión con poca muestra | P1 | Política de suficiencia §6, sin Social Score |
| R6 | Datos antiguos presentados como actuales | P1 | Política de frescura §11 basada en `last_success_at`; sin recomendaciones en STALE |
| R7 | Usar `meta_connections.last_synced_at` por error | P1 | Prohibido en el motor; test que lo verifica |
| R8 | Token caducado o permisos retirados | P2 | Estados REAUTH / SYNC ERROR bloquean el análisis; flujos congelados de reconexión |
| R9 | Cambios en Graph API (campos que desaparecen o cambian de tipo) | P2 | Normalizadores existentes convierten lo desconocido en NULL; el motor no depende de campos opcionales |
| R10 | Dependencia de Meta (rate limits, caídas) | P2 | Análisis sobre datos persistidos; cooldown existente |
| R11 | Ventana truncada (100) interpretada como el total | P2 | Señal `WINDOW_TRUNCATED` y frecuencia como mínimo |
| R12 | Recomendaciones repetitivas | P2 | Dedup por signal_key, máximo por plataforma, integración con estados COMPLETED/DISMISSED de acciones |
| R13 | Duplicados | P3 | UNIQUE `(connection_id, platform, external_id)` ya verificado en A3.5.3.1 |
| R14 | Permisos insuficientes para métricas avanzadas | P3 | Comunicado como NOT AVAILABLE; ampliación solo en una fase separada |
| R15 | Interpretar la ausencia de IG o la inactividad como fallo del negocio | P2 | IG_NOT_LINKED es neutro; las señales cruzadas son `info` sin juicio |

---

## 20. Foundation gaps

No hay gaps que bloqueen A3.5.4.1. Gaps conocidos, aceptados y documentados:

| Gap | Impacto | ¿Bloquea 4.1? | Resolución |
|---|---|---|---|
| G1. Sin histórico de contenido ni de perfil | Tendencias, crecimiento y Social Score imposibles | No (esas dimensiones quedan siempre INSUFFICIENT) | Fase futura de snapshots |
| G2. No se registra el motivo del engagement NULL | Solo se puede decir "no disponible", sin el porqué | No | Campo `engagement_status` futuro (§17) |
| G3. Sin sincronización automática | STALE frecuente | No (la política de frescura lo gestiona) | Fase futura opcional |
| G4. `meta_content_items` no se lee aún en el frontend | — | No: la política RLS de SELECT ya existe | Lectura en 4.1 |
| G5. Muestra de la cuenta de prueba mínima | El E2E de 4.x verá sobre todo estados INSUFFICIENT | No | Validar los umbrales con fixtures; E2E real con más publicaciones cuando las haya |

---

## 21. Exact next step

**A3.5.4.1 — Deterministic Social Signals Engine**, con este alcance cerrado:

1. Un módulo puro que reciba `MetaSyncStateRow[]`, filas de `meta_content_items` y `now`, y devuelva por plataforma: frescura (§11), métricas (§5), suficiencia por dimensión (§6) y la lista de señales del §7 con Evidence (§8), incluidas las señales no evaluadas y su motivo.
2. Una función de lectura de solo SELECT (RLS) de `meta_content_items` en el repositorio Meta.
3. Sin migraciones, sin Edge Functions, sin UI, sin IA, sin cambios en fases congeladas.
4. Tests que cubran: NULL ≠ 0, cada estado de §10, cada umbral de §6, AGING/STALE, ventana truncada, IG not_linked vs vacío, sincronización parcial, y que nunca se use `meta_connections.last_synced_at`.

---

**VEREDICTO: GO — SOCIAL INTELLIGENCE ARCHITECTURE READY**
