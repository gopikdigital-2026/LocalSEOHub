# LocalSEOHub.io — «Tu Semana»: informe de pruebas de la auditoría final

No se ha modificado ningún archivo de código ni de prueba para obtener estos resultados.

## 1. Pruebas ejecutadas realmente
| Ejecución | Alcance | Resultado |
|---|---|---|
| Vitest (pruebas relacionadas) | `src/features/actions`, `weekly-plan`, `today-intelligence`, `action-layer`, `business-memory`, `roadmap`, `billing/billingModel`, `billing/premiumAccess` | **17 archivos, 642/642 aprobadas**, 0 fallidas, 0 omitidas |
| Vitest (suite completa) | Todo el proyecto | **97 archivos, 3.247/3.247 aprobadas**, 0 fallidas, 0 omitidas |
| TypeScript (`tsc --noEmit -p tsconfig.app.json`) | Aplicación | 20 errores, **todos preexistentes** (línea base idéntica desde A3.7.6.5); ninguno en acciones ni en «Tu Semana» |
| Build de producción | Aplicación | OK |
| Pruebas aisladas de fechas (creadas para esta auditoría fuera del proyecto, en /tmp, y eliminadas después) | `buildWeeklyPlan`, `weekBounds`, `weekStart` y `buildActionReport` con fechas simuladas en 4 zonas horarias (Europe/Madrid, UTC, America/Mexico_City, Pacific/Auckland) | Ver sección 3 |

## 2. Pruebas que ya existían y cubren «Tu Semana»
| Archivo | Cubre |
|---|---|
| `actions/__tests__/engine.test.ts`, `sprint06.test.ts`, `fix061.test.ts` | Reglas, puntuación, duplicados, periodos de espera |
| `actions/__tests__/repository.test.ts` | Sincronización, resolución por datos, ausencia de reinserciones |
| `actions/__tests__/a3767ReadOnlyReconciliation.test.tsx` | Modo solo lectura, aislamiento, ausencia de escrituras, textos, fallo de fuentes |
| `weekly-plan/__tests__/a3761WeeklyPlanModel.test.ts` | Foco de 5, «Para después», estados, progreso |
| `weekly-plan/__tests__/a3762WeeklyPlanPage.test.tsx` | Página: carga, vacío, error, botones, ES/EN |
| `weekly-plan/__tests__/a3763WeeklyPlanRouting.test.tsx` | Rutas y redirecciones |
| `weekly-plan/__tests__/a3765WeeklyPlanVisibility.test.tsx` | Visibilidad durante la recarga |
| `today-intelligence/__tests__/a272TodayIntelligence.test.ts` | «Hoy» |
| `billing/__tests__/billingModel.test.ts`, `premiumAccess.test.ts` | Prueba activa, caducada, suscripción, solo lectura |
| `internal-access/__tests__/a3752TenantSecurity.test.tsx` | Aislamiento entre negocios |
| Suites congeladas de Meta y publicación (a351, a3512, a3521, a353, a3741–a3743, a3753) | No regresión de los componentes protegidos |

## 3. Resultados de las pruebas aisladas de fechas
Datos de partida: 4 acciones del negocio b1 y 1 del negocio b2:
- 2 pendientes;
- 1 completada el domingo 8-nov a las 20:00 (hora local);
- 1 descartada el domingo 8-nov a las 20:00.

| Comprobación | Madrid | UTC | México | Auckland |
|---|---|---|---|---|
| Clave el domingo 23:59:59 | 2026-11-02 | 2026-11-02 | 2026-11-02 | 2026-11-02 |
| Clave el lunes 00:00 | 2026-11-09 | 2026-11-09 | 2026-11-09 | 2026-11-09 |
| El lunes es el día de inicio | sí | sí | sí | sí |
| Progreso del domingo (hechas / pendientes / %) | 1 / 2 / 33 | 1 / 2 / 33 | 1 / 2 / 33 | 1 / 2 / 33 |
| Progreso del lunes | 0 / 2 / 0 | 0 / 2 / 0 | 0 / 2 / 0 | 0 / 2 / 0 |
| Foco del lunes (sin duplicados, sin b2) | a, d | a, d | a, d | a, d |
| La descartada no cuenta como hecha | sí | sí | sí | sí |
| Cierre el domingo 23:30 UTC cuenta en la semana del lunes 9 | sí | no | no | sí |

La última fila confirma que la semana es local al dispositivo (D-3, P3), como indica el texto de la página.

## 4. Comportamientos inspeccionados solo en código
- Políticas RLS de `business_actions`. Se consultaron en el diagnóstico A3.7.6.6; en esta auditoría no se ha consultado la base de datos.
- Destinos de «Ver» por tipo de acción, existencia de la ruta `/ejecutar/:recommendationId` y ausencia de llamadas de publicación desde las acciones.
- Atributos de accesibilidad y clases responsive.

## 5. Escenarios no verificables en este entorno
- Comprobación visual real en escritorio y móvil: no hay navegador.
- Comportamiento con datos reales de Google Business Profile: la API no está operativa por la cuota externa.
- Comportamiento en producción de la corrección A3.7.6.7: no está desplegada.
- Contraste de color medido con herramienta.

## 6. Errores preexistentes y regresiones
- **Preexistentes:** 20 errores de TypeScript, ajenos a «Tu Semana». Mensajes en consola de pruebas de Meta que simulan fallos a propósito; no son fallos.
- **Nuevas regresiones:** ninguna.

## 7. Confirmación
- No se ha modificado código, base de datos, configuración, permisos ni migraciones.
- No se ha desplegado ni publicado ninguna versión.
- No se ha hecho ninguna llamada externa real.
