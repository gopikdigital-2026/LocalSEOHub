# A2.4.7 — Competitor Radar — Informe

## A. Resumen ejecutivo

Competitor Radar está activo en `/herramientas/radar`. La ruta está dentro de AppGuard y solo se abre con Premium o prueba.

Cómo funciona:

- El usuario escribe la web de un competidor ("Web del competidor", "https://competidor.com", botón "Analizar competidor").
- La nueva Edge Function versionada `competitor-radar-v2` descarga una sola página HTML pública. Usa el pipeline SSRF endurecido de `analyze-website` (copias byte a byte).
- De esa página se extraen señales observables, limitadas en tamaño.
- El frontend compara esas señales, de forma determinista y sin IA, con los datos reales del negocio del usuario. Cada dato muestra su procedencia.
- Se muestran como máximo 5 oportunidades basadas en reglas.
- No hay puntuación, ni IA, ni persistencia, ni migración.

`analyze-competitor-url` sigue retirada (410, mismo sha256).

**Clasificación: PARTIAL.**

Confirmaciones literales:

- Competitor Radar analyses only public information retrieved from the URL explicitly provided by the user.
- Competitor Radar does not fabricate competitor traffic, sales, customers, market share or rankings.
- Competitor Radar does not assign an arbitrary competitive score.
- Competitor Radar does not use AI in A2.4.7.
- Competitor Radar does not consume AI usage.
- Legacy analyze-competitor-url remains retired with HTTP 410.
- Remote website content is treated as untrusted data.
- Every redirect is revalidated before it is followed.
- Private, local, link-local and metadata destinations are blocked.
- Global AI limit remains 80.
- SEO Generator remains operational.
- AI Business Advisor remains operational.
- Maps Profile Scanner remains operational.
- GEO Audit remains operational.
- AI Digital Twin remains operational.
- Voice Simulator remains unavailable.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.

## B. Auditoría del sistema existente

**A) Qué hace `analyze-website`.**

- Recibe una URL con un token Premium (`requirePremium`, 30 peticiones/hora).
- Valida la URL con `checkUrl` y resuelve DNS validando todas las IPs.
- Conecta por TCP a la IP validada (fijada) con TLS al hostname. Sigue hasta 3 redirecciones revalidando cada una.
- Descarga 1 página (10 s, 2 MB) más `robots.txt` y `sitemap.xml`.
- Extrae title, meta description, h1, canonical y hasSchema.
- No comprueba el content-type y no persiste nada.

**B) Qué hacía `analyze-competitor-url` (legacy).** Ya era un stub 410 desde fases anteriores (sha256 `4d44f063…d71d`). Su versión original hacía `fetch()` directo a la URL del usuario, sin validación de IP ni de redirecciones, y enviaba el contenido a OpenAI.

**C) Por qué no se restaura.**

- Era vulnerable a SSRF.
- Usaba IA sin ledger.
- Su nombre está en la lista de 14 funciones retiradas que los tests exigen que sigan devolviendo 410.

Se crea una función nueva y versionada.

**D) Pipeline seguro reutilizado.** `urlSafety.ts`, `safeHttp.ts` y `entitlement.ts`, copiados byte a byte. Un test exige que sigan siendo idénticos.

**E) Qué es observable.**

- HTML estático de una sola página: title, meta description y robots, canonical, lang, viewport.
- Marca (og:site_name o nombre en schema), H1 y H2, número de palabras visibles.
- Teléfonos (`tel:` y schema), enlaces a redes sociales, CTAs, mapa o enlace a Google Maps.
- Tipos schema.org, dirección y servicios en schema.
- Si el texto menciona la ciudad o los servicios propios del usuario.
- HTTPS, redirección, estado HTTP, content-type y tamaño.

**F) Qué no es observable.** Tráfico, ventas, clientes, cuota de mercado, posiciones en Google o Maps, palabras clave, backlinks, autoridad, reseñas, publicidad, contenido renderizado por JavaScript y otras páginas del sitio.

## C. Clasificación FULL/PARTIAL/BLOCKED

**PARTIAL.**

- La reutilización segura es posible, así que no es BLOCKED.
- No es FULL porque solo se analiza una página, sin JavaScript, sin rastreo y sin métricas de rendimiento.

## D. Legacy analyze-competitor-url

- No se ha tocado: el directorio solo contiene `index.ts`, el sha256 es el mismo y devuelve `status: 410` (tests 38 y 71).
- El catálogo conserva `legacyFunction: 'analyze-competitor-url'` como referencia histórica. Es un dato interno que no se renderiza, y el frontend nunca invoca la función legacy.

## E. Arquitectura

```
CompetitorRadarPage (Premium gate, formulario)
  └─ repository.analyzeCompetitor → supabase.functions.invoke('competitor-radar-v2', {businessId, url})
        index.ts: requirePremium → POST → content-length ≤ 4 KB → handler
        handler.ts: valida body → normalize + checkUrl (sin red) → loadOwnTerms(userId, businessId)
                    → safeGet (DNS validado, IP fijada, TLS, redirecciones revalidadas) → content-type HTML
                    → extractSignals → JSON {status, fetch, signals, analyzedAt}
  └─ toAnalysis (validación estricta y recorte) → engine.compareCompetitor(perfil, GBP, análisis)
  └─ RadarResults (resumen, comparación por bloques, oportunidades, comprobado y no medido)
```

- Los datos propios se toman de `useBusiness()` (RLS).
- GBP viene de `loadSources` + `normalizeGbp` (RLS, sin tokens).
- El resultado vive solo en el estado de la página.

## F. Pipeline SSRF

Orden de las comprobaciones:

1. El tamaño del body (≤ 4096 bytes), la validez del JSON, el `businessId` UUID y la URL (string, no vacía, ≤ 2048) se validan antes de cualquier red.
2. `normalizeCompetitorUrl` antepone `https://` solo a dominios "desnudos". Cualquier otro esquema pasa tal cual a `checkUrl`.
3. `checkUrl` permite solo `http:` y `https:`. Rechaza:
   - credenciales o `@`;
   - cualquier puerto explícito (incluido :443);
   - espacios, barras invertidas y caracteres de control;
   - hosts IP literales (IPv4 en decimal, hex u octal, que WHATWG normaliza, e IPv6 entre corchetes);
   - hosts de una sola etiqueta y localhost/metadata;
   - sufijos internos (.local, .internal, .localhost, .lan, .test, .example, .onion, .arpa…).
4. Solo después se carga el negocio. Si la URL está bloqueada, no hay consulta a la base de datos, ni DNS, ni conexión (fixture D).
5. `safeGet` aplica DNS, conexión fijada y redirecciones (secciones G, H e I).

## G. DNS/IP validation

- Se resuelven A y AAAA con un timeout de 3 s.
- Si alguna IP no es pública, la respuesta es `blocked`, de modo que las resoluciones mixtas públicas/privadas se rechazan. Sin registros, la respuesta es `dns_empty`.
- IPv4 excluidas: 0/8, 10/8, 127/8, 100.64/10, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24 y ≥ 224/4.
- IPv6 solo se acepta en 2000::/3, menos documentación, Teredo y 6to4. Así se rechazan ::1, ULA, link-local y las IPv4-mapped.
- La conexión TCP va a la IP validada, no al hostname, lo que protege frente a DNS rebinding. TLS usa SNI y verificación contra el hostname original.

## H. Redirect validation

- Como máximo 3 redirecciones; con más, la respuesta es `too_many_redirects`. Los bucles dan `redirect_loop`.
- Cada `Location` vuelve a pasar `checkUrl` y una validación DNS nueva antes de conectar.
- Tests 19 y 20: una redirección pública hacia 192.168.x, 127.0.0.1 o 169.254.169.254 se bloquea y solo hubo una conexión, a la IP pública.

## I. Fetch limits

| Límite | Valor |
|---|---|
| Timeout por petición | 10 s |
| Tiempo total | 20 s |
| Tamaño máximo | 2 MB (sin truncar; `too_large`) |
| Redirecciones | 3 |
| Content-type | `text/html` o `application/xhtml+xml`; cualquier otro, o ausente, da `unsupported_content` |
| Cabeceras | 16 KB / 100 líneas |
| Accept-Encoding | `identity` |
| Peticiones | 1 GET, sin cookies ni Authorization, User-Agent `LocalSEOHub-Analyzer/1.0`; no se envían datos del usuario al sitio |
| Ejecución | Sin JavaScript, sin navegador, sin binarios |
| Body de la petición | ≤ 4 KB |
| URL | ≤ 2048 caracteres |

Durante esta fase se hizo además lineal el parser (`extract.ts`):

- Los patrones de etiquetas no cruzan `<`.
- Los cierres se buscan una sola vez.
- Comentarios, script, style, noscript, template, svg e iframe se eliminan con un barrido lineal.

Con eso, un HTML hostil con 300.000 etiquetas sin cerrar se procesa en ~12 ms (test incluido).

## J. Datos observables

Los campos son los de `PageSignals`. Todos están recortados:

- title (200 caracteres), metaDescription (300), metaRobots, canonical (absoluto), lang, viewport y brand.
- h1 (≤ 3), h2 (≤ 8) y wordCount.
- phones (≤ 3), socials (Facebook, Instagram, LinkedIn, X, TikTok, YouTube, Pinterest) y ctas (≤ 5, más los enlaces a WhatsApp).
- hasMap, schemaTypes (≤ 10), schemaAddress, schemaServices (≤ 10) y localBusinessSchema.
- `matches.city` y `matches.services`: coincidencia de palabra completa, sin tildes, con la ciudad y los servicios del usuario.

Sobre la procedencia:

- Si una señal tiene valor, su procedencia es "Observado en la web" (OBSERVADO EN LA WEB).
- Si no lo tiene, es "No comprobado", con el texto "No detectado en la página analizada".
- Nunca se afirma la ausencia absoluta. La nota "Si algo no aparece, no significa que no exista en otras páginas de su web" está siempre visible.

## K. Datos no medibles

Se muestran literalmente:

- "No medimos tráfico, ventas, cuota de mercado ni posiciones en Google." (bajo el formulario y en "QUÉ NO MEDIMOS").
- La lista: tráfico, visitas o clics; ventas, ingresos, clientes o conversiones; cuota de mercado; posiciones en Google o Maps; palabras clave, enlaces o autoridad; reseñas, valoraciones o publicidad.

Los tests 49–55 verifican que ninguna clave de la respuesta, ningún texto de oportunidad ni ningún texto de la interfaz (fuera de estos avisos) nombra esos conceptos.

## L. Datos del negocio utilizados

- **Frontend** (`useBusiness`, RLS): nombre, actividad, ciudad, servicios, teléfono (validado) y web (validada). Más el estado de GBP.
- **Servidor:** solo `city` y `services`, para calcular coincidencias. Nunca se devuelven ni se envían al competidor.
- **Procedencia de los datos propios:**
  - Declarado: dato manual.
  - Verificado: solo GBP conectado y sincronizado con datos.
  - Detectado: GBP conectado sin sincronizar.
  - No comprobado: el resto.

Los datos manuales nunca se marcan como verificados (test 69).

## M. Comparación

- Hay 7 bloques: IDENTIDAD, SERVICIOS, UBICACIÓN, CONTACTO, CONTENIDO, SEO ON-PAGE y SEÑALES LOCALES. Contienen 22 o 23 filas; "Tus servicios mencionados en su web" solo aparece si el usuario tiene servicios.
- Estado de cada fila:
  - Si es un campo que no medimos de tu lado (tu web no se analiza aquí), el estado es "— No comprobado".
  - Si tu negocio tiene el dato, "✓ Disponible".
  - Si solo el competidor lo muestra, "⚠ Oportunidad".
  - En cualquier otro caso, "— No comprobado".
- La interfaz explica que «Oportunidad» solo significa una diferencia observable, no que el competidor funcione mejor.

## N. Opportunity engine

Son reglas fijas en orden fijo y se muestran como máximo 5:

1. `own_services`
2. `own_website`
3. `own_city`
4. `own_phone`
5. `their_cta`
6. `their_location`
7. `their_schema`
8. `their_description`
9. `their_map`

Los textos usan "Podrías valorar…", "Puede ser útil…" y "Revisa si…". Nunca usan "copia", "aumentará ventas", "posicionar mejor" ni "te supera".

Las CTA solo llevan a rutas existentes: `/negocio`, `/herramientas/seo`, `/herramientas/geo` y `/herramientas/maps`.

## O. AI usage

Ninguno:

- Sin OpenAI ni `LocalSEO_KEY`.
- Sin `reserve_ai_usage` ni `settle_ai_usage` y sin migración.
- Los límites siguen igual: weekly-content 25, business-improvement 20, seo-generator 20, business-advisor 15, voice-simulator 0 y GLOBAL 80 (test 42).

## P. Rate limiting

Se reutiliza `authorize_premium_request`, la infraestructura existente y fuera del ledger de IA:

- Bucket `premium:competitor-radar-v2:<userId>`.
- **30 análisis por hora por usuario.** Por encima, la respuesta es 429 `rate_limited` con mensaje amable.
- No hace falta migración.

## Q. Auth/entitlement

- `requirePremium(req, "competitor-radar-v2", corsHeaders)` se ejecuta antes de leer el body. Verifica el token con `/auth/v1/user` y Premium/trial con la RPC del servidor.
- Respuestas: 401 `unauthorized`, 403 `premium_required`, 429 y 503.
- `verify_jwt = true`.
- En la interfaz, `hasPremium` muestra la tarjeta de bloqueo.
- Comprobado contra la función desplegada: sin sesión responde 401.

## R. User isolation

- `userId` sale del token y nunca del body (test 44 envía `user_id` y `premium` falsos, que se ignoran).
- El negocio se busca con `.eq("id", businessId).eq("user_id", userId)`. Con otro usuario la respuesta es 404 y no hay conexión (test 43).
- El frontend no usa `user_id`.

## S. Privacy

- No se envían ni se muestran email, user_id, metadatos de auth, IDs de Stripe, tokens ni secretos.
- La petición al competidor no lleva cookies, Authorization ni datos del negocio (verificado en el test de URL válida).
- Errores:
  - Siempre son códigos genéricos con mensajes amables.
  - La excepción interna se registra solo como mensaje en el log del servidor.
  - El frontend mapea códigos desconocidos a `unavailable`.
- El HTML remoto nunca llega al frontend (test 60). Los scripts, comentarios e instrucciones inyectadas en el HTML no aparecen ni se obedecen.

## T. Files created

- `supabase/functions/competitor-radar-v2/index.ts`
- `supabase/functions/competitor-radar-v2/handler.ts`
- `supabase/functions/competitor-radar-v2/extract.ts`
- `supabase/functions/competitor-radar-v2/safeHttp.ts`: copia idéntica.
- `supabase/functions/competitor-radar-v2/urlSafety.ts`: copia idéntica.
- `supabase/functions/competitor-radar-v2/entitlement.ts`: copia idéntica.
- `src/features/competitor-radar/types.ts`
- `src/features/competitor-radar/repository.ts`
- `src/features/competitor-radar/engine.ts`
- `src/features/competitor-radar/copy.ts`
- `src/features/competitor-radar/CompetitorRadarPage.tsx`
- `src/features/competitor-radar/RadarResults.tsx`
- `src/features/billing/__tests__/a247CompetitorRadar.test.ts`
- `auditoria-a2/A2_4_7_INFORME.md`

## U. Files modified

- `supabase/config.toml`: `[functions.competitor-radar-v2] verify_jwt = true`.
- `src/features/tools/catalog.ts`: radar con `enabled: true`, `path: '/herramientas/radar'` y `recoveryStatus: 'ACTIVE'`, siguiendo la convención de las herramientas publicadas. La clasificación PARTIAL consta en este informe. El copy aprobado no cambia.
- `src/App.tsx`: lazy `CompetitorRadarPage` y la ruta dentro de AppGuard.
- Tests existentes, con cambios mínimos para reflejar que Radar está disponible:
  - `toolsHub.test.ts`
  - `a2420Ledger.test.ts`: 5 → 6 herramientas habilitadas.
  - `a242SeoGenerator.test.ts`
  - `a243BusinessAdvisor.test.ts`
  - `a244MapsScanner.test.ts`
  - `a245GeoAudit.test.ts`
  - `a246DigitalTwin.test.ts`
  - `premiumAccess.test.ts`: se añade `competitor-radar-v2` a las funciones Premium y a las copias de entitlement.

No se ha tocado nada de Stripe, OAuth, GBP, signup, SMTP, verificación, reset de contraseña, Pixel, Clarity, onboarding, plan semanal, misiones, informes, formulario de negocio, SEO, Advisor, Maps, GEO, Twin ni del ledger.

## V. Tests

`a247CompetitorRadar.test.ts`: 113 tests, todos en verde.

- **Seguridad 1–28** con un harness de red simulado (tabla DNS y servidores por IP):
  - localhost y sus subdominios, 127.0.0.1, 127.x, loopback en decimal, hex y octal, ::1.
  - 10/8, 172.16/12, 192.168/16, link-local, 169.254.169.254 y metadata.google.internal.
  - ULA y link-local IPv6, IPv4-mapped privada y loopback, .internal y single-label.
  - Esquemas file, ftp, data, javascript y gopher.
  - Credenciales y puertos 8443, 22, 443 y 6379.
  - Redirección pública → privada y pública → metadata, cadena de más de 3 saltos.
  - DNS privado (A y AAAA mapped) y DNS mixto (A y AAAA).
  - 7 URLs mal formadas, URL y body sobredimensionados, respuesta de más de 2 MB.
  - PDF, PNG, JSON, octet-stream y content-type ausente.
  - Timeout.
  - URLs públicas válidas (dominio desnudo, IP fijada, TLS y redirección www), fixture D y HTML hostil en tiempo acotado.

  Todas las entradas bloqueadas verifican 0 consultas DNS, 0 conexiones y 0 consultas de negocio.
- **Funcionales 29–78**: todos los puntos de la especificación.
- **Fixtures A–E**, extracción con límites, validación del frontend y mapeo de errores, mensajes en ES y EN, textos obligatorios y orden del layout.

Suite completa: **944 tests, 35 ficheros, todo en verde** (831 de base + 113 nuevos).

## W. Fixtures

- **A — perfil completo frente a competidor estructurado** (ProfessionalService, dirección en Marbella, 2 servicios en schema, teléfono, CTAs, Instagram, mapa):
  - Las filas propias están Disponibles.
  - Las coincidencias de servicios son ["SEO local", "Diseño web"].
  - Las oportunidades son their_cta, their_location, their_schema, their_description y their_map.
- **B — perfil incompleto frente a taller claro en Málaga:** las 4 primeras oportunidades son completar los datos propios (servicios, web, ciudad y teléfono). Ningún texto dice "gana", "supera", "mejor que" ni "copia".
- **C — competidor escaso** (`<p>Hola</p>`): 15 o más filas "No comprobado", 0 oportunidades y ninguna penalización.
- **D — URL maliciosa o privada** (metadata, IPv4-mapped metadata, file://): se bloquea antes de la consulta del negocio y de cualquier conexión.
- **E — URL pública que redirige a un destino privado:** se bloquea tras revalidar; solo hubo 1 conexión, a la IP pública.

## X. Real-web E2E

**Pipeline real contra un sitio público: TESTED.**

Se ejecutó el mismo `handler.ts` (con safeHttp, urlSafety y extract) en Node, con DNS, TCP y TLS reales. Es el mismo código que la función desplegada; solo cambia el adaptador de red (Node en lugar de Deno). Resultados:

| URL | Estado | URL final | Redirecciones | Content-type | Bytes | Tiempo | Resultado |
|---|---|---|---|---|---|---|---|
| `https://example.com/` | 200 | `https://example.com/` | No | text/html | 577 | 78 ms (106 ms en total) | analyzed: title "Example Domain", lang "en", viewport true, 27 palabras, h1 vacío |
| `example.com` (dominio desnudo) | 200 | `https://example.com/` | No | text/html | 577 | 20 ms | analyzed (normalizado a https) |
| `http://169.254.169.254/` | 422 | — | — | — | — | 1 ms | `blocked`, sin red |

El h1 vacío es correcto: el HTML actual de example.com no tiene `<h1>`, comprobado de forma independiente.

**Función desplegada:**

- Sin sesión responde 401 (verificado).
- **DEPLOYED AUTHENTICATED E2E = NOT TESTED.** No hay credenciales de un usuario Premium disponibles en este entorno, y crear o forzar un usuario Premium modificaría datos de facturación.

## Y. Build/TypeScript/ESLint

| Verificación | Base | Ahora | Nuevos |
|---|---|---|---|
| Tests | 831 | 944 en verde | +113, 0 fallos |
| TypeScript (`tsconfig.app.json`) | 20 errores | 20 | 0 (todos preexistentes) |
| ESLint | 30 problemas | 30 | 0 |
| Build | OK | OK | — |

- Se corrigió durante la fase un aviso nuevo de ESLint (`no-control-regex` en `extract.ts`). Se sustituyó por `\p{Cc}`, una clase Unicode equivalente que además cubre C1.
- La build se volvió a ejecutar tras el último cambio y la función se redesplegó.

## Z. Riesgos/pending items

- **Sitios renderizados con JavaScript:** muestran pocas señales y aparecen como "No comprobado". Es una limitación conocida (PARTIAL) y la interfaz no la presenta como ausencia.
- **Una sola página:** servicios, teléfono o mapa que estén en otras páginas no se ven. Hay una nota visible al respecto.
- **WAF y bloqueos anti-bot:** pueden devolver 403. El usuario ve "La página indicada no está disponible".
- **Codificación:** las páginas que no son UTF-8 pueden mostrar caracteres incorrectos en los textos extraídos.
- **Puertos explícitos:** se rechazan siempre, incluso :443. Es intencionado por la política SSRF y el mensaje sugiere usar la dirección normal.
- **`<script>` sin cerrar:** si un `<script>`, `<style>` o comentario no se cierra, se descarta el resto del HTML. Es conservador y equivale al comportamiento del navegador.
- **Bucket de rate limit:** es independiente del de `analyze-website` (30/hora cada uno).
- **Pendiente:** E2E autenticado contra la función desplegada con un usuario Premium real.
- **No se avanza a A2.4.8.** Se queda a la espera de auditoría y autorización expresa.
