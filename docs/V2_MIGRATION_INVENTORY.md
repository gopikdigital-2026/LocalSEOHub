# V2 Migration Inventory

Clasificacion de componentes actuales para la migracion a LocalSEOHub 2.0.

## Leyenda

- **Conservar** — Se mantiene tal cual, accesible desde V1
- **Reutilizar parcialmente** — Contiene logica o UI que se adaptara a V2
- **Integrar** — Se incorporara dentro de un modulo V2
- **Ocultar** — No visible en V2 por ahora pero sin eliminar
- **Eliminar posteriormente** — Candidato a eliminacion tras completar V2

## Inventario

| Componente | Clasificacion | Notas |
|-----------|---------------|-------|
| LandingPage | Conservar | Landing publica principal, sigue activa |
| MissionControl | Reutilizar parcialmente | Panel principal V1, su logica de estado del negocio se adaptara a "Hoy" |
| MapsScanner | Integrar | La funcionalidad de escaneo se integrara en Visibilidad |
| DiagnosticLanding | Conservar | Landing publica para captacion |
| AdminDashboard | Ocultar | Solo accesible para admins, no mostrar en nav V2 |
| BusinessAuditLanding | Conservar | Landing publica para captacion |
| CopilotLanding | Conservar | Landing publica para captacion |
| GrowthPlanLanding | Conservar | Landing publica para captacion |
| UrlAnalysisPanel | Integrar | Se integrara en la seccion Visibilidad de V2 |
| AIBusinessAdvisor | Integrar | Su logica de recomendaciones alimentara el modulo "Hoy" |
| BusinessDigitalTwin | Ocultar | Feature avanzada, no prioritaria en V2 inicial |
| MetaAdsLanding | Conservar | Landing publica para captacion |
| PotentialLanding | Conservar | Landing publica para captacion |
| ContentGeneratorLanding | Conservar | Landing publica, la generacion se integrara en Contenido V2 |
| OnboardingFlow | Reutilizar parcialmente | Se adaptara al nuevo onboarding V2 |
| AiCampaignSandbox | Ocultar | Feature experimental, no prioritaria |
| AiAutopilot | Ocultar | Feature experimental, no prioritaria |
| AiVoiceSimulator | Ocultar | Feature experimental, no prioritaria |
| LoginModal | Conservar | Se usa temporalmente desde V2 para autenticacion |
| Navbar | Conservar | Solo para la app V1, V2 tiene su propia navegacion |
| LegalModals | Conservar | Se reutiliza para aspectos legales |

## Servicios

| Servicio | Estado |
|----------|--------|
| Supabase auth | Compartido entre V1 y V2 |
| Stripe/subscriptions | Sin cambios, compartido |
| Edge functions | Sin cambios, compartidas |
| Analytics (track) | Extendido con eventos v2_* |
| aiCache | Sin cambios |

## Reglas de migracion

1. No eliminar ningun componente en Sprint 0
2. No modificar Edge Functions existentes
3. No crear migraciones destructivas
4. No cambiar tablas existentes
5. V2 reutiliza la sesion de auth existente
6. Eventos analiticos V2 usan prefijo `v2_`
