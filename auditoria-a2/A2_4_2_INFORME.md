# A2.4.2 — SEO GENERATOR (FIRST PRODUCTION TOOL) — INFORME

## A. Alcance
Solo se activa el Generador SEO. Las otras 6 herramientas (Maps, Twin, Radar, GEO, Advisor, Voice) siguen en "Aún no disponible / En preparación". No se ha avanzado a A2.4.3.

## B. Decisión sobre la función legacy `generate-seo`
- `generate-seo` sigue como stub 410, `verify_jwt = true` sin cambios; no se ha redeployado (el deploy de esta fase solo publicó `seo-generator-v2`).
- No se ha copiado código histórico. Se crea una función nueva y versionada: **`seo-generator-v2`**. Motivo: el nombre legacy queda "quemado" (clientes antiguos/caches pueden seguir llamándolo y deben recibir 410), y el nuevo contrato (ledger, entitlement, validación) es incompatible con el histórico.
- El nombre interno de ledger es `seo-generator` (columna `seo_generator_used`, ya creada en A2.4.2-0). El slug de la Edge Function (`seo-generator-v2`) y el nombre de ledger son distintos a propósito; el nombre de ledger está fijado en el servidor (`LEDGER_FUNCTION`), nunca lo envía el cliente.

## C. Migración `a242_seo_generator_limits` (aditiva)
- Nueva `ai_usage_cap(text)` (IMMUTABLE, `search_path` fijo): fuente única de límites — weekly-content 30, business-improvement 30, seo-generator 20, business-advisor 0, voice-simulator 0, `global` 80.
- `reserve_ai_usage` reemplazada (CREATE OR REPLACE) leyendo de `ai_usage_cap`; misma lógica, locks, idempotencia y payload. Rechaza explícitamente `p_function = 'global'`.
- Nueva `my_ai_usage()` — **SECURITY INVOKER**, filtra `auth.uid()`, además sigue aplicando RLS `select_own_ai_usage`. Devuelve used/limit por herramienta y global para el contador.
- Grants: `reserve_ai_usage` solo service_role (re-REVOKE de PUBLIC/anon/authenticated). `ai_usage_cap` y `my_ai_usage` → authenticated + service_role, nunca anon (verificado: `has_function_privilege('anon', my_ai_usage) = false`).
- Sin DROP/DELETE/TRUNCATE ni reseteos de contadores; reservas existentes intactas.

## D. Usuarios ya por encima de los nuevos límites
Con `v_fn_used >= v_fn_cap` un usuario con, p. ej., 35 usos de weekly-content recibe `fn_limit` y el contador queda en 35 (no negativo, no se recorta). Verificado en BD (`over35=fn_limit/35`). Se desbloquea al cambiar de mes UTC.

## E. Nota sobre global 80
30 + 30 + 20 = 80, así que con advisor/voice en 0 el global solo se alcanza cuando los tres caps individuales están llenos (y entonces gana `fn_limit`). El tope global sigue aplicándose en código y se verificó con una fila con usos residuales (`seo@global80=global_limit g=80`). Queda como red de seguridad para cuando se activen advisor/voice.

## F. Contador legacy de business-improvement
`business_improvement_usage` (`< 40`) y la constante `MONTHLY_REQUESTS = 40` siguen existiendo (no tocados, regla §19). El tope efectivo ahora es 30 porque `reserve_business_improvement` llama primero a `reserve_ai_usage`. Recomendación para una fase posterior: alinear o retirar ese contador secundario.

## G. Edge Function `seo-generator-v2`
Archivos: `index.ts`, `handler.ts`, `logic.ts`, `entitlement.ts` (copia byte-idéntica, comprobada por G1). `config.toml`: `[functions.seo-generator-v2] verify_jwt = true`. Desplegada.

Orden en `index.ts`: OPTIONS → `requirePremium(req, "seo-generator-v2")` → método → límite de tamaño → lectura del body → secretos/cliente admin. El userId sale solo del JWT verificado.

## H. Flujo del handler
1. Body > 4096 bytes → 413 `payload_too_large`; JSON inválido → 422.
2. `parseInput`: solo claves permitidas (`businessId, requestId, format, topic, lang`); cualquier otra (p. ej. `userId`) → 422. UUIDs validados; formato en enum de 4; tema string opcional ≤ 200 caracteres (→ 422 `topic_too_long`); `lang` es|en.
3. Negocio cargado por `id` **y** `user_id` → 404 si no es del usuario.
4. Faltan nombre/actividad/ciudad (o servicio y tema en "Descripción de servicio") → 422 `profile_incomplete` con `missing`.
5. `reserve_ai_usage(requestId, userId, 'seo-generator')`: `fn_limit` → 429 `seo_limit`; `global_limit` → 429 `global_limit`; `invalid` (id repetido) → 409 `duplicate_request`; `disabled` → 503.
6. Hasta 2 llamadas al modelo. Éxito con salida válida y sin afirmaciones inventadas → settle `completed`, 200.
7. Fallo del proveedor (sin respuesta facturada) → settle `released`, 502 `ai_unavailable`.
8. Respuesta facturada pero rechazada por validación → settle `consumed`, 502 `generation_failed` (mismo criterio que weekly-content; evita gasto ilimitado con temas abusivos).
9. Cualquier excepción no controlada → 503 `unavailable` sin stack trace.

## I. Idempotencia
`requestId` (UUID generado en el navegador por clic) es el id de la reserva. Un segundo envío del mismo id no inserta ni incrementa (`ON CONFLICT (id) DO NOTHING; IF NOT FOUND → invalid`). Verificado en BD (`dup=invalid`, contador 2 → no 3). El settle solo actúa sobre reservas `reserved` del mismo usuario (`rel2=false`).

## J. Aislamiento entre usuarios
Settle filtrado por `id AND user_id` (verificado: `crossSettle=false`). El negocio se carga con `user_id` del JWT. `my_ai_usage` usa `auth.uid()` + RLS.

## K. Contexto de negocio
Campos usados: name, category, city, website, phone, schedule, target_audience, services (≤10), primary_goal. Limpieza de caracteres de control, longitud máxima por campo, eliminación de `<`/`>`. Solo se envían al modelo los campos con valor: sin web/teléfono/horario el prompt no los menciona. No depende de GBP ni de fuentes conectadas (no hay datos de fuentes en la tabla `businesses`; se puede añadir más adelante sin cambiar el contrato).

## L. Prompt
- Construido solo en el servidor. El rol es "asistente de marketing local".
- Los datos del negocio y el tema del usuario van en un mensaje aparte, entre `<business_data>` / `<user_topic>`, con la instrucción explícita de tratarlos como datos y de ignorar cualquier orden que contengan.
- Prohíbe inventar premios, años de experiencia, direcciones, precios, promociones, certificaciones, reseñas, valoraciones, estadísticas, horarios, servicios no declarados, resultados del negocio o posiciones en Google; prohíbe prometer posicionamiento, tráfico o clientes; pide no forzar palabras clave.
- Salida JSON estricta: `{title, content, cta, keywords, hashtags}`.

## M. Validación de la salida (anti-invención)
- Siempre rechazados: "número 1", "garantiza…", "primer puesto/primera página", "posición en Google".
- Rechazados salvo que aparezcan en los datos o en el tema: premios, certificaciones, reseñas/valoraciones/estrellas, descuentos/ofertas/promociones, años de experiencia/"desde 19xx", días de la semana (horarios), calles/direcciones.
- Números: cualquier cifra mayor de 10 que no esté en los datos o el tema → rechazo; precios y % siempre deben estar declarados; el teléfono solo si coincide con el declarado.
- Por formato: longitudes mínimas y máximas, título obligatorio en "Texto web" y "Descripción de servicio", hashtags solo en redes sociales (máx. 5), frases clave máx. 6, respuesta bruta máx. 8000 caracteres.

## N. Modelo
`gpt-4o-mini`, OpenAI chat completions, secreto `LocalSEO_KEY`, temperatura 0.7, `max_tokens` 900, `response_format json_object`, timeout de 20 s con AbortController. Solo en el servidor.

## O. Página `/herramientas/seo`
- Dentro de `AppGuard` + `AppShellV2` (requiere sesión).
- Título "Generador SEO"; subtítulo según la especificación.
- Bloque de contexto "Usaremos la información de tu negocio para personalizar el contenido." con Negocio, Actividad y Ciudad. Si falta algo, aviso y botón "Completar en Mi negocio" (`/negocio`), y el botón de generar queda desactivado.
- 4 formatos como tarjetas seleccionables: "Publicación para Google", "Texto web / SEO local", "Publicación para redes sociales", "Descripción de servicio".
- Campo opcional "¿Sobre qué quieres hablar?" con el placeholder exigido, contador y `maxLength` 200 (el servidor también valida).
- Resultado: título sugerido, contenido, CTA, hashtags (solo redes sociales), frases clave y el aviso "Contenido generado con IA. Revísalo antes de publicarlo."
- Acciones: COPIAR (local, gratis) y "Generar otra versión" (nueva petición con un nuevo requestId → consume 1).
- Contador "Generaciones este mes: X / 20" leído de `my_ai_usage()` al abrir la página y después de cada intento, con éxito o con error.
- Mensajes de error claros para 401, 403 (con botón "Ver planes"), 429 de SEO o global, 422, 502 y 503.
- Abrir la página o cambiar el formato/tema no hace llamadas al servidor de IA.

## P. Hub de herramientas
Solo la tarjeta SEO muestra "Disponible" y el CTA "Abrir herramienta" (enlace a `/herramientas/seo`). Las otras 6 siguen igual: "Aún no disponible" y el botón desactivado "En preparación". El catálogo pasa a tipar `enabled` como unión discriminada (`enabled: true` exige `path`).

## Q. Landing
Sin cambios. La demo no está conectada al endpoint y el embudo no se ha tocado.

## R. Verificación real en base de datos (DO blocks con rollback vía RAISE)
Resultado literal: `seo20=reserved/20 seo21=fn_limit B=reserved/1 dup=invalid Bused=2 rel=true afterRelease=1 rel2=false crossSettle=false wk30=reserved/30 wk31=fn_limit bi29=reserved g=79 bi30=reserved g=80 adv=disabled voice=disabled globalName=invalid over35=fn_limit/35`, y en un segundo bloque `seo@global80=global_limit g=80`; `my_ai_usage()` devolvió los usos/límites correctos con JWT simulado y `null` sin usuario. Después: 0 filas en `ai_usage_monthly` y 0 en `ai_usage_reservations` (nada persistido).

## S. Concurrencia
- La concurrencia real no se puede probar desde aquí: el entorno solo permite una sesión SQL, sin dblink ni pg_net, y no tengo un JWT de usuario. La garantía viene del `SELECT … FOR UPDATE` sobre la fila mensual, que serializa las reservas del mismo usuario; además lo comprueba un test.
- El test 18 lanza 30 peticiones en paralelo contra el handler con un ledger simulado: 20 dan 200 y 10 dan 429.
- E2E exacto pendiente de ejecutar, con un usuario premium de prueba con 0 usos SEO este mes:
  ```
  TOKEN=<access_token del usuario>; BIZ=<business id>
  for i in $(seq 1 25); do
    curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPABASE_URL/functions/v1/seo-generator-v2" \
      -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
      -d "{\"businessId\":\"$BIZ\",\"requestId\":\"$(uuidgen)\",\"format\":\"google_post\",\"topic\":\"\",\"lang\":\"es\"}" &
  done; wait
  ```
  Esperado: como máximo 20 respuestas 200 (las 502 por fallo del proveedor se liberan); el resto, 429 `seo_limit`. Después, `seo_generator_used ≤ 20` y ninguna reserva en estado `reserved` pasados 10 minutos. Nota: `authorize_premium_request` limita a 30 peticiones por hora y función, así que 25 entran en una sola ventana.

## T. Prueba funcional real (§21)
**NO realizada.** No tengo credenciales ni sesión de un usuario premium de prueba, y no se debe crear ni modificar cuentas, facturación o datos de usuarios reales para conseguirla. Pasos para hacerla manualmente:
1. Iniciar sesión con una cuenta premium de prueba y poner en Mi negocio: "Peluquería de prueba" / Peluquería / Marbella / servicio "Coloración".
2. Ir a `/herramientas/seo`, elegir "Publicación para Google", escribir el tema "Coloración para otoño" y pulsar Generar.
3. Comprobar: texto coherente; sin precios, años, reseñas, horarios ni promesas de Google; el contador pasa de X a X+1; en BD, `seo_generator_used` +1 y la reserva en `completed`.
4. Error controlado: en un proyecto de staging, quitar temporalmente el secreto, o enviar un `requestId` repetido con curl (→ 409). Comprobar que el contador no cambia y que la reserva queda en `released` o no se crea.

## U. Tests (§20)
Total: **680** (655 anteriores + 25 nuevos en `a242SeoGenerator.test.ts`; varios tests cubren más de un punto numerado). Correspondencia de los 32 puntos:
- 1 → test 1
- 2 → test 2
- 3 → test 3
- 4 y 30 → test "4 & 30"
- 5–6 → test "5-6"
- 7 → test 7
- 8–13 → test de límites + test 8 (la generación 21 recibe 429)
- 11 y 21 → test global
- 14–15 → test "14-15" + test del contador
- 16 y 24 → dos tests de fallo
- 17 → idempotencia
- 18 → concurrencia
- 19 → aislamiento
- 20 → entrada inválida (8 variantes)
- 22–23 → frontend sin IA ni secretos
- 25–27 → copiar, cambiar formato y otra versión
- 28–29 → sin GBP y sin inventar datos
- 31–32 → sin regresiones en weekly-content y business-improvement

Además: límites de payload, salida y timeout; forma de la salida por formato; `profile_incomplete`.

Tests existentes actualizados (justificación: protegían el estado "nada activo" que esta fase cambia a propósito):
- `toolsHub` test 5 → solo `seo` habilitado y las otras 6 desactivadas.
- `a2420Ledger` test 14 → exactamente un `enabled: true`, sigue sin red en el hub.
- `a2420Ledger` test 15 → la regex exige cerrar comillas, para prohibir `seo-generator` exacto sin bloquear `seo-generator-v2`.
- `a2420Ledger` test 17 → la a2420 debe ser una de las dos últimas migraciones.
- `a23CostControl` T30 → la lista de funciones que llaman a la IA incluye `seo-generator-v2`.
- `premiumAccess` → `seo-generator-v2` añadida a `PREMIUM_FUNCTIONS` y a `ENTITLEMENT_COPIES`, y por tanto cubierta por G1/G2.

## V. Comprobaciones (§22)
| Check | Resultado | Nuevos | Preexistentes |
|---|---|---|---|
| vitest | 680/680 OK | 0 fallos | — |
| tsc (`tsconfig.app.json`) | 20 errores | 0 | 20 (App.tsx, landings, LandingPage, AdminDashboard) |
| ESLint | 30 problemas (23 errores, 7 avisos) | 0 (archivos nuevos limpios) | 30 |
| build | OK | — | — |
| Supabase security advisors | 8 avisos | 0 | 8 (mismos de A2.4.2-0) |

## W. Seguridad
- Sin `LocalSEO_KEY`, URL de OpenAI ni RPC del ledger en el frontend.
- El frontend no envía `userId`, y el servidor rechaza esa clave.
- Lo que devuelve el modelo se trata como no confiable: se valida y se muestra como texto plano en React, sin HTML.
- `my_ai_usage` es INVOKER, así que no puede saltarse RLS.
- Las funciones privilegiadas siguen siendo solo de service_role.

## X. Riesgos conocidos y siguientes pasos
- Si falla el settle después de reservar, la reserva caduca a los 10 minutos pero el uso sigue contado; es conservador y no da usos gratis.
- Las salidas rechazadas por validación consumen 1 uso. Con el control de números, el reintento interno debería mantener esto en casos raros; conviene medirlo en producción.
- Los resultados no se guardan (no hay historial); copiar es la vía de uso prevista.
- Pendiente de fases anteriores: AUTH-RESET-001 (URL de redirección `/reset-password` en Supabase y prueba real de email).

## Y. Archivos
- Nuevos:
  - `supabase/functions/seo-generator-v2/{index,handler,logic,entitlement}.ts`
  - `supabase/migrations/20261014200041_a242_seo_generator_limits.sql`
  - `src/features/seo-generator/{repository.ts,copy.ts,SeoGeneratorPage.tsx}`
  - `src/features/billing/__tests__/a242SeoGenerator.test.ts`
  - este informe
- Modificados:
  - `supabase/config.toml` (bloque nuevo)
  - `src/App.tsx` (ruta)
  - `src/features/tools/{catalog.ts,ToolsPage.tsx}`
  - los tests listados en U

## Z. Confirmaciones
- Only SEO Generator was activated.
- Legacy generate-seo remains retired with HTTP 410.
- Global AI limit remains 80.
- Business Advisor remains disabled.
- Voice Simulator remains disabled.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.
