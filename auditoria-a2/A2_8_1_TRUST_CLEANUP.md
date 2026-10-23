# LocalSEOHub — A2.8.1 TRUST & CONVERSION CLEANUP (informe de cierre)

> Este informe re-verifica, con el estado actual del código, la limpieza A2.8.1 ya implementada y documentada en detalle en `auditoria-a2/A2_8_1_TRUST_CONVERSION_CLEANUP.md`. En esta ejecución **no fue necesario modificar código de producto** (solo se añadió un archivo de tests): todos los criterios ya se cumplían y se comprobaron de nuevo.

## 1. Resumen ejecutivo

A28-005 está **CERRADO**. La landing activa no muestra testimonios, nombres de clientes, fotos stock, citas atribuidas, resultados por cliente, ni las cifras "+38% / +24% / +17%" ni la sección "Lo que cambia en 30 días". Las secciones se eliminaron completas y **no se sustituyeron por ninguna prueba social**. Hero y CTA principal se mantienen. Auth/F-03, Stripe/Billing, A2.7 y los motores de herramientas no se tocaron. Regresión verde, sin aumento de deuda.

## 2. A28-005 antes

- Sección "TESTIMONIOS" con 4 testimonios: nombre, cargo/negocio, foto Pexels, estrellas, cita y chip de resultado ("+3 llamadas en 48h", "Del puesto 8 al 2 en Maps", "4 de cada 5 respuestas de ChatGPT"…). Encabezado "No lo decimos nosotros".
- Sección "RESULTADOS" "Lo que cambia en 30 días" con contadores +38% llamadas / +24% visitas / +17% rutas.
- Código muerto `HeroDashboard` con +23% / +14% / +17%.
- Claves i18n no renderizadas con "4.9/5", "+2.400 negocios locales confían", "+38% reservas directas en un mes".

## 3. A28-005 después

Ninguno de esos elementos existe en la landing activa ni en sus claves i18n. El ritmo visual se mantiene: no se añadió sección nueva.

## 4. Secciones eliminadas

Testimonios (completa), Resultados/30 días (completa), `HeroDashboard` (muerto), bloque Maps demo "Competidores cercanos" con "+47 / +29 pts" (capacidad inexistente).

## 5. Copy modificado

| Antes | Después |
|---|---|
| "Más clientes" (`lp_howto_more`) | "Analiza. Prioriza. Mejora." / "Analyze. Prioritize. Improve." |
| "Publica y consigue clientes" (`landing_step_3_title`) | "Aplica los cambios" / "Apply the changes" |
| "Competidor #n en {city}" (difuminado) | "Competidor de ejemplo n" (sin difuminar) |
| Tarjetas Herramientas solo "Disponible" | Pill "Premium" + nota "Todas las herramientas están incluidas en Premium y en el periodo de prueba." |

Hero ("Descubre qué puede mejorar hoy tu negocio" + subtítulo aprobado) y CTA "Configurar mi negocio gratis" sin cambios.

**A28-009 (fricción CTA):** los CTA de adquisición abren registro; "Iniciar sesión" queda para usuario existente. No se detectó caso adicional que requiera cambio. Sin nuevas rutas ni cambios de Auth.

**A28-026 (badges Premium):** el estado se deriva con certeza (las 7 herramientas requieren Premium o prueba: lock card cliente + `premium_required` servidor). Solo cambio visual; lógica de entitlement intacta.

## 6. Archivos modificados (fase A2.8.1)

`src/components/LandingPage.tsx`, `src/lib/i18n.tsx`, `src/features/tools/ToolsPage.tsx`. En esta re-verificación: ninguno.

## 7. Archivos nuevos

`src/components/__tests__/a281TrustCleanup.test.ts`, `src/components/__tests__/a281Closure.test.ts`, `auditoria-a2/A2_8_1_TRUST_CONVERSION_CLEANUP.md`, y este informe `auditoria-a2/A2_8_1_TRUST_CLEANUP.md`.

## 8. Tests añadidos

`a281TrustCleanup.test.ts` cubre los 15 puntos obligatorios:

| # | Requisito | Cobertura |
|---|---|---|
| 1 | Testimonios ausentes | test 1 |
| 2 | Nombres/fotos de testimonios ausentes | test 1 (claves `t1–4_name/role`, `pexels`) |
| 3 | +38/+24/+17 ausentes | test 2 |
| 4 | Sin sustitutos ficticios | tests 3, 4 |
| 5 | Sin ratings/reviews/logos/contadores/casos falsos | test 4 |
| 6 | Hero aprobado | `a281Closure.test.ts` (hero ES exacto) |
| 7 | CTA principal | `a281Closure.test.ts` |
| 8 | Correcciones A2.8 | `a28Prelaunch.test.ts` + secciones demo |
| 9 | SEO cap 18 | test límites |
| 10 | AI caps 22/18/18/12/10, global 80 | test límites |
| 11 | Funciones legacy retiradas (410) | test legacy |
| 12 | Migraciones = 42 | test migraciones |
| 13 | Routing estable (27) | test rutas |
| 14 | Auth sin cambios | `a281Closure.test.ts`: hash de 11 archivos auth/F-03 (estado validado en producción) |
| 15 | Billing sin cambios | `a281Closure.test.ts`: hash de 9 archivos billing/Stripe |

Nuevo en esta ejecución: `src/components/__tests__/a281Closure.test.ts` (hero, CTA, ausencia de logos/casos/contadores, bloqueo por hash de Auth y Billing).

## 9. Suite completa

47 archivos / **1689 tests PASS** (baseline del spec: 1599; el aumento proviene de A2.8.1, F-03 Stage 2B y `a281Closure`).

## 10. TypeScript

**19** problemas preexistentes (baseline spec: 20). No aumenta.

## 11. ESLint

**29** problemas preexistentes (22 errores, 7 warnings; baseline spec: 30). No aumenta.

## 12. Migraciones

**42**. Nuevas: 0.

## 13. Rutas/páginas

**27**.

## 14. Build

PASS.

## 15. Evidencia grep

Búsqueda de `+38`, `38%`, `+24`, `24%`, `+17`, `17%`, `30 días`, `30 days`, `4.9/5`, `★`, `pexels`, `testimon`, `No lo decimos`, `confían`:

| Ubicación | Resultado | Clasificación |
|---|---|---|
| `src/components/LandingPage.tsx` (landing activa) | **0 coincidencias** | ACTIVE CUSTOMER-FACING: limpio |
| `src/features/tools/*`, `src/app-v2/routes/*` | 0 | ACTIVE: limpio |
| `src/lib/i18n.tsx` `bdt_s1_desc` ("4.7★ y 284 reseñas… 85%") | Clave no referenciada por ningún archivo | DORMANT (no renderizada) |
| `src/lib/i18n.tsx` `mc_mission_stars` ("★★★★★") | No referenciada | DORMANT |
| `src/lib/i18n.tsx` `onb_metric_pot_sub` ("Estimated in 30 days") | No referenciada | DORMANT |
| `auditoria-*`, `docs/*`, `__tests__/*` | Referencias históricas / aserciones negativas | DOCUMENTACIÓN / TEST |

Nombres de testimonios: las claves `t1–t4_name/role/city` ya no existen en i18n ni en la landing (test 1).

## 16. Auth NO modificado

Confirmado. No se tocó signup, signin, signup-instant, reenvío, verificación de email, reset de contraseña, callback, Google OAuth, Supabase Auth, SMTP, plantillas, `email_confirmed_at`, trial gating, sesiones, redirects ni rate limits. Sin migraciones de Auth.

## 17. Stripe/Billing NO modificado

Confirmado. Precios, productos, checkout, webhook, `billing_state_for`, `current_user_has_premium`, entitlements y duración de prueba intactos. Sin pagos de prueba.

## 18. A2.7 NO modificado

Confirmado. Hoy (máx. 3), Misiones, Plan (máx. 8, Ahora/Siguiente/Después), Action Layer, Today Intelligence, Roadmap y reconciliación intactos; los tests de hash congelado pasan. A28-021 no se tocó.

## 19. Motores de herramientas NO modificados

Confirmado. SEO Generator, Maps Scanner, Digital Twin, Competitor Radar, GEO Audit, Business Advisor y Voice Simulator: sin cambios de scoring, prompts ni límites. Funciones legacy siguen en 410.

## 20. Findings A28 cerrados

- **A28-005**: testimonios y estadísticas no verificables eliminados (CERRADO).
- **A28-012**: headings huérfanos ("Más clientes", "No lo decimos nosotros") eliminados/reescritos (CERRADO).
- **A28-026**: Herramientas muestra Premium de forma veraz (CERRADO).
- **A28-009**: sin fricción CTA adicional detectada (CERRADO, sin cambios).

## 21. Findings abiertos

| ID | Descripción | Clasificación |
|---|---|---|
| A281-007 | Claves i18n dormidas con claims (`bdt_s1_desc`, `mc_mission_stars`, `onb_metric_pot_sub`, otras); no se renderizan | Post-lanzamiento (limpieza de copy) |
| A281-008 | Línea demo Advisor suave; "7 dias" sin tilde | No bloqueante |
| A28-021 / A281-009 | Today muestra error Google como "no conectado" (archivo congelado) | Recomendado antes de tráfico pagado |
| A28-013 / A281-010 | Analytics de pago (InitiateCheckout, Purchase, CAPI) | **Requerido antes de tráfico pagado**; fase separada |
| A281-011 | Email del gate no se pre-rellena en registro | No bloqueante |
| A28-031 | Prueba E2E real de checkout | Antes de tráfico pagado |

F-03 / A28-001: validado manualmente en producción por el propietario (fuera del alcance de esta fase; no se modificó).

---

## Decisión

**A2.8.1: PASS**
