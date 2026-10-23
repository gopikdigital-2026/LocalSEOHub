# A3.5.4.1.2 — Recency Boundary Consistency Hotfix

Fecha de evaluación de referencia: 2026-10-22T18:04:26.817Z
Alcance: hotfix limitado de la lógica de recencia del motor determinista de señales sociales (A3.5.4.1). No congela A3.5.4.1.

---

## 1. Root cause

Defecto F-1, detectado en A3.5.4.1.1. La evidencia y las decisiones medían el tiempo con unidades distintas:

- **Evidencia:** `daysSinceLastPost = floor(elapsed / DAY_MS)`, en días completos.
- **Decisión RECENT:** `elapsedMs <= 7 * DAY_MS`, en milisegundos exactos.
- **Decisión LONG_INACTIVITY:** `elapsedMs > 30 * DAY_MS`, en milisegundos exactos.
- **Cross-platform:** `FB_ONLY` / `IG_ONLY` decidían en milisegundos, pero `PLATFORM_RECENCY_DIFFERENCE` restaba días completos.

Consecuencias:

- Con un post de hace 7 d 19 h, la evidencia decía `daysSinceLastPost: 7, thresholdDays: 7` pero el estado era NOT_DETECTED.
- Con 30 d 23 h 59 m, LONG_INACTIVITY era DETECTED con `daysSinceLastPost: 30` y `thresholdDays: 30`.

En los dos casos, la evidencia contradecía la decisión.

## 2. Decisión aplicada (Option A)

Todas las decisiones de recencia usan `daysSinceLastPost`, ya existente (floor del tiempo transcurrido exacto entre `evaluatedAt` y `newestObservedPostAt`). La evidencia no cambia a horas.

## 3. Semántica canónica

| Estado | Regla |
|---|---|
| RECENT | `daysSinceLastPost` ≤ 7 |
| INTERMEDIATE | 8 ≤ `daysSinceLastPost` ≤ 30 |
| LONG INACTIVITY | `daysSinceLastPost` ≥ 31 |

Los días son transcurridos (bloques de 24 h), no días de calendario. Cruzar la medianoche no cambia nada.

## 4. Cambios en policy

`RECENCY_POLICY.longInactivityMinDays` pasa de 30 a **31**. Su significado ahora es "mínimo de días completos, inclusivo"; antes era "> 30 días en ms". `recentMaxDays` sigue en 7, inclusivo. La regla de negocio es la misma (> 30 equivale a ≥ 31 en enteros). Solo cambia la unidad de comparación.

## 5. Cambios en signals

- Se eliminó `elapsedSinceLastMs` de `PlatformObservation`.
- Se añadieron dos helpers privados: `isRecent(days)` (≤ 7) e `isLongInactive(days)` (≥ 31).
- Los usan `recencySignals`, `activityStateOf` y `crossPlatformSignals`.
- `DAY_MS` se sigue usando solo para span e intervalos de frecuencia, que no cambian.

## 6. FB / IG RECENT_ACTIVITY

DETECTED si `daysSinceLastPost` ≤ 7. La evidencia `thresholdDays` es 7.

## 7. FB / IG LONG_INACTIVITY

DETECTED si `daysSinceLastPost` ≥ 31. La evidencia `thresholdDays` pasa de 30 a 31, en coherencia con la regla inclusiva.

## 8. activityState

`recent` si ≤ 7, `old` si ≥ 31 e `intermediate` en el resto (8–30). `no_content`, `insufficient_context` y `not_evaluable` no cambian.

## 9. Cross-platform

La referencia común es `daysSinceLastPost` de cada plataforma.

- **`FB_ONLY_RECENT_ACTIVITY`:** `isRecent(fbDays) && !isRecent(igDays)`.
- **`IG_ONLY_RECENT_ACTIVITY`:** simétrico.
- **`PLATFORM_RECENCY_DIFFERENCE`:** `recencyDifferenceDays = abs(fbDays − igDays)`, calculado sobre días completos ya redondeados de cada plataforma. Es DETECTED si es ≥ 30. El umbral 30 (`CROSS_PLATFORM_POLICY.recencyDifferenceMinDays`) no se ha cambiado.

## 10. Lo que NO cambia

- Frescura: FRESH ≤ 24 h, AGING ≤ 7 días, STALE > 7 días, sobre `last_success_at`.
- Umbrales de frecuencia, engagement, completitud y tipo de contenido.
- Tipos de salida y contrato (`SignalKey`, estados, motivos, forma de la evidencia).
- Bloqueos técnicos y comportamiento STALE.
- UI, base de datos, funciones, producción, fases Meta congeladas, IA, Social Score, recomendaciones y A3.5.4.2.

## 11. Tests de límites (FB e IG)

Los mismos casos se ejecutan en Facebook y en Instagram:

| Edad del post | days | RECENT | LONG | activityState |
|---|---|---|---|---|
| 6 d 23 h | 6 | DETECTED | NOT_DETECTED | recent |
| 7 d 00 h | 7 | DETECTED | NOT_DETECTED | recent |
| 7 d 19 h | 7 | DETECTED | NOT_DETECTED | recent |
| 7 d 23 h 59 m | 7 | DETECTED | NOT_DETECTED | recent |
| 8 d 00 h | 8 | NOT_DETECTED | NOT_DETECTED | intermediate |
| 29 d | 29 | NOT_DETECTED | NOT_DETECTED | intermediate |
| 30 d 00 h | 30 | NOT_DETECTED | NOT_DETECTED | intermediate |
| 30 d 23 h 59 m | 30 | NOT_DETECTED | NOT_DETECTED | intermediate |
| 31 d 00 h | 31 | NOT_DETECTED | DETECTED | old |
| 31 d 12 h | 31 | NOT_DETECTED | DETECTED | old |
| 45 d | 45 | NOT_DETECTED | DETECTED | old |

También se prueba un cruce de medianoche: un post a las 23:59 del día 14, evaluado a las 00:30 del día 22, da days 7 y RECENT DETECTED.

## 12. Tests de límites cross-platform

| FB | IG | Resultado |
|---|---|---|
| 7 d 23 h 59 m (7) | 8 d (8) | FB_ONLY DETECTED; IG_ONLY NOT_DETECTED |
| 8 d (8) | 7 d 19 h (7) | IG_ONLY DETECTED; FB_ONLY NOT_DETECTED |
| 7 d 23 h 59 m (7) | 7 d 00 h 01 m (7) | ambos NOT_DETECTED |
| 0 d 01 h (0) | 30 d 23 h 59 m (30) | DIFFERENCE DETECTED, diff 30 |
| 1 d (1) | 30 d 23 h 59 m (30) | DIFFERENCE NOT_DETECTED, diff 29 |

## 13. Test de consistencia evidencia/decisión

Barrido de 0 a 40 días en pasos de 7 h, con FB e IG en edades complementarias (138 combinaciones). En cada combinación se comprueba:

- RECENT DETECTED ⇔ `days ≤ thresholdDays`, y por tanto NOT_DETECTED ⇔ `days > thresholdDays`.
- LONG DETECTED ⇔ `days ≥ thresholdDays`, y LONG DETECTED ⇔ `days ≥ 31`.
- `activityState` coherente con ambas reglas.
- Los días de la evidencia cross-platform son iguales a los de cada plataforma.
- FB_ONLY / IG_ONLY son coherentes con esos días.
- `recencyDifferenceDays` = `abs(fbDays − igDays)`, y DETECTED ⇔ diff ≥ `thresholdDays`.

## 14. Regresión con datos reales

Snapshot de producción leído en modo solo lectura (sin cambios respecto a A3.5.4.1.1). Se evaluó en 2026-10-22T18:04:26.817Z con un script temporal, que se eliminó al terminar. Dos ejecuciones dieron una salida idéntica (determinista).

| Señal | Facebook | Instagram |
|---|---|---|
| Frescura | FRESH | FRESH |
| activityState | recent | recent |
| RECENT_ACTIVITY | **DETECTED** (days 7, umbral 7) | **DETECTED** (days 7, umbral 7) |
| LONG_INACTIVITY | NOT_DETECTED (umbral 31) | NOT_DETECTED (umbral 31) |
| FREQUENCY_OBSERVED | INSUFFICIENT (WINDOW_TOO_SHORT) | INSUFFICIENT (SAMPLE_TOO_SMALL) |
| ENGAGEMENT_DATA_AVAILABLE | NOT_AVAILABLE (METRICS_NULL) | INSUFFICIENT, reactionTotal 0 / commentTotal 0 conservados |
| Texto / caption | TEXT_MISSING DETECTED (1 con texto / 2 sin) | CAPTION_MISSING NOT_DETECTED |
| CONTENT_TYPE_VARIETY | INSUFFICIENT | INSUFFICIENT |
| TREND | NOT_AVAILABLE (NO_HISTORY) | NOT_AVAILABLE (NO_HISTORY) |

Cross-platform: FB_ONLY e IG_ONLY dan NOT_DETECTED (7 / 7). PLATFORM_RECENCY_DIFFERENCE da NOT_DETECTED (diff 0).

Transición observada con los mismos datos:

| evaluatedAt | FB | IG |
|---|---|---|
| 22:26:25.999Z | DETECTED (7) | DETECTED (7) |
| 22:26:26.000Z | DETECTED (7) | NOT_DETECTED (8) |
| 22:27:37.000Z | NOT_DETECTED (8) | NOT_DETECTED (8) |

El cambio de estado coincide exactamente con el paso de días 7 a 8.

## 15. Resultados de tests

- Tests específicos A3.5.4.1: **79/79 OK**, que corresponden a los 53 originales (2 actualizados) más 26 nuevos.
- Suite completa: **59 archivos, 2130/2130 OK** (referencia 2104 + 26 nuevos).
- Tests actualizados:
  - expectativa de `RECENCY_POLICY` (31);
  - test con datos reales, ahora RECENT DETECTED en FB e IG.

## 16. TypeScript, lint y build

- `tsc`: **20 errores heredados en 8 archivos**, idénticos a la referencia. Ninguno es nuevo y ninguno está en `social-intelligence`.
- Lint de la carpeta `social-intelligence`: limpio.
- `npm run build`: OK.

## 17. Auditoría de alcance

Archivos modificados en este hotfix:

- `src/features/social-intelligence/policy.ts`
- `src/features/social-intelligence/signals.ts`
- `src/features/social-intelligence/__tests__/a3541SocialSignals.test.ts`
- `auditoria-a2/A3_5_4_1_DETERMINISTIC_SOCIAL_SIGNALS_ENGINE.md`: aclaración de las tablas de recencia en días completos, LONG ≥ 31.
- `auditoria-a2/A3_5_4_1_2_RECENCY_BOUNDARY_CONSISTENCY_HOTFIX.md`: este informe.

No se han modificado:

- `types.ts` ni `engine.ts`;
- la UI;
- las Edge Functions (`functions-deploy-state.json` sin `hasChanged: true`);
- las migraciones (la última sigue siendo `a353_meta_sync_claim_min_interval`);
- los datos de producción, porque solo se ejecutaron SELECT;
- el informe histórico A3.5.4.1.1.

No queda la carpeta temporal.

## 18. Riesgos residuales

- La frontera de días completos depende de `evaluatedAt`. Un mismo post cambia de RECENT a INTERMEDIATE en el instante exacto en que se cumplen 8 × 24 h. Es el comportamiento intencionado y está documentado.
- `thresholdDays` de LONG_INACTIVITY cambia en la evidencia de 30 a 31. Ningún consumidor de UI usa todavía el motor, así que no hay impacto visible.
- El snapshot real tiene una muestra mínima. La frecuencia y el engagement siguen sin poder evaluarse, como corresponde.

## 19. Estado de A3.5.4.1

A3.5.4.1 **no se congela** en este paso. A3.5.4.2 no se ha implementado.

## 20. Exact next step

Repetir **A3.5.4.1.1 — Real-Data Validation & Freeze** sobre el motor corregido, en modo solo lectura, incluida la sonda de límites de recencia. Solo si esa validación da GO se congelará A3.5.4.1.

GO — READY TO REPEAT A3.5.4.1 REAL-DATA VALIDATION
