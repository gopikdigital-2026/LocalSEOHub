# Post-Beta Roadmap — LocalSEOHub 2.0

## Prioridad 1 — Valor real

| Mejora | Descripcion | Impacto |
|--------|-------------|---------|
| Integracion Google Business Profile | OAuth real + lectura de resenas, fotos, posts, metricas | Critico — convierte demo en producto real |
| Analisis web real | Crawl basico de URL proporcionada (meta tags, schema, velocidad) | Alto — activa "website_verified" |
| Recomendaciones basadas en datos reales | Engine que usa datos de GBP en lugar de templates | Alto — diferenciacion real |
| Publicacion de posts via API | "Publicar" que realmente publica en GBP | Alto — valor tangible inmediato |
| Respuesta a resenas via API | "Enviar respuesta" conectada a Google | Alto — ahorra tiempo real |

## Prioridad 2 — Persistencia y multi-dispositivo

| Mejora | Descripcion | Impacto |
|--------|-------------|---------|
| Migrar Business Memory a Supabase | Perfil, objetivos, timeline, preferencias en DB | Medio — sync multi-device |
| Plan semanal persistente | Tabla de planes semanales con historial | Medio — progreso real |
| Historial de ejecucion | Registro de acciones completadas con resultado | Medio — accountability |
| Notificaciones semanales | Email con resumen y proximas acciones | Medio — engagement |

## Prioridad 3 — Experiencia

| Mejora | Descripcion | Impacto |
|--------|-------------|---------|
| Consolidar landings (9 → 3) | Una landing principal, una para ads, una beta | Alto (marca) |
| Eliminar scores fabricados | Solo mostrar datos reales o no mostrar nada | Alto (confianza) |
| Onboarding skip para power users | Opcion de saltar pasos si ya tienen datos | Bajo |
| Dark mode | Soporte de modo oscuro en V2 | Bajo |
| Animaciones de transicion entre paginas | Page transitions suaves | Bajo |
| Tour interactivo | Guia del producto para nuevos usuarios | Medio |

## Prioridad 4 — Infraestructura

| Mejora | Descripcion | Impacto |
|--------|-------------|---------|
| Dividir App.tsx monolitico | Rutas V1 como lazy modules | Performance |
| Unificar session IDs | Un unico ID canonico para todo el tracking | Analytics |
| Focus traps en modales | Implementacion completa ARIA | Accesibilidad |
| Tests E2E (Playwright) | Flujo completo First Value automatizado | Calidad |
| Rate limiting en edge functions | Proteccion contra abuso | Seguridad |
| Monitoreo de errores (Sentry) | Captura de errores en produccion | Operaciones |

## Prioridad 5 — Crecimiento

| Mejora | Descripcion | Impacto |
|--------|-------------|---------|
| Referral program | Invitar a otros negocios | Crecimiento |
| Templates por sector | Contenido pre-generado por industria | Valor |
| Competidores | Analisis comparativo real | Diferenciacion |
| Reportes PDF | Informe mensual exportable | Valor percibido |
| Multi-negocio | Gestion de multiples establecimientos | Expansion |

---

## Decisiones pendientes

1. **Modelo de pricing** — Validar si 9.99 EUR/mes es correcto o necesita tier gratuito
2. **Contenido generado por IA** — Usar LLM para personalizar contenido o mantener templates
3. **Frecuencia de recomendaciones** — Semanal vs diaria vs bajo demanda
4. **Integracion social** — Anadir Instagram, Facebook ademas de GBP
5. **Mercado inicial** — Espana primero o expansion Latam simultanea

---

## NO hacer

- No anadir mas landings
- No crear mas herramientas standalone
- No construir CRM
- No construir email marketing
- No construir scheduler de redes sociales
- No competir con Hootsuite/Buffer

El producto es un **copiloto de crecimiento local**, no una suite de marketing.
