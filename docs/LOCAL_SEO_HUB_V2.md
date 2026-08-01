# LocalSEOHub 2.0

## Vision del producto

LocalSEOHub 2.0 reorganiza la aplicacion alrededor de las tareas reales del negocio local, no alrededor de herramientas de IA independientes.

## Promesa central

> Cada semana LocalSEOHub analiza tu presencia digital, te indica que debes hacer, crea el contenido necesario y te ayuda a comprobar si estas mejorando.

## Ciclo del producto

1. **Detectar** — Analizar fuentes de datos (Google Business, sitio web, resenas)
2. **Priorizar** — Generar recomendaciones ordenadas por impacto
3. **Ejecutar** — Crear contenido y guiar acciones concretas
4. **Medir** — Comprobar resultados y ajustar el plan

## Arquitectura nueva

```
src/
  app-v2/          → Entrada, rutas y layouts de V2
  domain/          → Tipos de dominio compartidos
  features/        → Modulos por area funcional:
                     - business-memory/ (perfil, objetivos, timeline, insights)
                     - daily-briefing/ (motor de briefing diario)
                     - execution/ (workspaces de ejecucion guiada)
                     - first-value/ (onboarding, TTFV, beta landing)
                     - reality-engine/ (fuentes de datos, sincronizacion)
  services/        → Servicios compartidos (analytics, supabase, ai, business-data)
  components/
    ui/            → Sistema de diseno reutilizable
    data-status/   → DataStatusBadge, DataSourceInfo
```

## Areas de navegacion

| Ruta | Area | Descripcion |
|------|------|-------------|
| /app-v2/hoy | Hoy | Acciones prioritarias del dia |
| /app-v2/plan | Plan | Plan semanal de acciones |
| /app-v2/contenido | Contenido | Creacion y gestion de contenido |
| /app-v2/reputacion | Reputacion | Resenas y percepcion online |
| /app-v2/visibilidad | Visibilidad | Posicion en buscadores y mapas |
| /app-v2/informes | Informes | Progreso semanal y mensual |

## Reglas de transparencia de datos

- Todo dato debe tener un `dataMode`: `real`, `estimated`, o `demo`
- Datos demo se muestran SIEMPRE con `DataStatusBadge confidence="demo"`
- Nunca se presenta un dato estimado o demo como verificado
- No se usa Math.random para generar metricas, puntuaciones ni resultados
- No se usan temporizadores para fingir analisis (solo animacion visual con proceso real detras)

## Componentes del sistema de diseno

- Button, Card, Badge, Input, Select, Textarea
- Modal, Drawer, Tabs
- EmptyState, ErrorState, LoadingState
- PageHeader, SectionHeader
- DataStatusBadge, DataSourceInfo
- ImpactBadge, ProgressIndicator

## Funciones V1 temporalmente ocultas en V2

Las siguientes funciones NO aparecen en la navegacion V2 pero siguen accesibles en la app V1:

- Digital Twin (BusinessDigitalTwin)
- Voice Simulator (AiVoiceSimulator)
- Campaign Sandbox (AiCampaignSandbox)
- Autopilot (AiAutopilot)
- Generadores independientes
- Administracion (AdminDashboard)
- Meta Ads Landing
- Potential Landing

## Decisiones pendientes

- [ ] Flujo de onboarding V2 completo
- [ ] Conexion real con fuentes de datos (Google Business API)
- [ ] Motor de recomendaciones basado en datos reales
- [ ] Flujo de autenticacion propio para V2 (actualmente redirige a V1)
- [ ] Migracion de datos de usuarios existentes a estructura V2
- [ ] Diseno de la vista Plan semanal

## Proximos sprints

### Sprint 1 — Core Loop & Execution (completado)
- Vista "Hoy" con recomendaciones priorizadas
- Sistema de ejecucion guiada (workspaces por tipo de accion)
- Historial de acciones completadas

### Sprint 2 — Daily Briefing (completado)
- Motor de briefing diario personalizado
- Priorizacion inteligente de recomendaciones
- Resumen ejecutivo con metricas clave

### Sprint 3 — Business Memory & Personalization (completado)
- Perfil de negocio persistente (nombre, categoria, ciudad, servicios, web)
- Seleccion de hasta 3 objetivos de 7 disponibles
- Timeline de eventos y sistema de insights
- Puntuacion personalizada de recomendaciones
- Resumen semanal con progreso por objetivo

### Sprint 4 — Reality Engine (completado)
- Gestion de fuentes de datos (6 fuentes: GBP, web, resenas, Search Console, Analytics, manual)
- Estado de salud por fuente con sincronizacion simulada
- Historial de sincronizaciones
- Calculo de confianza global

### Sprint 5 — First Value Experience (completado)
- Flujo de onboarding en 8 pasos (TTFV < 3 min)
- Gate pattern: redireccion automatica si no completado
- Primera recomendacion personalizada por objetivo
- Ejecucion inline de la primera accion
- Beta landing publica con formulario de pre-registro
- Ver `docs/SPRINT_5_FIRST_VALUE.md` para detalle completo

### Sprint 6+ — Pendiente
- Conexion real con fuentes de datos (Google Business API)
- Motor de recomendaciones basado en datos reales
- Flujo de autenticacion propio para V2
- Migracion de datos de usuarios existentes
- Integracion Supabase para beta signups
