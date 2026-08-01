# Sprint 5 — First Value Experience

## Objetivo

Diseñar y construir el flujo que lleva a un nuevo usuario desde el registro hasta su primera acción completada (Time-to-First-Value < 3 minutos), más una landing de captación beta pública.

## Módulo: `src/features/first-value/`

### Archivos

| Archivo | Responsabilidad |
|---------|----------------|
| `types.ts` | `FirstValueStep`, `STEP_ORDER`, `FirstValueState`, `BusinessSetupData`, `SourceChoice`, `FirstRecommendationData` |
| `repository.ts` | `FirstValueRepository` interface + `createFirstValueRepository()` (localStorage: `lsh_v2_first_value`) |
| `engine.ts` | `generateFirstRecommendation()`, `getGoalLabel()`, `computeTimeToFirstValue()` — lógica pura sin UI |
| `analytics.ts` | 16 funciones de tracking con dedup vía `Set` |
| `steps.tsx` | Componentes de cada paso: Welcome, BusinessSetup, PrimaryGoal, SourceSetup, InitialAnalysis, FirstRecommendation, FirstValueSuccess |
| `FirstValueFlow.tsx` | Orquestador principal con `FlowShell`, `FirstValueProgress`, integración con business-memory y reality-engine |
| `BetaLanding.tsx` | Landing pública `/beta` con formulario de pre-registro |
| `index.ts` | Re-exports públicos |

### Flujo de pasos (STEP_ORDER)

1. `welcome` — Bienvenida y propuesta de valor
2. `business_setup` — Nombre, categoría, ciudad, web del negocio
3. `primary_goal` — Seleccionar objetivo principal (6 opciones)
4. `source_setup` — Elegir fuente de datos inicial (web/manual/demo)
5. `initial_analysis` — Animación de análisis (simulado)
6. `first_recommendation` — Primera recomendación personalizada
7. `first_action` — Ejecución inline de la acción
8. `completed` — Celebración + navegación al panel

### Decisiones de diseño

- **Gate pattern**: `FirstValueRedirect` en `AppV2.tsx` redirige a `/app-v2/empezar` si el flujo no está completado
- **Template matching**: Las recomendaciones se generan por mapping `goal → action templates`, con interpolación del nombre del negocio
- **Ejecución inline**: Se reutiliza `FirstExecutionInline` (workspace simplificado) para que el usuario complete la acción sin salir del flujo
- **Persistencia incremental**: Cada paso se guarda en localStorage; si el usuario cierra y vuelve, retoma donde dejó

### Analytics (dedup)

Todas las funciones de tracking usan un `Set<string>` en memoria para evitar duplicados en la misma sesión:
- `trackFirstValueStarted`, `trackFirstValueStepViewed`, `trackFirstValueStepCompleted`
- `trackBusinessSetupCompleted`, `trackPrimaryGoalSelected`
- `trackInitialSourceSelected`, `trackFirstRecommendationGenerated`
- `trackFirstRecommendationViewed`, `trackFirstRecommendationAccepted`
- `trackFirstActionStarted`, `trackFirstActionCompleted`
- `trackFirstValueCompleted`, `trackFirstValueAbandoned`

## Beta Landing (`/beta`)

- Ruta pública, sin autenticación
- Formulario: nombre, email, negocio, sector, ciudad, objetivo
- Datos guardados en localStorage (`lsh_v2_beta_signups`)
- Diseño: proceso de 5 pasos visualizado + formulario + social proof

## Rutas añadidas

| Ruta | Auth | Shell | Componente |
|------|------|-------|------------|
| `/beta` | No | No | `BetaLanding` |
| `/app-v2/empezar` | Sí | No | `FirstValueFlow` |

## Integración con otros módulos

- **Business Memory**: `FirstValueFlow` persiste `BusinessSetupData` en el repo de memoria cuando el usuario completa el setup
- **Reality Engine**: Conecta la fuente seleccionada via `connectSource()` del engine
- **Daily Briefing**: La primera recomendación alimenta el briefing del día siguiente

## Métricas clave

- Time-to-First-Value (TTFV): medido desde `trackFirstValueStarted` hasta `trackFirstActionCompleted`
- Tasa de completación por paso
- Fuente inicial más elegida
- Objetivo más popular

## Próximos pasos (Sprint 6+)

- Conectar formulario beta a Supabase (tabla `beta_signups`)
- A/B testing de variantes del flujo
- Personalización de recomendaciones con IA real
- Onboarding de fuentes reales (Google Business Profile API)
