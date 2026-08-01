# Release Candidate Fixes

## Resumen

Correccion de los 5 blockers identificados en la Release Candidate Audit. Sin funcionalidades nuevas, sin cambios de arquitectura, sin modificaciones a V1.

---

## Problemas corregidos

### BLOCKER 1 — Datos demo sin etiquetar

**Problema**: Today page, Weekly Summary, Business Timeline, Insights y Preferences mostraban datos demo sin ningun indicador visual. El usuario creia que eran datos de su negocio real.

**Solucion**:
- Anadido banner "Modo demostracion" prominente en Daily Briefing (DailyBriefingPage)
- Anadido banner "Modo demostracion" en Weekly Summary cuando usa datos de ejemplo
- Anadidos badges "Datos de ejemplo" en cada seccion de BusinessTimeline (cronologia, insights, preferencias) cuando no hay datos reales
- Badge `DataStatusBadge confidence="demo"` en tarjetas de acciones prioritarias

Patron: cada componente detecta si `liveData.length === 0` (o equivalente) y establece `isDemo = true`, mostrando el badge y banner correspondiente.

---

### BLOCKER 2 — Analytics del funnel First Value no llegan a Supabase

**Problema**: `first-value/analytics.ts` guardaba eventos en localStorage y nunca los enviaba a la tabla `analytics_events` de Supabase. El funnel de conversion mas critico era invisible.

**Solucion**:
- Reescrito `first-value/analytics.ts` para usar directamente `track()` de `lib/analytics.ts` (que envia a Supabase via fetch)
- Eliminado el sistema de localStorage paralelo
- Mantenido el guard `trackOnce()` con `Set<string>()` para dedup por sesion
- Reescrito `v2Analytics.ts` con `trackViewOnce()` para evitar duplicados en eventos de vista
- Corregido abuso del campo `route` (ahora cada evento usa campos semanticos: `recommendation_id`, `source_id`, `goal_id`, etc.)

---

### BLOCKER 3 — Quick Actions sin funcionalidad

**Problema**: Los 4 botones Quick Action del Daily Briefing solo disparaban un evento de analytics pero no navegaban ni hacian nada. Botones muertos.

**Solucion**:
- "Nueva publicacion" → navega a `/app-v2/plan`
- "Analizar negocio" → navega a `/app-v2/fuentes`
- "Crear contenido" → navega a `/app-v2/plan`
- "Responder resenas" → muestra tooltip explicando: "Conecta Google Business para responder resenas."

Patron: cada accion tiene `available: boolean` y `route: string | null`. Si no esta disponible, muestra una explicacion temporal en lugar de fallar silenciosamente.

---

### BLOCKER 4 — Redirect a onboarding por error de red

**Problema**: Si `isCompleted()` fallaba por red, `completed` quedaba en `false` y el usuario era redirigido al inicio del onboarding sin explicacion.

**Solucion**:
- Anadido estado `loadError` en `FirstValueRedirect`
- Si la comprobacion falla, se muestra pantalla de "Error de conexion" con boton "Reintentar" en lugar de redirigir silenciosamente
- Mismo patron aplicado a `PlanPage`: si la carga del plan falla, muestra un error con retry en lugar de mostrar el estado vacio

---

### BLOCKER 5 — PII en analytics

**Problema**: `trackBetaRequestSuccess(email)` y `trackBetaRequestFailed(email, reason)` enviaban el email del usuario a la tabla de analytics.

**Solucion**:
- Eliminado parametro `email` de ambas funciones
- `trackBetaRequestSuccess()` ahora no envia ningun dato personal
- `trackBetaRequestFailed(reason)` solo envia la categoria del fallo ('duplicate', 'supabase_error', 'network') — sin emails ni mensajes de error crudos

---

## Mejoras de consistencia incluidas

| Mejora | Detalle |
|--------|---------|
| Header PlanPage | Cambiado de `text-v2-xl` a `text-v2-2xl` para igualar a las demas pantallas |
| Event naming | Unificado: eventos de vista usan `trackViewOnce()`, eventos de accion usan `track()` |
| Route field abuse | Eliminado: cada evento usa campos semanticos (`recommendation_id`, `source_id`, `goal_id`, etc.) |
| Copy Daily Briefing | Cambiado de "Tu proxima accion hoy" a "Te recomendamos una accion para avanzar hoy con tu negocio" |

---

## Eventos revisados

### first-value/analytics.ts (→ Supabase via track())

| Evento | Dedup | PII | Payload |
|--------|-------|-----|---------|
| first_value_started | Si (once per user+biz) | No | user_id, business_id |
| first_value_resumed | No | No | user_id, business_id, step |
| first_value_step_viewed | No | No | user_id, business_id, step |
| business_setup_completed | Si | No | user_id, business_id |
| primary_goal_selected | No | No | goal_id |
| manual_context_completed | Si | No | user_id, business_id |
| initial_source_selected | No | No | source_type |
| initial_source_connected | No | No | context |
| initial_analysis_started | No | No | context |
| initial_analysis_completed | No | No | context |
| first_recommendation_generated | Si | No | recommendation_id, confidence, data_mode |
| first_recommendation_viewed | Si | No | recommendation_id |
| first_recommendation_accepted | No | No | recommendation_id |
| first_workspace_opened | No | No | action_type |
| first_action_completed | No | No | action_type |
| first_value_completed | Si | No | time_to_first_value_seconds |
| beta_request_success | No | No | (vacio) |
| beta_request_failed | No | No | failure_reason (categoria, no detalle) |

### v2Analytics.ts (→ Supabase via track())

| Evento | Dedup | PII | Payload |
|--------|-------|-----|---------|
| v2_app_view | Si (once per route) | No | route |
| v2_today_view | Si | No | business_id |
| v2_navigation_click | No | No | route |
| v2_source_connect_click | No | No | source_type |
| v2_recommendation_view | No | No | recommendation_id, data_mode |
| v2_recommendation_action_click | No | No | recommendation_id, data_mode |
| v2_demo_badge_view | Si | No | (vacio) |
| daily_briefing_view | Si | No | business_id |
| recommendation_open | No | No | recommendation_id, data_mode |
| recommendation_execute | No | No | recommendation_id, data_mode |
| task_completed | No | No | recommendation_id, time_minutes |
| quick_action_click | No | No | action_type |
| weekly_progress_view | Si | No | (vacio) |
| tomorrow_preview_view | Si | No | (vacio) |
| workspace_open/close/complete | No | No | recommendation_id |
| content_copy/edit | No | No | (vacio) |
| business_profile_updated | No | No | (vacio) |
| goal_created/completed | No | No | goal_id |
| timeline_view | Si | No | (vacio) |
| weekly_summary_view | Si | No | (vacio) |
| source_connected/sync/error/disconnected | No | No | source_id |

---

## Datos demo revisados

| Pantalla | Antes | Ahora |
|----------|-------|-------|
| Daily Briefing | Demo sin label | Banner "Modo demostracion" + badge "Ejemplo demostrativo" |
| Weekly Summary | Demo sin label | Banner "Modo demostracion" con CTA |
| BusinessTimeline | Demo sin label | Badge "Datos de ejemplo" en header |
| BusinessInsights | Demo sin label | Badge "Datos de ejemplo" en header |
| BusinessPreferences | Demo sin label | Badge "Datos de ejemplo" en header |
| PlanPage | N/A (ya tiene info banner) | Sin cambios |
| First Value Flow | Ya tenia badges | Sin cambios |

---

## Quick Actions revisadas

| Accion | Antes | Ahora |
|--------|-------|-------|
| Nueva publicacion | Boton muerto (solo analytics) | Navega a /app-v2/plan |
| Responder resenas | Boton muerto | Tooltip: "Conecta Google Business para responder resenas" |
| Analizar negocio | Boton muerto | Navega a /app-v2/fuentes |
| Crear contenido | Boton muerto | Navega a /app-v2/plan |

---

## PII eliminada

| Funcion | Antes | Ahora |
|---------|-------|-------|
| trackBetaRequestSuccess | email enviado | Sin parametros |
| trackBetaRequestFailed | email + error.message enviados | Solo failure_reason (categoria) |
| v2Analytics route field | Overloaded con timeMinutes, goalId | Campos semanticos separados |

---

## Tiempo medio First Value

Sin cambios al flujo. Estimado: 5-8 minutos (9 pantallas, 8-10 clics, 14 interacciones max).

---

## Resultados de validacion

- **TypeScript**: 0 errores en archivos modificados
- **Build**: OK (22.16s)
- **Tests**: 30/30 passed
- **V1**: No modificada

---

## Riesgos restantes

| Riesgo | Severidad | Mitigacion |
|--------|-----------|------------|
| Workspaces siguen sin hacer acciones reales | Media | Demo badge en Today advierte; workspace aun es teatro pero usuario sabe que es demo |
| Source Manager connections siguen siendo falsas | Media | Fuentes pagina ahora accesible via Quick Action "Analizar negocio" |
| 3 session IDs coexisten | Baja | Todos van al mismo sink ahora (Supabase); session_id de lib/analytics es el canonical |
| Business Memory sigue en localStorage | Baja | No pierde datos criticos; FV progress esta en Supabase |
| Loading falso de 1.8s en Initial Analysis | Baja | Aceptable para beta privada |
