# LocalSEOHub.io — Auditoría funcional integral de «Tu Semana»

Modo: solo lectura. No se ha modificado código, base de datos, configuración, permisos ni migraciones. No se ha desplegado ni publicado nada. No se han hecho llamadas externas reales. Los únicos archivos creados son este informe y `TU_SEMANA_FINAL_TEST_REPORT.md`.

Base auditada: el código del proyecto tal como quedó tras A3.7.6.7 (ZIP `localseohub-a3767-stale-recommendations-fix.zip`, sha256 3f11e81c…). **A3.7.6.7 aún no está desplegado**, así que producción sigue con A3.7.6.5 en lo relativo a cuentas de solo lectura (ver D-1).

---

## A. Resumen ejecutivo

«Tu Semana» es funcionalmente sólida y coherente:
- genera, prioriza (5 + «Para después»), ejecuta y contabiliza acciones;
- es la misma fuente de datos que «Hoy»;
- el aislamiento entre negocios y la protección premium de las escrituras se hacen en el servidor (RLS) y en el cliente.

Las recomendaciones de perfil se resuelven solas al guardar los datos. Las acciones descartadas no cuentan como progreso. Los textos dicen explícitamente que el progreso mide tareas, no resultados de negocio.

Hoy funciona **principalmente como plan de configuración inicial con una capa limitada de mejora continua**:
- Con el perfil completo, el motor solo propone acciones recurrentes de buenas prácticas, de objetivo, de seguimiento y de análisis web, con periodos de espera de 7 a 30 días.
- Los hallazgos verificados de Google (huecos del perfil, primeras reseñas) dependen de una sincronización de Google Business Profile, que no está operativa por la cuota externa. Es una limitación externa, no un defecto.

No se han encontrado defectos P0 ni P1 en el código auditado. El defecto de recomendaciones obsoletas en modo solo lectura está corregido en el código, pero **no en producción** hasta desplegar A3.7.6.7.

**Veredicto: GO CONDICIONADO** (sección F).

---

## B. Matriz de auditoría

Leyenda de evidencia:
- **T** = prueba automatizada ejecutada;
- **I** = prueba aislada ejecutada para esta auditoría (fuera del proyecto, ya eliminada);
- **C** = solo inspección de código.

### B.1 Generación de recomendaciones
| # | Requisito | Resultado | Evidencia | Archivo / función | Impacto |
|---|---|---|---|---|---|
| G1 | Los campos incompletos generan recomendaciones | PASS | T (engine.test, sprint06, a3767 1–5), C | `rules.ts` completeBasics, addContact, addSchedule, completeServices, defineAudience, setPrimaryGoal | El usuario ve qué le falta |
| G2 | Desaparecen o se resuelven al guardar | PASS (premium y prueba activa) / PASS en código, pendiente de despliegue (solo lectura) | T (repository.test, a3767), C | `engine.ts` planSync, `repository.ts` syncActions, `readOnlyView.ts` | En producción, las cuentas de solo lectura siguen viendo tareas obsoletas hasta desplegar (D-1) |
| G3 | Se usan datos actualizados | PASS | T (a3767 test 10, re-ejecución por cambio del negocio), C | `ActionsProvider.tsx` run, ensureFresh | — |
| G4 | Sin duplicados | PASS | T (a3767 6, a3761), C | `dedupCandidates` (una abierta por regla, periodos de espera), `scopeActions`, índice único en BD | — |
| G5 | Coherencia con actividad, objetivo y situación | PASS | C, T (engine.test scoring) | `scoreCandidate` (+15 si coincide con el objetivo), goalFocus, weeklyPost, serviceDescription (usa el servicio y la ciudad reales) | — |
| G6 | Acciones útiles tras completar el perfil | PARTIAL | C | weeklyPost (cada 7 días), recentPhotos (30), serviceDescription (30), faqAnswers, goalFocus (7), followUps, websiteFindings (si la web está analizada). Los hallazgos de GBP necesitan sincronización | El plan se vuelve corto y repetitivo; sin reputación verificada hasta que GBP funcione |
| G7 | Nada estimado presentado como real | PASS | C, T (a281, a3761) | `actionOrigin` (real solo para VERIFIED_FINDING); el esfuerzo se marca `isEstimate: true`; la etiqueta de origen aparece en la tarjeta | — |
| G8 | Fuentes no conectadas bien identificadas | PASS | T (a3767 16, a3762), C | Las acciones SOURCE_REQUIRED salen como origen «unavailable»; el aviso genérico lleva a /fuentes | — |

### B.2 Priorización semanal
| # | Requisito | Resultado | Evidencia | Archivo / función | Impacto |
|---|---|---|---|---|---|
| P1 | Selección y orden | PASS | T (a3761), C | `selectWeeklyFocus`: primero las 3 de Hoy, después las abiertas por puntuación, con el id como desempate | Orden estable y determinista |
| P2 | Límite de 5 | PASS | T (a3761) | `WEEK_FOCUS_MAX = 5` | — |
| P3 | «Para después» | PASS | T (a3762), C | `later`, sección plegable con `aria-expanded` | — |
| P4 | Coherencia entre Hoy y Tu Semana | PASS | T (a3767 14, a3763), C | Mismo proveedor de acciones y `selectTodayActions` incluido en el foco semanal | Sin contradicciones |
| P5 | Resueltas, descartadas y desactualizadas | PASS | T (a3761, a3765), C | `stateOf`; las cerradas solo aparecen en «Actividad de la semana» y nunca vuelven al foco | — |
| P6 | Menos de 5 acciones | PASS | T (a3761), I | El foco muestra las que hay; «Para después» se oculta | — |
| P7 | Sin acciones | PASS | T (a3762) | `focusEmpty` y estado vacío con enlace a /negocio | — |
| P8 | Estabilidad durante la semana | PASS | C, I | El orden depende solo de la puntuación guardada y del id; solo cambia si cambian los datos o el estado | — |
| P9 | No reintroduce tareas resueltas | PASS | T (repository.test, a3767 12) | Periodo de espera tras COMPLETED; DISMISSED manual espera 30 días | — |

### B.3 Ejecución
| # | Requisito | Resultado | Evidencia | Archivo / función | Impacto |
|---|---|---|---|---|---|
| E1 | «Ver» abre el destino correcto | PASS | T (a3762, a3763), C | `actionTarget`: usa `cta_to` (/negocio, /negocio/objetivos, /fuentes) o, si no hay, `/ejecutar/:id` (la ruta existe en `App.tsx`) | — |
| E2 | La ejecución corresponde a la recomendación | PASS | T (a271, a33), C | `ExecutionPage` resuelve por id; `action-layer/model` | — |
| E3 | Contexto del negocio correcto | PASS | T (a3767 9, a3752), C | `scopeActions(businessId)`, guarda `latestBusinessId`, RLS por propietario | — |
| E4 | Completar o descartar si está autorizado | PASS | T (a3762, billingModel) | `transitionAction`; botones visibles solo si `canAct` | — |
| E5 | Lo completado deja de estar pendiente | PASS | T (a3762, repository.test) | `refresh` tras la transición | — |
| E6 | Sin caminos para modificar sin autorización | PASS | T (a3767 7, billingModel S1), C | El cliente lanza `PremiumRequiredError`; las políticas UPDATE e INSERT de `business_actions` exigen `current_user_has_premium()` (diagnóstico A3.7.6.6) | — |
| E7 | Acciones de conectores no operativos explicadas | PASS | C, T (a3767 5c) | connectGbp explica por qué falta el dato y lleva a /fuentes. «Conectando» no cuenta como conectado si falla | — |
| E8 | Ninguna acción publica, envía ni cambia algo externo | PASS | C, T (a3741 / a3743 congelados) | Las acciones solo navegan o cambian el estado de `business_actions`; ninguna llama a la publicación de Meta | — |
| E9 | Las tareas de contenido no se confunden con publicaciones reales | PASS | C | Las CTA dicen «Preparar»; la nota de progreso dice «no resultados de negocio»; el historial dice «tarea completada», no «publicado» | Riesgo leve: «Marcar como hecha» depende de la palabra del usuario (P3, D-4) |

### B.4 Progreso e historial
| # | Requisito | Resultado | Evidencia | Archivo / función |
|---|---|---|---|---|
| H1 | El porcentaje es matemáticamente coherente | PASS | T (a3761), I | `buildActionReport`: round(done / (done + pending) × 100); null si no hay nada |
| H2 | Las descartadas no cuentan como completadas | PASS | T, I (done = 1 con una completada y una descartada) | `actionOutcome` |
| H3 | Se explican los cambios del denominador | PASS | T (a3762) | `progressChanges` y `addedNote(addedThisWeek)` |
| H4 | El historial no atribuye acciones no hechas | PASS | T (a3761), C | `actionsToTimeline` solo incluye las `executed`; las resueltas por datos (`condition_met`) se muestran aparte como «resueltas» |
| H5 | Se distingue tarea de resultado comercial | PASS | C | `progressNote` ES/EN |
| H6 | No se pierde información al actualizar el perfil | PASS | T (a3767 8, repository.test) | Los cierres son UPDATE de estado y nunca DELETE; solo se tocan filas abiertas |
| H7 | Progreso en modo solo lectura | PARTIAL | T (a3767 15) | Ver D-2 |

### B.5 Cambio de semana (pruebas aisladas I con fechas simuladas en Europe/Madrid, UTC, America/Mexico_City y Pacific/Auckland)
| # | Requisito | Resultado | Evidencia |
|---|---|---|---|
| W1 | La semana empieza en lunes | PASS | `weekStart(lunes).getDay() = 1` en las 4 zonas |
| W2 | Paso de domingo 23:59:59 a lunes 00:00 | PASS | La clave cambia de 2026-11-02 a 2026-11-09 |
| W3 | Identificador semanal | PASS | `weekKey` usa la fecha local del lunes (AAAA-MM-DD) |
| W4 | Pendientes de la semana anterior | PASS | Se mantienen en el foco (a, d) |
| W5 | Completadas anteriormente | PASS | El lunes no cuentan (done 1 → 0) y siguen guardadas |
| W6 | Persistencia de estados | PASS (C) | El estado vive en la BD; la semana solo filtra la vista |
| W7 | Sin duplicados al cambiar de semana | PASS | No se generan filas por semana |
| W8 | Zonas horarias | PARTIAL | La semana se calcula con la hora del dispositivo (se avisa en pantalla). Una tarea cerrada el domingo a las 23:30 UTC cuenta en la semana nueva en Madrid y Auckland y en la anterior en UTC y México (D-3) |
| W9 | Progreso coherente con las fechas reales | PASS | Filtra por `completedAt` y `dismissedAt` reales |

### B.6 Seguridad y suscripciones (mocks y código; sin usuarios reales)
| # | Requisito | Resultado | Evidencia |
|---|---|---|---|
| S1 | Aislamiento entre negocios | PASS | T (a3752, a3767 9), C (RLS por propietario, `scopeActions`) |
| S2 | Identidad y permisos | PASS | C (`auth.uid()` en las políticas), T (a3752) |
| S3 | Escrituras protegidas en servidor | PASS | Diagnóstico A3.7.6.6: las políticas INSERT y UPDATE exigen premium |
| S4 | Prueba activa | PASS | T (billingModel, premiumAccess): `hasPremium` true y sincroniza |
| S5 | Prueba caducada | PASS | T: solo lectura, aviso, sin escrituras |
| S6 | Suscripción activa | PASS | T: igual que la prueba activa |
| S7 | Modo solo lectura | PASS en código / pendiente de despliegue | T (a3767): oculta en memoria y escribe 0 filas |
| S8 | Sin acceso premium no autorizado | PASS | T (a3767 7, a3742 Fix02), C |

### B.7 Visual y experiencia (solo inspección de componentes y pruebas jsdom; **no se ha hecho una comprobación visual real** en navegador ni en dispositivo)
| # | Requisito | Resultado | Evidencia |
|---|---|---|---|
| V1 | Escritorio y móvil | NOT VERIFIED (visual) / PASS (C) | Clases responsive `sm:`; sin captura real |
| V2 | Carga | PASS | T (a3762, a3765): LoadingState solo si no hay nada que mostrar |
| V3 | Vacío | PASS | T: estado vacío y foco vacío |
| V4 | Errores | PASS | T: StateCard con «Reintentar»; `role="alert"` para fallos de acción |
| V5 | Accesibilidad | PASS (C) | `aria-labelledby` en tarjetas y secciones, `role="progressbar"` con valores, `aria-expanded` en «Para después», iconos `aria-hidden`. No se ha auditado el contraste con herramienta |
| V6 | Navegación | PASS | T (a3763): /semana, redirecciones, «Ver», /fuentes, /negocio |
| V7 | ES / EN | PASS | T (a3762, a3767 16): todos los textos en `pageCopy` y `copy` |
| V8 | Claridad de prioridades, botones y progreso | PASS (C) | Etiqueta de prioridad, origen, esfuerzo estimado, «Se cierra sola cuando el dato esté guardado», contador «x de y» |

---

## C. Defectos identificados

| ID | Prioridad | Descripción | Estado |
|---|---|---|---|
| D-1 | **P1 en producción / corregido en código** | Las cuentas de solo lectura ven como pendientes recomendaciones de perfil ya satisfechas | Corregido en A3.7.6.7 (sin desplegar; pendiente de revisión independiente) |
| D-2 | P2 | En solo lectura, las tareas ocultadas no se guardan como completadas: el denominador baja y el porcentaje puede subir sin que suba el número de hechas. Se guardan al recuperar premium | Limitación documentada de A3.7.6.7 |
| D-3 | P3 | La semana depende de la hora del dispositivo: el mismo cierre puede contar en semanas distintas según la zona. Está avisado en pantalla («según la hora de tu dispositivo») | Aceptable |
| D-4 | P3 | «Marcar como hecha» en tareas de contenido o fotos depende de la palabra del usuario; no se verifica que se haya publicado | Por diseño, con texto aclaratorio |
| D-5 | P3 | Con el perfil completo y sin GBP operativo, el plan semanal se reduce a 3–6 tareas de buenas prácticas con periodos de espera largos (poca variedad) | Limitación de alcance, no defecto de código |

Limitaciones externas, que no son defectos: la API de Google Business Profile no está operativa por la cuota externa, lo que bloquea los hallazgos verificados de Google y las reseñas; la publicación real en Meta no está autorizada para esta auditoría.

---

## D. Cobertura real
Ver `TU_SEMANA_FINAL_TEST_REPORT.md`. Resumen:
- 642/642 pruebas relacionadas;
- suite completa: 97 archivos, 3.247/3.247 aprobadas, 0 fallidas, 0 omitidas;
- TypeScript: 20 errores, todos preexistentes, ninguno en «Tu Semana» ni en acciones;
- build: OK.

---

## E. Propuesta de corrección mínima
1. **D-1:** revisión independiente y despliegue de A3.7.6.7 (ya implementado y probado). No hace falta código nuevo.
2. **D-2, D-3, D-4, D-5:** no se requiere ninguna corrección para estabilizar la funcionalidad actual. Mejorar la variedad de D-5 sería una ampliación de producto y queda fuera de alcance.

---

## F. Veredicto

**GO CONDICIONADO**

Justificación:
- No hay defectos P0.
- El único defecto funcional bloqueante (D-1) ya está corregido y probado en código: 23 pruebas de regresión, que fallan sobre el código anterior.
- Generación, priorización, ejecución, progreso, cambio de semana, seguridad e idiomas pasan las pruebas automatizadas y aisladas.

Condición: **desplegar A3.7.6.7 tras su revisión independiente** antes de la validación comercial con cuentas sin prueba ni suscripción activas. El resto son defectos menores documentados (P2/P3) o limitaciones externas (Google).

DETENERSE. No se implementan correcciones sin autorización expresa del propietario.
