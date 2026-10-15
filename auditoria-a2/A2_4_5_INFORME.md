# A2.4.5 — GEO Audit (AI search readiness & entity clarity) — Informe

## A. Resumen

GEO Audit está activo en `/herramientas/geo`, dentro de AppGuard (sesión + onboarding) y limitado a Premium/prueba.

Es un motor determinista en frontend, hecho de funciones puras, sin IA y sin aleatoriedad. Evalúa 14 criterios agrupados en 9 bloques y produce:
- "Preparación GEO XX / 100";
- "Cobertura del análisis XX %";
- un estado;
- un checklist por bloque;
- de 1 a 5 prioridades;
- fuentes utilizadas, "Qué no podemos comprobar todavía" y "Qué no medimos".

No se ha creado ninguna Edge Function ni migración. `generate-geo-audit` sigue devolviendo 410.

**Clasificación: PARTIAL.**

## B. Auditoría de datos reales

| Dato | Ubicación | Estado real |
|---|---|---|
| Nombre, actividad (`category`), ciudad, teléfono, web (URL), horario (`schedule`), servicios, público (`target_audience`) | `businesses` (RLS por usuario) | Disponibles, declarados por el usuario |
| Descripción del negocio | No existe columna ni fuente persistida | NO COMPROBADO |
| Dirección | Solo en `connected_sources.metadata` (GBP) | Solo con GBP sincronizado |
| Análisis web (title, meta, h1, hasSchema) | `analyze-website` lo devuelve pero `src` no lo invoca y nada se persiste | NO COMPROBADO |
| Datos estructurados / SEO técnico | No se almacenan | NO COMPROBADO |
| GBP | `connected_sources` (`google_business`, `status`, `last_sync_at`, `metadata`) | 0 filas sincronizadas en producción |
| Maps | Motor A2.4.4 (helpers puros) | Reutilizado |
| Objetivos, actividad reciente | Existen, pero no describen la entidad | No usados (no aportan claridad de entidad) |
| Timestamps | `businesses.updated_at`, `connected_sources.last_sync_at` | Usados para fechas |

Producción tiene 3 negocios:
- 1 vacío;
- 2 con solo nombre, categoría y ciudad.

## C. Clasificación FULL / PARTIAL / BLOCKED

**PARTIAL.**
- **FULL:** identidad (nombre, actividad), ubicación (ciudad), oferta, contacto, contexto.
- **Condicional a GBP sincronizado:** dirección, categoría Google y consistencia.
- **BLOCKED** por falta de fuente persistida: descripción, contenido web y datos estructurados. Se muestran como "No comprobado", no penalizan y reducen la cobertura.

## D. Tabla de señales

| Señal | Fuente | Disponible | Fiabilidad | Evaluable | Verificado/declarado | Usado |
|---|---|---|---|---|---|---|
| name | LocalSEOHub | Sí | Media | Sí | Declarado | Sí |
| category | LocalSEOHub | Sí | Media | Sí | Declarado | Sí |
| description | — | No | — | No | — | No (NO COMPROBADO) |
| city | LocalSEOHub | Sí | Media | Sí | Declarado | Sí |
| address | GBP metadata | Solo con GBP | Media (ver P) | Con GBP | Sincronizado | Sí |
| services | LocalSEOHub | Sí | Media | Sí | Declarado | Sí |
| website URL | LocalSEOHub | Sí | Media | Sí (formato) | Declarado | Sí |
| phone | LocalSEOHub | Sí | Media | Sí (≥7 dígitos) | Declarado | Sí |
| schedule | LocalSEOHub | Sí | Media | Sí | Declarado | Sí |
| target_audience | LocalSEOHub | Sí | Media | Sí | Declarado | Sí |
| web content | — | No persistido | — | No | — | No (NO COMPROBADO) |
| GBP category | GBP metadata | Solo con GBP | Media | Con GBP | Sincronizado | Sí |
| consistency | LocalSEOHub vs. GBP | Solo con GBP | Media | Si hay ≥1 par comparable | — | Sí |
| structured data | — | No persistido | — | No | — | No (NO COMPROBADO) |
| goals / activity | LocalSEOHub | Sí | — | — | — | No |

## E. Arquitectura

```
GeoAuditPage → useBusiness() (RLS)                     → currentBusiness
             → loadSources(businessId) (RLS, no tokens) → normalizeGbp() (helper A2.4.4)
             → geoAudit(profile, gbp)  (función pura)   → GeoResult → UI
```

Sin backend nuevo, sin red adicional, sin IA y sin ledger.

## F. Archivos creados

- `src/features/geo-audit/engine.ts`: motor puro.
- `src/features/geo-audit/copy.ts`: textos ES/EN.
- `src/features/geo-audit/GeoAuditPage.tsx`: página.
- `src/features/billing/__tests__/a245GeoAudit.test.ts`: 40 tests (38 numerados del §30 + fixtures A–D + forma de producción).
- `auditoria-a2/A2_4_5_INFORME.md`: este informe.

## G. Archivos modificados

- `src/features/maps-scanner/engine.ts`: solo se añadió `export` a los helpers `text`, `digits`, `host`, `validPhone`, `validWebsite` y `serviceList`. No cambia ninguna lógica.
- `src/features/tools/catalog.ts`: entrada geo con `recoveryStatus: 'ACTIVE'`, `enabled: true` y `path: '/herramientas/geo'`. `legacyFunction` se mantiene.
- `src/App.tsx`: lazy import y la ruta `/herramientas/geo` dentro de AppGuard.
- Tests existentes ajustados a la nueva lista de herramientas habilitadas:
  - `toolsHub.test.ts` (5);
  - `a2420Ledger.test.ts` (14, conteo 4);
  - `a242SeoGenerator.test.ts` (3);
  - `a243BusinessAdvisor.test.ts` (2-4);
  - `a244MapsScanner.test.ts` (5).

## H. Motor

`geoAudit(profile, gbp)`:
1. Normaliza los campos con `text`/`serviceList`.
2. Construye los 14 criterios con estado `ok | improve | unchecked`, puntos, fuente y nivel de confianza (`verified | available | unchecked`).
3. Calcula la cobertura.
4. Si los datos son insuficientes, devuelve `score: null`.
5. Si no, calcula la puntuación, el estado y las prioridades.

No usa `Date.now`, `Math.random`, `fetch` ni IA. Con la misma entrada da la misma salida (test 11).

## I. Fórmula de puntuación

`score = round( Σ puntos(criterios evaluables) / Σ peso(criterios evaluables) × 100 )`

## J. Fórmula de cobertura

`coverage = round( nº criterios evaluables / 14 × 100 )`

- Sin GBP: 8/14 = **57 %**.
- Con GBP y campos comparables: 11/14 = **79 %**.
- Hoy el máximo es 79 %, porque descripción, contenido web y datos estructurados no tienen fuente.

## K. Pesos (suman 100)

| Criterio | Bloque | Peso | Fuente | Condición de evaluación | Regla |
|---|---|---|---|---|---|
| name | Identidad | 8 | LocalSEOHub | Siempre | ≥2 caracteres → ok |
| activity | Identidad | 10 | LocalSEOHub | Siempre | ≥3 caracteres → ok |
| description | Identidad | 7 | — | Nunca (sin fuente) | NO COMPROBADO |
| city | Ubicación | 12 | LocalSEOHub | Siempre | Presente → ok |
| address | Ubicación | 5 | GBP | GBP con datos | Dirección presente → ok |
| services | Oferta | 17 | LocalSEOHub | Siempre | ≥3 → ok; 1–2 → 50 %; 0 → 0 |
| website | Contacto | 6 | LocalSEOHub | Siempre | Formato de dominio válido → ok |
| phone | Contacto | 4 | LocalSEOHub | Siempre | ≥7 dígitos → ok |
| hours | Contacto | 3 | LocalSEOHub | Siempre | Presente → ok |
| audience | Contexto | 7 | LocalSEOHub | Siempre | ≥10 caracteres → ok; más corto → 50 % |
| web_content | Presencia web | 8 | Sitio web | Nunca hoy | NO COMPROBADO |
| gbp_category | Google | 4 | GBP | GBP con datos | Categoría presente → ok |
| consistency | Consistencia | 5 | LocalSEOHub vs. GBP | ≥1 par comparable | Sin discrepancias → ok |
| structured_data | Estructurados | 4 | Sitio web | Nunca hoy | NO COMPROBADO |

## L. Estados

| Puntuación | Estado |
|---|---|
| 90–100 | Muy preparado |
| 75–89 | Bien preparado |
| 50–74 | Mejorable |
| 0–49 | Preparación baja |

No se usan expresiones como "ranking IA", "Top AI visibility" ni "ChatGPT score".

## M. Reglas

- **Datos insuficientes:** sin nombre, o sin actividad y sin servicios. En ese caso no hay puntuación y se muestra "No hay suficiente información para calcular una auditoría GEO fiable."
- **Consistencia:** solo se comparan los pares en los que existen ambos lados:
  - nombre: inclusión normalizada;
  - ciudad: dentro de la dirección GBP;
  - teléfono: últimos 9 dígitos;
  - web: host sin `www`.

  Si no hay ningún par, el resultado es NO COMPROBADO.

## N. Prioridades

Se toman de un orden fijo, con un máximo de 5:
1. `add_activity`
2. `add_city`
3. `add_services`
4. `add_website`
5. `fix_gbp`
6. `connect_gbp`
7. `align_sources`
8. `add_audience`
9. `add_phone`
10. `add_hours`
11. `gbp_category`

Si no se activa ninguna, se muestra `keep_fresh` → `/herramientas/seo`.

Cada prioridad lleva un texto "por qué importa" fijo y sin garantías.

Las CTA solo llevan a `/negocio` (Completar negocio), `/fuentes` (Revisar fuentes) y `/herramientas/seo` (Crear contenido). Nunca enlazan a Twin, Radar ni Voice.

## O. Sitio web

- Solo se valida el formato de la URL guardada.
- No hay fetcher nuevo, no se descarga contenido y no se llama a `analyze-website`, que no se ha modificado.
- `analyze-competitor-url` sigue retirado.
- Contenido web y datos estructurados aparecen como NO COMPROBADO.
- No se afirma nada sobre schema, JSON-LD, robots, sitemap, canonical, title, meta, OG ni headings.

## P. GBP

- **Sin GBP:** la herramienta funciona y los criterios de Google aparecen como NO COMPROBADO.
- **Con fila `connected` y `last_sync_at`:** se usan dirección, categoría y consistencia, etiquetadas como "Sincronizado desde Google".
- **Limitación heredada de A2.4.4:** `connected_sources.metadata` lo escribe el cliente tras `gbp-sync`. Un usuario puede editar su propia metadata, así que esta etiqueta indica "procedente de la sincronización" y no una verificación criptográfica.
- El impacto está acotado a su propia auditoría y el peso total de Google es de 14 puntos.
- No se ha modificado OAuth ni Google Cloud.

## Q. Consistencia

Solo se comparan fuentes que existen. Las discrepancias se muestran por campo (por ejemplo "No coincide: ciudad, teléfono.") y generan la prioridad `align_sources`.

## R. Qué no mide

GEO Audit no mide:
- la posición real en ChatGPT, Gemini ni Perplexity;
- el número de recomendaciones de una IA;
- la cuota de visibilidad en IA;
- el ranking generativo.

Texto visible: "LocalSEOHub no consulta ni simula rankings en asistentes de IA en esta auditoría."

Disclaimer visible: "Esta puntuación evalúa la preparación de tu información digital. No mide tu posición ni tu aparición real en ChatGPT, Gemini, Perplexity u otros asistentes."

- GEO Audit does not measure real ranking in ChatGPT, Gemini or Perplexity.
- GEO Audit does not fabricate AI visibility.

## S. Seguridad

- Datos leídos solo vía RLS (`useBusiness` y `loadSources`, que no seleccionan columnas de token).
- No se usa ningún `user_id` del cliente ni parámetros de URL.
- No se renderizan tokens, claves, metadata cruda ni IDs internos.
- No hay fetch arbitrario, así que no hay superficie SSRF.
- Las CTA son rutas fijas.

## T. Privacidad

- No se envía ningún dato a proveedores de IA ni a servicios externos.
- No se procesan datos personales más allá de los propios del negocio.

## U. Coste IA

0 llamadas a IA, sin uso del ledger y sin cuota GEO. Los límites no cambian:

| Herramienta | Límite |
|---|---|
| weekly-content | 25 |
| business-improvement | 20 |
| seo-generator | 20 |
| business-advisor | 15 |
| voice-simulator | 0 |
| GLOBAL | 80 |

- GEO Audit does not use AI for scoring.
- GEO Audit does not consume AI usage.
- Global AI limit remains 80.

## V. Tests

`a245GeoAudit.test.ts`: 40 tests, que cubren los puntos 1–40 del §30 y las fixtures A–D.

Suite completa: **775/775 en verde** (baseline 735 + 40).

## W. Fixtures

| Fixture | Descripción | Puntuación | Estado | Cobertura | Resultado |
|---|---|---|---|---|---|
| A | Perfil manual completo, sin horario, sin GBP | 96 | Muy preparado | 57 % | Prioridades `connect_gbp`, `add_hours` |
| B | Perfil incompleto | 27 | Preparación baja | 57 % | 5 prioridades concretas |
| C | Perfil + GBP | 100 | — | 79 % | Con discrepancias se marcan `city` y `phone`; sin pares comparables, la consistencia queda NO COMPROBADO |
| D | Datos mínimos | Sin puntuación | — | — | Mensaje obligatorio, prioridad `complete_identity` |

## X. Validación con datos reales

Se aplicó el motor determinista a la forma de los datos de producción:
- **2 negocios con nombre, categoría y ciudad:** puntuación 45 (Preparación baja), cobertura 57 %. Prioridades: servicios, web, conectar GBP, público y teléfono.
- **1 negocio vacío:** sin puntuación.

Gopik.Digital solo se ha usado como nombre en fixtures; no se ha confirmado que exista en la base de datos.

No se ha consultado ni probado ChatGPT, Gemini, Perplexity ni ningún otro asistente. El flujo GBP de extremo a extremo no se ha probado con una cuenta real, porque no hay filas sincronizadas.

## Y. Build

`npm run build`: OK.

## Z. TS / ESLint / regresiones / riesgos

**Comprobaciones**

| Comprobación | Resultado | Nuevos | Preexistentes |
|---|---|---|---|
| tsc | 20 errores | 0 | 20 (igual que A2.4.4) |
| ESLint | 30 problemas | 0 | 30 (igual que A2.4.4) |

En `App.tsx`, el aviso `useAuth` no usado es preexistente.

**Regresiones:** SEO, Advisor, Maps, weekly-content y business-improvement verificados por tests 36–40 y por sus suites.
- SEO Generator remains operational.
- AI Business Advisor remains operational.
- Maps Profile Scanner remains operational.
- Legacy generate-geo-audit remains retired with HTTP 410.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.

**Riesgos**
1. La metadata GBP la escribe el cliente (ver P).
2. Hoy la cobertura máxima es 79 %, hasta que exista una fuente persistida para descripción y análisis web. Si se añade, debe ser nueva y versionada, sin recuperar el código legacy.
3. Los datos declarados no se contrastan con la realidad.

A2.4.6 no se ha iniciado; queda a la espera de autorización.
