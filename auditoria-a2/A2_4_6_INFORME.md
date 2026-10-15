# A2.4.6 — AI Digital Twin — Informe

## A. Resumen ejecutivo

AI Digital Twin está activo en `/herramientas/twin`. La ruta está dentro de AppGuard (sesión y onboarding) y solo se abre con Premium o prueba.

Es una representación estructurada, determinista y sin IA de lo que LocalSEOHub sabe del negocio:

- Una tarjeta principal "TU DIGITAL TWIN" con nombre, actividad, ciudad, "CONOCIMIENTO DEL NEGOCIO XX %" y su estado.
- Un mapa de 8 bloques alrededor de "Tu negocio", cada uno con el origen de cada dato.
- La sección "Completa tu Digital Twin" con entre 1 y 5 huecos que rellenar.
- La procedencia de los datos y la lista "Qué no puede conocer todavía".
- El apartado "Qué puede hacer LocalSEOHub con este contexto", con enlaces a SEO, Advisor, Maps y GEO.

No se ha creado ninguna Edge Function, migración ni cuota.

**Clasificación: PARTIAL.**

## B. Auditoría de datos reales

| Campo | Fuente / almacenamiento | Disponibilidad (prod.: 3 negocios) | Fiabilidad | Tipo | Mostrable | En el Twin |
|---|---|---|---|---|---|---|
| name | `businesses.name` (RLS) | 2/3 | Media | Declarado | Sí | Sí |
| category (actividad) | `businesses.category` | 2/3 | Media | Declarado | Sí | Sí |
| city | `businesses.city` | 2/3 | Media | Declarado | Sí | Sí |
| services | `businesses.services[]` | 0/3 | Media | Declarado | Sí | Sí |
| target_audience | `businesses.target_audience` | 0/3 | Media | Declarado | Sí | Sí |
| website (URL) | `businesses.website` | 0/3 | Media (solo formato) | Declarado | Sí | Sí |
| phone | `businesses.phone` | 0/3 | Media | Declarado | Sí | Sí |
| schedule | `businesses.schedule` | 0/3 | Media | Declarado | Sí | Sí |
| primary_goal | `businesses.primary_goal` (GoalId) | 2/3 | Media | Declarado | Sí (etiqueta) | Sí |
| secondary_goals | `businesses.secondary_goals[]` | 0/3 | Media | Declarado | Sí | Sí, se muestran sin peso |
| Descripción | No existe ninguna columna | — | — | — | No | NO DISPONIBLE |
| Website analysis | `analyze-website` no persiste nada | — | — | — | No | NO COMPROBADO |
| Datos estructurados web | No se almacenan | — | — | — | No | NO COMPROBADO |
| GBP (estado, sincronización) | `connected_sources` (RLS, sin tokens) | 0 conectados | Ver R | Verificado / Detectado | Sí | Sí |
| GBP dirección y categoría | `connected_sources.metadata` | 0 | Ver R | Verificado | Sí | Sí, solo si están sincronizadas |
| Reseñas GBP | `metadata.totalReviews` | 0 | — | — | — | No (es evaluación, no identidad; queda en Maps) |
| Maps Scanner y GEO Audit | Motores puros, sin persistencia | — | — | Evaluación | — | No se copian sus puntuaciones (ver P y Q) |
| Plan semanal, misiones y acciones | `business_actions` (9 filas) | Sí | — | Sugerencias generadas | — | No (son recomendaciones, no conocimiento del negocio) |
| Business improvements y prepared replies | Borradores generados con IA | — | — | Generado | — | No (incluirlos mezclaría texto de IA con datos reales) |
| Área de servicio, productos, segmentos | No existen | — | — | — | — | No |

## C. Clasificación

**PARTIAL.** Identidad, ubicación, oferta, cliente, contacto, objetivos y presencia local están cubiertos. Descripción, contenido web y datos estructurados no tienen fuente, así que se muestran como No disponible o No comprobado y quedan fuera del porcentaje.

## D. Definición final

"Una representación estructurada de lo que LocalSEOHub conoce sobre tu negocio." No es un chatbot, un avatar ni una simulación, no hace predicciones y no da una puntuación de calidad.

## E. Campos utilizados

Nombre, actividad, ciudad, servicios, público objetivo, web, teléfono, horario, objetivo principal y conexión GBP (todos con peso). Además, sin peso: otros objetivos y dirección y categoría de Google (solo si existe sincronización).

## F. Campos no disponibles

Descripción, contenido de la web, datos estructurados, área de servicio, productos y segmentos. No se generan ni se infieren, y no penalizan.

## G. Procedencia (trust model)

- **DECLARADO:** cualquier dato introducido en LocalSEOHub. Nunca se marca como verificado.
- **DETECTADO:** GBP con estado `connected` pero sin datos sincronizados todavía. Solo se conoce la conexión.
- **VERIFICADO:** GBP `connected` con `last_sync_at` válido y al menos un campo de perfil sincronizado.
- **NO COMPROBADO:** no hay fuente, o el campo está vacío.

## H. Arquitectura

```
DigitalTwinPage → useBusiness() (RLS) → currentBusiness
                → loadSources(businessId) (RLS) → normalizeGbp()   [maps-scanner]
                → buildDigitalTwin(profile, gbp)  (función pura)  → TwinBlockCard × 8
```

## I. Archivos creados

- `src/features/digital-twin/engine.ts`
- `src/features/digital-twin/copy.ts` (ES/EN)
- `src/features/digital-twin/DigitalTwinPage.tsx`
- `src/features/digital-twin/TwinBlockCard.tsx`
- `src/features/billing/__tests__/a246DigitalTwin.test.ts` (56 tests)
- `auditoria-a2/A2_4_6_INFORME.md`

## J. Archivos modificados

- `src/features/tools/catalog.ts`: en la entrada twin, solo `recoveryStatus: 'ACTIVE'`, `enabled: true` y `path: '/herramientas/twin'`. El texto aprobado de la tarjeta no cambia.
- `src/App.tsx`: lazy import y una ruta dentro de AppGuard.
- Tests existentes, adaptados a la nueva lista de herramientas habilitadas:
  - `toolsHub.test.ts` (5)
  - `a2420Ledger.test.ts` (14, conteo 5)
  - `a242SeoGenerator.test.ts` (3)
  - `a243BusinessAdvisor.test.ts` (2-4)
  - `a244MapsScanner.test.ts` (5)
  - `a245GeoAudit.test.ts` (6)
- No se han modificado los motores de Maps ni de GEO. Solo se importan sus helpers y constantes.

## K. Fórmula de knowledgePercent

`knowledgePercent = round( Σ puntos )`. Los pesos suman 100, así que el resultado ya está en porcentaje.

- Campo conocido: peso completo.
- Campo parcial: la mitad del peso.
- Campo vacío: 0.

Los campos técnicamente imposibles de conocer (descripción, contenido web, datos estructurados) no forman parte de los 100. Cada campo con peso puede completarlo el usuario en `/negocio`, `/negocio/objetivos` o `/fuentes`.

## L. Pesos y campos

| Campo | Bloque | Peso | Conocido | Parcial (50 %) |
|---|---|---|---|---|
| name | Identidad | 8 | ≥2 caracteres | — |
| activity | Identidad | 10 | ≥3 caracteres | — |
| city | Ubicación | 12 | Presente | — |
| services | Oferta | 18 | ≥3 | 1–2 |
| audience | Cliente | 10 | ≥10 caracteres | Más corto |
| website | Contacto | 8 | Formato válido | — |
| phone | Contacto | 6 | ≥7 dígitos | — |
| hours | Contacto | 6 | Presente | — |
| primary_goal | Objetivos | 12 | GoalId válido | — |
| gbp | Presencia local | 10 | Conectado y sincronizado | Conectado sin datos |
| **Total** | | **100** | | |

## M. Bandas

| Rango | Estado |
|---|---|
| 85–100 | Muy completo |
| 65–84 | Bien definido |
| 40–64 | Parcial |
| 0–39 | Información inicial |

No se usan términos como "Excelente" o "Buen rendimiento".

**Caso mínimo:** sin nombre, o sin actividad y sin servicios. Se muestran "Tu Digital Twin está empezando a construirse." y "Completa la información de tu negocio para obtener una representación más útil." El porcentaje se sigue mostrando, porque la fórmula sigue siendo honesta.

## N. Bloques

| Bloque | Contenido |
|---|---|
| Identidad | Nombre, actividad, categoría Google si existe, descripción (No disponible) |
| Oferta | Servicios |
| Cliente | Público objetivo |
| Ubicación | Ciudad, dirección de Google (No comprobado sin sincronización) |
| Contacto | Web, teléfono, horario |
| Objetivos | Objetivo principal y otros objetivos |
| Presencia local | Estado de GBP y fecha de la última sincronización real |
| Presencia web | URL ("URL disponible") y contenido web (No comprobado). Siempre en estado No comprobado |

Estado de cada bloque:

- Completo: todos sus campos conocidos.
- Parcial: alguno conocido o parcial.
- Sin información: ninguno.

## O. Prioridades

Orden fijo, con un máximo de 5:

1. `complete_identity`, solo en el caso mínimo
2. `add_activity`
3. `add_city`
4. `add_services`
5. `add_audience`
6. `add_goal` (`/negocio/objetivos`)
7. `add_phone`
8. `add_hours`
9. `add_website`
10. `fix_gbp`, `connect_gbp` o `sync_gbp` (`/fuentes`), según el estado de GBP

Si no falta nada, aparece `keep_updated` (`/negocio`).

Texto visible: "Cuanto más completa sea la información de tu negocio, más personalizadas podrán ser las recomendaciones, contenidos y análisis de LocalSEOHub."

## P. Integración con Maps

Se reutilizan `normalizeGbp`, `text`, `serviceList`, `validPhone` y `validWebsite`. La puntuación de Maps no se copia, porque el Twin representa conocimiento y no evaluación. Las reseñas tampoco se muestran.

## Q. Integración con GEO

Se reutilizan los umbrales `MIN_SERVICES` y `MIN_AUDIENCE_CHARS`. La puntuación GEO no se copia ni se fusiona con el Twin. Hay un CTA "GEO Audit — Revisar la preparación GEO de tu información".

## R. GBP

- Funciona sin GBP.
- **Verificado** solo con una fila `connected` y sincronizada.
- No se llama a Google ni a `gbp-sync`.
- No se ha modificado OAuth ni Google Cloud.
- **Limitación heredada de A2.4.4/A2.4.5:** el cliente escribe `metadata` tras `gbp-sync`, así que "Verificado" significa "procedente de la sincronización". El impacto queda limitado al propio usuario.

## S. Website

- Solo se muestra la URL guardada ("URL disponible").
- No se hace ningún fetch, no hay crawler y no se toca `analyze-website`.
- Nunca se afirma "Web analizada".

## T. Seguridad

- Los datos se leen únicamente vía RLS (`useBusiness`, `loadSources`).
- No se usa `user_id` del cliente ni parámetros de URL.
- No se muestran IDs internos, tokens, metadata cruda ni `locationName`.
- Las CTA son rutas fijas, todas existentes.

## U. Privacidad

- No se muestra el email, la facturación ni metadata de autenticación.
- No se envía ningún dato a proveedores de IA.

## V. Coste IA

- 0 llamadas a IA, tanto al ver la herramienta como al pulsar "Actualizar Digital Twin".
- No consume ledger y no tiene cuota propia.

Límites sin cambios:

| Herramienta | Límite |
|---|---|
| weekly-content | 25 |
| business-improvement | 20 |
| seo-generator | 20 |
| business-advisor | 15 |
| voice-simulator | 0 |
| GLOBAL | 80 |

## W. Tests

`a246DigitalTwin.test.ts` tiene 56 tests: los 44 obligatorios del §39, las fixtures A–D, notas parciales, forma de producción y textos obligatorios.

Suite completa: **831/831 en verde** (baseline 775 + 56).

## X. Fixtures

| Caso | Conocimiento | Estado | Resultado |
|---|---|---|---|
| A — perfil completo sin horario, sin GBP | 84 % | Bien definido | Google No comprobado; huecos: horario, conectar GBP |
| B — perfil incompleto | 18 % | Información inicial | 5 huecos: ciudad, servicios, cliente, objetivo, teléfono |
| C — perfil + GBP sincronizado | 100 % | Muy completo | 1 fuente verificada; dirección y categoría de Google visibles |
| D — mínimo | 0 % | Información inicial | Mensaje de inicio; no se inventa nada |

En el caso C, si GBP está conectado pero sin datos sincronizados, el resultado es 95 % (Detectado) con el hueco `sync_gbp`.

## Y. Validación con datos reales

Lectura de solo consulta en producción, sin modificar datos.

- **Hay 3 negocios.** Dos tienen nombre, actividad, ciudad y objetivo principal. Ninguno tiene servicios, teléfono, web, horario ni público, y GBP no está conectado en ninguno.
- **Esos 2 negocios dan 42 % (Parcial).** Huecos: servicios, cliente, teléfono, horario y web.
- **El negocio vacío** queda en estado de inicio.

No se ha iniciado sesión con una cuenta real en el navegador; la validación se hizo aplicando el motor a la forma real de los datos. Gopik.Digital solo aparece como nombre en las fixtures.

## Z. Build / TS / ESLint / regresiones / riesgos

| Comprobación | Resultado | Nuevos | Preexistentes |
|---|---|---|---|
| Build | OK | — | — |
| tsc | 20 errores | 0 | 20 (igual que A2.4.5) |
| ESLint | 30 problemas | 0 | 30 (igual que A2.4.5) |

Regresiones cubiertas por los tests 38–44 y por sus suites: Maps, GEO, SEO, Advisor, weekly-content, business-improvement y las 14 funciones retiradas.

Riesgos:

1. La metadata GBP la escribe el cliente (ver R).
2. Los datos declarados no se contrastan con la realidad.
3. Descripción y análisis web siguen sin fuente. Para añadirlos haría falta una fuente nueva y versionada, no el código legacy.

### Confirmaciones

- AI Digital Twin represents only information actually available to LocalSEOHub.
- AI Digital Twin does not fabricate missing business information.
- AI Digital Twin does not use AI to complete missing fields.
- AI Digital Twin does not consume AI usage.
- Knowledge percentage measures available business context, not ranking or performance.
- Global AI limit remains 80.
- SEO Generator remains operational.
- AI Business Advisor remains operational.
- Maps Profile Scanner remains operational.
- GEO Audit remains operational.
- Competitor Radar remains unavailable.
- Voice Simulator remains unavailable.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.

A2.4.7 no se ha iniciado. Se espera auditoría y autorización expresa.
