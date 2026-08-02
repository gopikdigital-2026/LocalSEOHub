# Release Candidate — LocalSEOHub 2.0

## Estado: Listo para Beta Privada

---

## Arquitectura final

```
src/
├── app-v2/                    # App V2 (producto principal)
│   ├── AppV2.tsx              # Router V2 con lazy loading
│   ├── layouts/AppShellV2.tsx # Shell responsive (sidebar + bottom nav)
│   ├── routes/                # Paginas principales
│   │   ├── TodayPage.tsx      # Daily Briefing (alias DailyBriefingPage)
│   │   └── PlanPage.tsx       # Plan semanal minimo
│   └── demo/demoData.ts       # Datos de ejemplo etiquetados
├── features/
│   ├── first-value/           # Flujo de primer valor
│   │   ├── FirstValueFlow.tsx # Orquestador del flujo
│   │   ├── steps.tsx          # Componentes de cada paso
│   │   ├── engine.ts          # Generador de recomendaciones
│   │   ├── repository.ts      # Persistencia Supabase
│   │   ├── analytics.ts       # Eventos al funnel (→ Supabase)
│   │   ├── BetaLanding.tsx    # Landing de lista de espera
│   │   └── types.ts           # Tipos del modulo
│   ├── business-memory/       # Memoria del negocio
│   │   ├── BusinessProfilePage.tsx
│   │   ├── BusinessGoalsPage.tsx
│   │   ├── BusinessTimeline.tsx
│   │   ├── WeeklySummaryPage.tsx
│   │   ├── engine.ts          # Insights, preferencias, resumen
│   │   └── repository.ts      # localStorage (migracion a Supabase pendiente)
│   ├── daily-briefing/        # Pantalla "Hoy"
│   │   ├── DailyBriefingPage.tsx
│   │   └── engine.ts          # Priorizacion de recomendaciones
│   ├── execution/             # Motor de ejecucion
│   │   ├── ExecutionPage.tsx   # Router de workspaces
│   │   ├── workspaces.tsx     # 4 tipos de workspace
│   │   ├── engine.ts          # Estado de ejecucion
│   │   └── types.ts
│   └── reality-engine/        # Gestor de fuentes
│       ├── SourceManager.tsx
│       ├── engine.ts
│       └── repositories.ts
├── components/
│   ├── ui/index.tsx           # Sistema de diseno V2
│   └── data-status/index.tsx  # Badges de transparencia
├── hooks/                     # useAuth, useLocalStorage, useSubscription
├── lib/                       # Supabase client, analytics, i18n
└── services/analytics/        # v2Analytics (eventos → Supabase)
```

---

## Modulos activos

| Modulo | Estado | Persistencia |
|--------|--------|-------------|
| First Value Flow | Funcional | Supabase (first_value_progress) |
| Beta Landing | Funcional | Supabase (beta_access_requests) |
| Daily Briefing | Demo etiquetado | Demo data (banner visible) |
| Plan Semanal | Funcional | Supabase (derivado de first_value) |
| Business Memory | Funcional | localStorage |
| Execution Workspaces | Demo etiquetado | Memoria (no persiste externamente) |
| Source Manager | Placeholder transparente | localStorage |
| Resumen Semanal | Demo etiquetado | Demo data (banner visible) |

---

## Flujo completo del usuario

1. Llega a `/beta` → solicita acceso (Supabase)
2. Recibe invitacion → se registra
3. Entra a `/app-v2` → redirigido a `/app-v2/empezar`
4. Completa First Value (5-8 min):
   - Datos del negocio
   - Objetivo principal
   - Fuente de datos
   - Contexto manual (opcional)
   - Recibe primera recomendacion transparente
   - Ejecuta primera accion
5. Llega a pantalla de exito → navega a `/app-v2/plan`
6. Ve plan semanal con accion completada + pendientes estimadas
7. Navega a "Hoy" → Daily Briefing con datos demo etiquetados
8. Explora Business Memory, Fuentes

---

## Fuentes de datos

| Fuente | Estado real | Comportamiento |
|--------|-------------|----------------|
| Google Business Profile | No conectada | Placeholder con CTA "Conectar" |
| Sitio web | URL proporcionada | Marcada como "website_provided" (no verificada) |
| Resenas | No conectada | Placeholder |
| Manual | Siempre disponible | Datos del usuario con confidence "medium" |

---

## Analitica

Todos los eventos se envian a la tabla `analytics_events` de Supabase via `lib/analytics.ts`.

### Eventos del funnel First Value
first_value_started, first_value_resumed, business_setup_completed, primary_goal_selected, manual_context_completed, initial_source_selected, initial_analysis_completed, first_recommendation_generated, first_recommendation_viewed, first_recommendation_accepted, first_workspace_opened, first_action_completed, first_value_completed, beta_request_success, beta_request_failed

### Eventos V2 generales
v2_app_view, v2_today_view, v2_navigation_click, daily_briefing_view, recommendation_open, recommendation_execute, quick_action_click, workspace_open, workspace_complete, content_copy, business_profile_updated, goal_created, timeline_view, weekly_summary_view, source_connected

### Protecciones
- Dedup por sesion para eventos de vista (trackViewOnce / trackOnce)
- Sin PII (no emails, no nombres, no texto libre)
- Solo IDs y categorias en payloads

---

## Seguridad

- RLS en first_value_progress: solo owner (auth.uid() = user_id)
- RLS en beta_access_requests: INSERT publico, SELECT solo admin
- Validacion de entrada en beta form
- Sin console.log en produccion (V2)
- Sin claves expuestas

---

## Calidad

- TypeScript: 0 errores en V2
- Build: OK
- Tests: 30/30
- Sin TODO/FIXME en V2
- Sin console.log en V2
- Sin imports muertos en V2
