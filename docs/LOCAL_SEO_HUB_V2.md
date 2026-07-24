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
  features/        → Modulos por area funcional (today, weekly-plan, content, etc.)
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

### Sprint 1 — Onboarding y datos reales
- Flujo de configuracion de negocio
- Conexion de primera fuente de datos
- Primeras recomendaciones basadas en datos reales

### Sprint 2 — Plan semanal
- Vista de plan con acciones priorizadas
- Flujo de ejecucion de tareas
- Tracking de completado

### Sprint 3 — Contenido y reputacion
- Generacion de contenido guiada
- Gestion de resenas
- Publicacion en Google Business

### Sprint 4 — Visibilidad e informes
- Dashboard de metricas reales
- Informes semanales automaticos
- Comparacion temporal
