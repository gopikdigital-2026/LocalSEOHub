# LocalSEOHub · FIX A2.2 · Hardening SSRF de analyze-website (hallazgo F-10)

Proyecto Supabase: `kdnrnibiwgijrejkizrk`. Alcance: solo la función `analyze-website` y sus pruebas. No se ha tocado Stripe, checkout, suscripciones, Premium, signup/login/trials/onboarding, Google OAuth/GBP/sync, v0.7.1–v0.7.3, motor de acciones, analítica/funnel, las 14 funciones retiradas en A2.1, otras funciones, rutas, menús, componentes ni diseño. Sin tablas nuevas, sin cambios de RLS, sin llamadas a OpenAI.

## 1. Resumen ejecutivo

`analyze-website` ya no usa `fetch()` global. Todas las descargas (página, `robots.txt`, `sitemap.xml`) pasan por un cliente HTTP/1.1 propio que:

1. valida la URL con una política estricta (solo http/https, sin credenciales, sin puertos explícitos, sin IP literales, sin nombres internos, sin codificaciones ambiguas);
2. resuelve A y AAAA con DNS *fail-closed* y rechaza la petición si **cualquier** dirección no es pública;
3. abre el socket TCP **directamente contra la IP validada** (`Deno.connect({hostname: <IP>})`), y en HTTPS verifica el certificado contra el hostname original (`Deno.startTls(conn, {hostname})`). No hay segunda resolución DNS entre validación y conexión: el *DNS rebinding* queda cerrado en el plano de red, no solo en el de pruebas;
4. sigue redirecciones manualmente (máx. 3), revalidando URL y DNS en cada salto, con detección de bucles;
5. aplica límites de bytes sobre el flujo real, timeout por petición y deadline total, y cierra el socket al superar cualquier límite.

F-10 se considera **resuelto a nivel de código y despliegue**, con la limitación de verificación en vivo descrita en la sección 7.

## 2. Viabilidad del anclaje de IP (anti-rebinding)

Antes de implementar se desplegó una sonda temporal (ya eliminada) que confirmó en el runtime Edge de Supabase:

| Capacidad | Resultado |
|---|---|
| `Deno.resolveDns(host, 'A' / 'AAAA')` | Funciona; NXDOMAIN lanza `NotFound` |
| `Deno.connect({hostname: <IP>, port})` | Funciona |
| `Deno.startTls(conn, {hostname: <host original>})` | Funciona y valida el certificado contra el hostname (IP equivocada → `InvalidData`) |

La sonda solo usó dominios públicos fijos (`example.com`, `www.wikipedia.org`), nunca direcciones internas. Se borró con `delete_edge_function`, y `supabase/config.toml` quedó idéntico al de A2.1.

Conclusión: el anclaje real es posible. No se usa ningún proxy de terceros.

## 3. Cambios realizados

| Archivo | Cambio |
|---|---|
| `supabase/functions/analyze-website/urlSafety.ts` | Reescrito: política de URL (`checkUrl`), parsers estrictos IPv4/IPv6, política de direcciones públicas, `resolvePublicAddresses` fail-closed con timeout, códigos `SafeFetchError`. Eliminados `fetchPublic`, `resolvesPublicly` y `denoResolve` |
| `supabase/functions/analyze-website/safeHttp.ts` | Nuevo: cliente HTTP/1.1 sobre IP anclada con redirecciones, límites y cancelación (dependencias inyectables para pruebas) |
| `supabase/functions/analyze-website/handler.ts` | Nuevo: lógica de análisis (misma forma de respuesta y mismos extractores que v0.7.3) y mensajes de error |
| `supabase/functions/analyze-website/index.ts` | Reducido a punto de entrada: OPTIONS → `requirePremium` (primero, sin cambios) → `analyze()` con dependencias Deno reales |
| `supabase/functions/analyze-website/entitlement.ts` | **Sin cambios** (sigue idéntico a las copias de weekly-content y business-improvement) |
| `src/features/billing/__tests__/premiumAccess.test.ts` | U3 adaptado a la nueva API; el marcador de G2 `fetchPublic(` pasa a `analyze(` |
| `src/features/reality-engine/__tests__/analyzeWebsiteSsrf.test.ts` | Nuevo: los 33 casos obligatorios (+ variantes) |

## 4. Política de URL y direcciones

**URL (`checkUrl`):**
- Máximo 2048 caracteres. Rechaza espacios, caracteres de control y `\`.
- Solo `http:` y `https:`.
- La autoridad debe existir en el texto original (`http:///x` se rechaza).
- `@` en la autoridad o usuario/contraseña → bloqueado.
- Cualquier puerto explícito, **incluido el puerto por defecto** (`:443`, `:80`), → bloqueado. Se comprueba la autoridad original porque el parser WHATWG elimina el puerto por defecto. Este hueco lo detectaron las pruebas.
- IP literal en cualquier forma (decimal, hex, octal, abreviada, percent-encoded, IPv6 entre corchetes) → bloqueado. Una vez normalizada por el parser, cualquier IPv4 cae en el detector.
- Hostname: máximo 253 caracteres, sin punto final, sin `%`, al menos 2 etiquetas válidas, TLD no numérico.
- Bloqueados: `localhost` y `metadata`; `metadata.google.internal`; y los sufijos `.localhost`, `.local`, `.internal`, `.intranet`, `.lan`, `.home`, `.corp`, `.private`, `.home.arpa`, `.arpa`, `.test`, `.example`, `.invalid`, `.onion` y `.localdomain`.
- Se elimina el fragmento (`#`).

**Direcciones resueltas:**
- **IPv4:** se rechazan 0/8, 10/8, 100.64/10, 127/8, 169.254/16 (incluye 169.254.169.254), 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24 y ≥224 (multicast y reservadas).
- **IPv6:** solo se acepta unicast global 2000::/3. Se excluyen 2001:db8::/32, 2001:0000–01ff (Teredo/IETF), 2002::/16 (6to4) y 3ff0::/12. Por construcción quedan fuera ::1, ::, fc00::/7, fe80::/10, ff00::/8, ::ffff:0:0/96 (IPv4 mapeada), 64:ff9b::/96 (NAT64) y fd00:ec2::254.

**DNS (`resolvePublicAddresses`):**
- A y AAAA se resuelven en paralelo, cada una con un timeout de 3 s.
- Un error que no sea "no existe" o un timeout dan `dns_failed`.
- Sin direcciones: `dns_empty`.
- Si cualquier dirección no es pública (incluidas las respuestas mixtas): `blocked`.
- Solo se intenta conectar a IPs de esa misma lista validada (máximo 2 intentos, IPv4 primero).

## 5. Redirecciones, límites y recursos secundarios

| Control | Valor |
|---|---|
| Redirecciones | Manuales, máx. 3 (301/302/303/307/308). En cada salto: `checkUrl` y DNS nuevos. Bucle detectado con un conjunto de URLs visitadas. Un esquema distinto de http/https queda bloqueado |
| Cabeceras enviadas | Solo `Host`, `User-Agent: LocalSEOHub-Analyzer/1.0`, `Accept`, `Accept-Encoding: identity` y `Connection: close`. Nunca cookies, `Authorization` ni cabeceras del usuario |
| Timeout por petición | 10 s página, 5 s robots/sitemap (cubre DNS, conexión, TLS, escritura y lectura) |
| Deadline total | 25 s para toda la cadena (página + redirecciones + secundarios) |
| Tamaño | Página 2 MB (si se supera, error `too_large`). robots 64 KB y sitemap 256 KB (se truncan sin error) |
| Aplicación del límite | Se comprueba `Content-Length` antes de leer y además se cuentan los bytes reales del flujo (sin Content-Length, chunked o hasta cierre). Cabeceras: máx. 16 KB y 100 líneas. Content-Length duplicado y contradictorio → rechazado |
| Cancelación | Una promesa de abortado compite con cada operación de E/S. Al superar un límite, al vencer el timeout o ante un error se cierran todos los sockets abiertos (incluidos los que se establecen tarde) |
| Recursos secundarios | Exactamente 2 (`/robots.txt` y `/sitemap.xml`) del mismo origen. Sus redirecciones solo se permiten al mismo sitio (con o sin `www.`). No se siguen `Sitemap:` de robots ni `<loc>` de sitemaps o índices: cero descargas derivadas |

## 6. Errores y compatibilidad con el frontend

- **Éxito:** sin cambios. Se mantienen los mismos 13 campos de `WebsiteAnalysis`; "HTTP 4xx/5xx" se sigue añadiendo a `errors` con `confidence: "estimated"`.
- **URL ausente:** sin cambios: 400 `{error:"URL requerida"}`.
- **Fallos:** la respuesta es `{error: <mensaje claro en español>, code}` con estado 4xx/5xx. El frontend (`invokeEdge`) ya lee `json.error` de las respuestas no-2xx y lo muestra como error de la fuente. No hace falta tocar el frontend.

| code | HTTP | Mensaje (resumen) |
|---|---|---|
| invalid_url | 400 | La dirección no es válida… |
| blocked | 400 | No se puede analizar por motivos de seguridad… |
| dns_failed / dns_empty | 422 | No hemos podido comprobar ese dominio / no existe… |
| connect_failed / tls_failed / bad_response | 502 | La web no responde / certificado no válido / respuesta ilegible |
| timeout | 504 | La web tarda demasiado… |
| too_large | 422 | Página demasiado grande (máx. 2 MB) |
| too_many_redirects / redirect_loop / off_site_redirect | 422 | Redirige demasiadas veces / en bucle / a otro sitio |

**Cambio deliberado de comportamiento.** Antes, un fallo de conexión o un bloqueo devolvía 200 con un análisis vacío (`statusCode: 0`, `errors:["URL no permitida"]`). La fuente quedaba entonces "conectada" y el bloqueo parecía un problema SEO. La especificación pide no confundir ambos casos, así que ahora la fuente queda en estado de error con el mensaje adecuado.

Las respuestas nunca incluyen IPs, cabeceras, trazas ni detalles de infraestructura. El log interno solo registra `err.message`.

## 7. Despliegue y verificación en vivo

- Desplegada **solo** `analyze-website` (la herramienta informó "Deployed 1 Edge Function(s): analyze-website"). El resto de funciones no cambió (el diff de `supabase/` contra A2.1 solo afecta a `analyze-website/`).
- OPTIONS → 200.
- POST sin token → 401 de la plataforma.
- POST con clave pública → 401 `{"error":"unauthorized"}`. Esta respuesta la genera nuestro propio guard, así que confirma que el nuevo código arranca en Deno y que `requirePremium` sigue ejecutándose antes de leer el cuerpo.
- **Limitación honesta:** no se ha ejecutado un análisis completo en producción contra un dominio público, porque exige una sesión Premium. Crear un usuario o trial de prueba tocaría signup/trials, que están fuera de alcance. El camino de red (resolveDns, connect a IP, startTls con hostname) se validó con la sonda de la sección 2 usando las mismas APIs. **Recomendación:** que el auditor, con una cuenta Premium real, analice p. ej. `https://example.com` y `https://www.wikipedia.org` desde la pantalla de fuentes.
- No se ha hecho ninguna prueba contra direcciones internas reales.

## 8. Pruebas obligatorias (33)

Archivo `analyzeWebsiteSsrf.test.ts`. DNS, sockets, TLS y flujos son simulados (servidor HTTP falso que sirve bytes reales, con trickle y cuelgue). **Un mock de DNS no demuestra la seguridad de la conexión real.** La garantía real proviene del diseño (connect a la IP validada) y de la sonda.

| # | Caso | Resultado |
|---|---|---|
| 1 | HTTP público válido (conecta a IP validada, puerto 80, sin cookies/auth) | OK |
| 2 | HTTPS válido (puerto 443, TLS con hostname original) | OK |
| 3 | Esquemas file/ftp/gopher/javascript/data/ws + URLs malformadas/ambiguas | OK |
| 4 | Credenciales (`user:pw@`, `user@`, `host@10.0.0.1`, `:@`) | OK |
| 5 | Puertos explícitos, incluidos `:80`/`:443` | OK (corregido durante A2.2) |
| 6 | localhost y nombres internos | OK |
| 7 | IPv4 privada en todas las codificaciones | OK |
| 8 | IPv6 privada (literal y respuesta DNS: ULA, link-local, mapeada, NAT64, 6to4) | OK |
| 9 | Loopback (literal y DNS), sin conexión | OK |
| 10 | Link-local | OK |
| 11 | Metadatos cloud (IP, nombres, AWS IPv6) | OK |
| 12 | DNS sin respuesta → `dns_empty` | OK |
| 13 | DNS con error / resolver colgado → `dns_failed` | OK |
| 14 | DNS mixto público + privado → bloqueado, sin conexión | OK |
| 15 | Rebinding simulado: una sola resolución y socket a la IP validada | OK |
| 16 | Redirección pública con nuevo DNS | OK |
| 17 | Redirección a IP privada | OK |
| 18 | Redirección a hostname interno / que resuelve en privado | OK |
| 19 | Bucle | OK |
| 20 | Más de 3 redirecciones y redirección a `file:` | OK |
| 21 | Content-Length excesivo (rechazo previo, socket cerrado) | OK |
| 22 | Sin Content-Length y cuerpo excesivo | OK |
| 23 | Chunked que supera el límite y truncado controlado | OK |
| 24 | Timeout por petición (socket cerrado) | OK |
| 25 | Timeout total (reloj simulado y deadline real) | OK |
| 26 | robots.txt malicioso (redirección a metadatos / sitemap fuera de sitio) | OK |
| 27 | sitemap.xml malicioso (enorme, con `<loc>` internos y `Sitemap:` en robots): truncado, sin seguir | OK |
| 28 | Sitemap index anidado: sin recursión (3 peticiones en total) | OK |
| 29 | Cancelación: socket cerrado y menos de 4 KB servidos de 200 KB | OK |
| 30 | Compatibilidad: misma forma de éxito; errores `{error, code}` sin filtraciones; bloqueo ≠ hallazgo SEO | OK |
| 31 | Sin IA ni `fetch` global (espía + análisis estático) | OK |
| 32 | Sin regresiones en las tres mejoras (entitlement idéntico, sin dependencias cruzadas; suites completas en verde) | OK |
| 33 | Las 14 funciones retiradas, byte a byte iguales al stub de A2.1 (SHA-256 `4d44f063…d71d`) | OK |

## 9. Calidad comparada con la línea base

| Comprobación | Línea base | A2.2 |
|---|---|---|
| Vitest | 423 | **486 pasan / 0 fallan** (+63 nuevas) |
| TypeScript (`tsc -p tsconfig.app.json`) | 20 errores | 20 (ninguno en archivos de A2.2) |
| ESLint | 23 errores / 7 avisos | 23 / 7 |
| Build | OK | OK |
| Advisors de seguridad Supabase | 8 | 8 (los mismos; ninguno nuevo) |

## 10. Comparación de archivos protegidos

`diff -r` contra la línea base `localseohub-fixA21.zip`:
- `src/`: solo cambia `premiumAccess.test.ts` y se añade `analyzeWebsiteSsrf.test.ts`.
- `supabase/`: solo cambian `analyze-website/index.ts` y `urlSafety.ts`, y se añaden `handler.ts` y `safeHttp.ts`.
- `config.toml`, `package.json`, entitlement, Stripe, GBP, signup, weekly-content, business-improvement y las 14 retiradas: idénticos.

## 11. Riesgos residuales

1. **Verificación en vivo con sesión Premium pendiente** (sección 7).
2. **HTTP/1.1 propio:** se limita a GET con `Connection: close`, sin compresión ni keep-alive. Las webs que exijan HTTP/2 puro (raro) o respondan con `Content-Encoding` pese a `identity` pueden analizarse peor. Esto no afecta a la seguridad.
3. **Validación TLS:** depende de `Deno.startTls` (almacén de confianza del runtime). Un certificado inválido da `tls_failed` y nunca se degrada a HTTP.
4. **Lista de sufijos internos:** es estática. Un nombre interno con TLD público que resuelva en privado sigue bloqueado por la comprobación de IP, que es la defensa principal.
5. **Hallazgos de A1 no abordados aquí** (por instrucción): los advisors existentes (`get_funnel_stats` con search_path mutable, funciones SECURITY DEFINER ejecutables por `authenticated`, protección de contraseñas filtradas) y el resto de hallazgos siguen pendientes para fases posteriores.

## 12. Entrega

- ZIP limpio: `localseohub-fixA22.zip` (sin `.env`, `node_modules`, `dist`, `.git` ni ZIPs anidados).
- Informe: este archivo.
- **No se ha iniciado A2.3** ni se han tocado otros hallazgos de A1. LocalSEOHub no se declara listo para lanzamiento. Se espera auditoría y aprobación expresa.
