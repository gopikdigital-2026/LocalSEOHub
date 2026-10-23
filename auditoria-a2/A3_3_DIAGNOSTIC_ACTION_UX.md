# A3.3 — DIAGNOSTIC → ACTION UX

## 1. Objetivo
Que cada prioridad de Maps Profile Scanner, AI Digital Twin y GEO Audit lleve de PROBLEMA → POR QUÉ → SIGUIENTE PASO → ACCIÓN concreta, con el mismo destino para el mismo hueco en las tres herramientas.

## 2. Principio de producto aplicado
El diagnóstico no termina en una nota: termina en el campo exacto que hay que completar. Las herramientas de IA solo aparecen como ayuda secundaria («Te puede ayudar»), nunca como CTA principal.

## 3. Arquitectura (reutilización de A2.7.1)
- Se reutiliza la Action Layer: `mapsActions` / `twinActions` / `geoActions` → `ActionItem.key` (ActionKey) + `ActionDetail` (why / next / supporting).
- Nuevo módulo único `src/features/action-layer/primary.ts`: `PROFILE_ANCHORS`, `CANONICAL_TARGETS`, `PRIMARY_CTA` (es/en) y `primaryAction(lang, item, fallback)`.
- No hay arquitectura paralela: la clave canónica es la ActionKey ya existente.
- `model.ts`, `copy.ts` y `ActionDetail.tsx` de la Action Layer **no se han modificado** (hashes fijados por tests previos siguen en verde). La lógica canónica vive en `primary.ts` precisamente para no tocar ficheros congelados consumidos por /hoy y /plan.

## 4. Destinos canónicos
| ActionKey | Destino | CTA (es) |
|---|---|---|
| identity | /negocio#profile-name | Completar nombre |
| activity | /negocio#profile-category | Completar actividad |
| city | /negocio#profile-city | Añadir ciudad |
| phone | /negocio#profile-phone | Añadir teléfono |
| website | /negocio#profile-website | Añadir sitio web |
| hours | /negocio#profile-schedule | Completar horario |
| services | /negocio#profile-service-input | Completar servicios |
| audience | /negocio#profile-targetAudience | Definir público objetivo |
| goal | /negocio/objetivos | Elegir objetivo |
| align_phone | /negocio#profile-phone | Revisar teléfono |
| align_website | /negocio#profile-website | Revisar sitio web |
| gbp_connect / gbp_fix / gbp_sync / gbp_category / align_sources | /fuentes | Revisar fuentes |

Claves sin destino canónico (`reviews`, `keep_fresh`, `keep_updated`) conservan el enlace y texto propios de cada herramienta (fallback).

## 5. Maps Profile Scanner
El botón de cada prioridad usa `primaryAction(...)` (data-testid `diagnostic-primary-cta`). Why/next/supporting siguen saliendo de `ActionDetail`. Puntuación, estados y avisos sin cambios.

## 6. AI Digital Twin
Mismo patrón en cada hueco. Se mantiene «Así entiende LocalSEOHub tu negocio.» y se añade debajo de la definición (data-testid `twin-purpose`): «Cuanto mejor conoce LocalSEOHub tu negocio, más personalizadas pueden ser tus recomendaciones y contenidos.» El % del Twin no cambia.

## 7. GEO Audit
Mismo patrón en cada prioridad. El subtítulo ya existente («Evalúa si la información de tu negocio está preparada para ser comprendida por buscadores y asistentes de IA.») cumple el propósito pedido y está fijado por un test de A2.4.5, por lo que no se reescribe (diferencia solo de sinónimos: «Evalúa/comprendida» vs «Comprueba/entendida»).

## 8. Deep-linking a /negocio
- Implementado con hash de URL + ids de input ya existentes (sin rutas nuevas).
- `BusinessProfilePage`: un efecto lee `location.hash`, **solo acepta valores de `PROFILE_ANCHORS`** (lista blanca), espera a que el perfil esté cargado, hace `scrollIntoView` y `focus`.
- Hash desconocido → no hace nada. Sin `innerHTML`, sin selectores construidos con la entrada del usuario.

## 9. Herramientas de apoyo (secundarias)
Sin cambios respecto a A2.7.1: servicios → /herramientas/seo; público/objetivo → /herramientas/advisor. Solo como enlace discreto «Te puede ayudar». Teléfono, horario, web y fuentes no tienen herramienta de apoyo (no existe capacidad real).

## 10. Copy
CTAs específicos; ninguno contiene Generar / Mejorar / Continuar / Ver más / Resolver / IA (comprobado por test, es y en).

## 11. Veracidad
No se añade ningún botón de generación por IA ni se promete nada que la app no haga. Los estados NO COMPROBADO y los avisos se mantienen.

## 12. Ficheros modificados
- NUEVO `src/features/action-layer/primary.ts`
- `src/features/maps-scanner/MapsScannerPage.tsx`
- `src/features/geo-audit/GeoAuditPage.tsx`
- `src/features/digital-twin/DigitalTwinPage.tsx`
- `src/features/digital-twin/copy.ts` (solo nueva clave `purpose`)
- `src/features/business-memory/BusinessProfilePage.tsx` (deep-link)
- NUEVO test `src/features/action-layer/__tests__/a33DiagnosticAction.test.ts`

Diff contra snapshot A3.1: solo estos ficheros. `supabase/` idéntico.

## 13. Ficheros congelados (sin cambios, verificados por hash)
Motores Maps / GEO / Twin, TodayPage, PlanPage, today-intelligence/model, roadmap/model, action-layer model/copy/ActionDetail.

## 14. Fuera de alcance respetado
Sin cambios en /hoy, /plan, Today Intelligence, Roadmap, Mission engine, otras herramientas, prompts, edge functions, Auth, Billing, Stripe, RLS, límites, alcance GBP. Sin migraciones. Sin rediseño.

## 15. Tests A3.3 (14 nuevos)
1. Maps: CTA y destino específicos (teléfono, horario, servicios, web, fuentes).
2. Twin: servicios, público, teléfono, horario, web, objetivo.
3. GEO: servicios, web, fuentes, público, teléfono.
4. Misma ActionKey → mismo destino en las tres herramientas.
5. Todos los destinos son rutas existentes de App.tsx y los anclajes existen en /negocio.
6. Sin CTAs de IA/vagos; herramientas de apoyo secundarias y reales; las tres páginas usan `primaryAction`.
7. Google no conectado / roto / sin sincronizar → /fuentes.
8. Fallback de claves sin destino canónico.
9. Propósito del Twin + subtítulo intacto.
10. Deep-link con lista blanca.
11. Motores, /hoy, /plan, Today Intelligence y Roadmap byte-idénticos.
12. NO COMPROBADO presente.
13. 42 migraciones.
14. Rutas sin cambios.

## 16. Regresión antes / después
| Métrica | Antes (A3.1) | Después |
|---|---|---|
| Tests | 1723 / 1723 | 1737 / 1737 (+14) |
| TypeScript errores | 19 | 19 |
| ESLint | 29 (21 err, 8 warn) | 29 (21 err, 8 warn) |
| Migraciones | 42 | 42 |
| Rutas `<Route path>` | 26 | 26 |

Nota: informes previos citaban 27 rutas; el recuento real de `<Route path=` en App.tsx es 26 tanto en A3.1 como ahora (App.tsx idéntico).

## 17. Build
`npm run build` correcto.

## 18. Auditoría visual
**No realizada**: no hay navegador disponible en este entorno. La verificación es por código y tests. Pendiente revisión visual por el propietario: botones de prioridad en las 3 herramientas, salto + foco en /negocio, frase de propósito en Twin.

## 19. Riesgos / notas
- El salto a campo depende de que los ids de /negocio no cambien; un test fija la correspondencia.
- Si el perfil aún no existe, /negocio muestra su estado vacío y el deep-link no hace nada (comportamiento seguro).
- Subtítulo GEO: se conserva el texto fijado por test (sinónimo del pedido).

## 20. Veredicto
**PASS WITH NOTES** — implementación completa, regresión sin empeorar, build correcto. Notas: auditoría visual no posible sin navegador; subtítulo GEO equivalente pero no literal.

STOP — esperando revisión del propietario.
