# Sprint 5.1 — First Value Hardening

## Objetivo

Corregir y endurecer la experiencia First Value creada en Sprint 5, convirtiendola en un flujo fiable, transparente, persistente, personalizado y recuperable.

## Problemas corregidos

| # | Problema | Solucion |
|---|---------|----------|
| 1 | Analisis parecia real sin serlo | Eliminadas todas las afirmaciones falsas. Templates reescritos con lenguaje transparente ("Con la informacion disponible...", "Como primera orientacion...") |
| 2 | Web marcada como "conectada" sin analisis | Nuevo estado `website_provided` vs `website_verified`. Solo se marca verificada con analisis real |
| 3 | Entrada manual sin preguntas | Nuevo `ManualContextStep` con 7 preguntas (2 obligatorias, 5 opcionales) |
| 4 | Recomendacion no persistida completa | Se guarda el objeto completo (20+ campos) en `recommendation_payload` JSONB |
| 5 | ID inestable (Date.now()) | ID estable: `fv-{userId8chars}-{businessId}-{goalId}` |
| 6 | setState durante render | Eliminado. Recomendacion se genera en `onComplete` handler, se carga desde state persistido |
| 7 | Leads beta solo en localStorage | Tabla Supabase `beta_access_requests` con validacion, dedup por email, rate limit |
| 8 | Progreso global sin aislamiento | Tabla Supabase `first_value_progress` con RLS por user_id + unique(user_id, business_id) |
| 9 | Rutas placeholder visibles | Eliminadas de navegacion (Contenido, Reputacion, Visibilidad) |
| 10 | CTA apuntaba a /informes | Corregido a `/app-v2/plan` |

## Decisiones de diseno

### Transparencia

Todas las recomendaciones incluyen:
- `dataMode`: verified | estimated | manual | demo
- `confidence`: high | medium | low
- `evidenceSummary`: resumen de la evidencia disponible
- `limitations`: que no se ha verificado y por que
- `preparedContent.personalizedWith`: que datos se usaron
- `preparedContent.missingData`: que datos faltan

### Persistencia

**Tabla `first_value_progress`:**
- Aislada por `user_id` + `business_id`
- Unique index en (user_id, business_id)
- RLS: cada usuario solo ve sus propios registros
- `recommendation_payload` JSONB: recomendacion completa
- `execution_payload` JSONB: estado de ejecucion
- `manual_context` JSONB: respuestas del cuestionario manual

**Tabla `beta_access_requests`:**
- INSERT publico (anon + authenticated)
- SELECT/UPDATE/DELETE bloqueados para usuarios normales
- Unique index en email (previene duplicados)
- Captura UTM params y referrer

### Fuente Website

Dos estados:
- `website_provided`: URL introducida, no analizada
- `website_verified`: URL analizada por una funcion real (no implementado aun)

Cuando solo es `website_provided`:
- confidence: `low`
- dataMode: `estimated`
- sourceName: "Sitio web proporcionado (no analizado)"
- limitations explica que no se ha analizado

### ID estable

Patron: `fv-{userId primeros 8 chars}-{businessId}-{goalId}`

Se genera una sola vez al crear la recomendacion. Al reabrir el flujo, se carga desde Supabase.

### Plan semanal minimo

`/app-v2/plan` muestra:
- Accion completada del First Value
- 2 acciones pendientes estimadas segun el objetivo
- Indicador de progreso
- Aviso de transparencia (datos estimados)

## Modelo de datos

### first_value_progress
```
id uuid PK
user_id uuid FK → auth.users NOT NULL DEFAULT auth.uid()
business_id text NOT NULL DEFAULT 'default'
current_step text NOT NULL DEFAULT 'welcome'
completed boolean NOT NULL DEFAULT false
selected_goal_id text
selected_source_type text
business_data jsonb
manual_context jsonb
recommendation_payload jsonb
execution_payload jsonb
started_at timestamptz
completed_at timestamptz
updated_at timestamptz
UNIQUE(user_id, business_id)
```

### beta_access_requests
```
id uuid PK
name text
email text NOT NULL UNIQUE
business_name text NOT NULL
sector text
city text
primary_goal text
source text
utm_source text
utm_medium text
utm_campaign text
utm_content text
referrer text
status text NOT NULL DEFAULT 'new'
created_at timestamptz
```

## Politicas RLS

### first_value_progress
- SELECT: `auth.uid() = user_id` (TO authenticated)
- INSERT: `auth.uid() = user_id` (TO authenticated)
- UPDATE: `auth.uid() = user_id` (TO authenticated)
- DELETE: `auth.uid() = user_id` (TO authenticated)

### beta_access_requests
- INSERT: `true` (TO anon, authenticated) — publico
- SELECT: `false` (TO authenticated) — solo service_role
- UPDATE: `false` (TO authenticated) — solo service_role
- DELETE: `false` (TO authenticated) — solo service_role

## Pantallas activas

| Ruta | Funcion | Auth |
|------|---------|------|
| `/beta` | Landing de captacion beta | No |
| `/app-v2/empezar` | Flujo First Value (8 pasos) | Si |
| `/app-v2/hoy` | Dashboard diario | Si |
| `/app-v2/plan` | Plan semanal minimo | Si |
| `/app-v2/informes` | Resumen semanal | Si |
| `/app-v2/negocio` | Perfil del negocio | Si |
| `/app-v2/negocio/objetivos` | Objetivos | Si |
| `/app-v2/negocio/memoria` | Memoria empresarial | Si |
| `/app-v2/fuentes` | Gestor de fuentes | Si |

## Pantallas ocultas de navegacion

Las siguientes secciones fueron eliminadas de la barra de navegacion por no tener funcionalidad real:
- Contenido
- Reputacion
- Visibilidad

Pueden reactivarse cuando tengan valor funcional conectado a fuentes reales.

## Analitica

17 eventos con contexto completo:
- `first_value_started`, `first_value_resumed`
- `business_setup_completed`, `primary_goal_selected`
- `manual_context_completed`
- `initial_source_selected`, `initial_source_connected`
- `initial_analysis_started`, `initial_analysis_completed`
- `first_recommendation_generated`, `first_recommendation_viewed`, `first_recommendation_accepted`
- `first_workspace_opened`, `first_action_completed`
- `first_value_completed`
- `beta_request_success`, `beta_request_failed`

Todos incluyen: `user_id`, `business_id`, `session_id`. Dedup via `Set<string>` por sesion.

## Seguridad

- RLS habilitado en ambas tablas nuevas
- `user_id DEFAULT auth.uid()` en first_value_progress
- Validacion de email en formulario beta
- Rate limit basico (5s entre envios)
- Duplicados por email controlados (unique index + error 23505)
- UTM params sanitizados via URLSearchParams
- No se exponen datos sensibles en analytics
- SELECT bloqueado en beta_access_requests para usuarios normales

## Limitaciones conocidas

1. **Analisis web real no implementado**: `website_verified` no se alcanza aun. Requiere integracion con funcion de analisis
2. **Plan semanal estimado**: Las acciones pendientes son templates, no recomendaciones basadas en datos reales
3. **Ejecucion inline simplificada**: No reutiliza el Execution Engine completo como workspace separado; usa un workspace simplificado dentro del flujo pero SI registra la accion en Business Memory/Timeline
4. **Business Memory en localStorage**: El perfil del negocio sigue en localStorage. La tabla Supabase solo cubre el progreso FV
5. **Tests**: 30 tests unitarios cubren engine, repository y source states. Tests de integracion E2E pendientes para Sprint 6

## Resultados de calidad

- **TypeScript**: 0 errores en archivos Sprint 5.1 (79 errores preexistentes en V1, no introducidos por este sprint)
- **Build**: Pasa correctamente (17.8s)
- **Tests**: 30/30 passed (3 test files)
- **V1**: No modificada, sigue funcionando

## Riesgos pendientes

1. **Sin Google Business real**: Todas las recomendaciones seran estimadas hasta integrar la API
2. **Concurrencia**: Si el usuario abre el flujo en dos pestanas, la ultima escritura gana
3. **Migracion datos V1**: Los datos del flujo anterior en localStorage no se migran

## Recomendacion para Sprint 6

1. Integrar analisis web real (reutilizar edge function existente si aplica)
2. Conectar Business Memory a Supabase
3. Implementar Execution Engine real en el flujo first-value
4. Tests automatizados para engine y repository
5. Admin dashboard para gestionar beta_access_requests
