# A2.4.3 — AI Business Advisor — Informe

## A. Alcance
Solo se activa **AI Business Advisor** (`/herramientas/advisor`). Maps, Twin, Radar, GEO y Voice siguen desactivados. A2.4.1, A2.4.2-0 y A2.4.2 no se modifican, salvo los límites mensuales que pide la especificación (§2) y los tests que fijaban "solo SEO activo".

## B. Decisión sobre la función legacy `generate-business-audit`
- Sigue devolviendo HTTP 410. No se cambian ni su código ni su bloque en `config.toml` (`verify_jwt = true`).
- Se crea la función nueva **`business-advisor-v2`**. No se reutiliza la legacy porque se retiró en A2.4.1 por coste sin control, sin ledger y sin aislamiento por usuario. Reactivarla rompería la garantía de las 14 funciones retiradas.

## C. Migración `a243_business_advisor_limits` (aditiva)
- Solo hace `CREATE OR REPLACE FUNCTION public.ai_usage_cap(text)`. Los valores quedan así:
  - weekly-content 25
  - business-improvement 20
  - seo-generator 20
  - business-advisor 15
  - voice-simulator 0
  - global 80
  - cualquier otra función 0
- `REVOKE ALL ... FROM PUBLIC, anon`.
- No crea tablas, no borra datos y no pone contadores a cero.
- `reserve_ai_usage` y `my_ai_usage` ya leían los límites de esta función. `reserve_weekly_content` y `reserve_business_improvement` delegan en `reserve_ai_usage(v_token, p_user_id, '<fn>')` (migración a231), así que heredan los nuevos límites sin más cambios.

## D. Usuarios ya por encima de los nuevos límites
No se reinicia nada y ningún valor pasa a negativo. Por ejemplo, quien ya tenga 30 de weekly-content este mes recibe `fn_limit` hasta el mes siguiente. El test 26 lo cubre con un usuario de 30+30+20 = 80, que queda bloqueado por `global_limit`.

## E. Global 80
25 + 20 + 20 + 15 = 80. El límite global no cambia. Por eso `global_limit` solo se alcanza en usuarios que ya superaban los límites antiguos.

## F. Configuración de la función
- `[functions.business-advisor-v2] verify_jwt = true`.
- Desplegada con la herramienta MCP.
- Consta de `index.ts`, `handler.ts`, `logic.ts` y `entitlement.ts`. Este último es idéntico byte a byte al de las demás funciones (test G1).

## G. Autenticación y entitlement
- `requirePremium(req, "business-advisor-v2")` es lo primero que se ejecuta, antes de leer el body, los secretos, el cliente admin o `fetch`.
- El usuario se obtiene del JWT verificado.
- Si el body trae cualquier clave distinta de `businessId`, `requestId`, `question`, `history` o `lang` (por ejemplo `user_id`), se responde 422.
- La clave service role solo existe en el servidor.

## H. Flujo del handler
1. Si el body supera 16 KB, responde 413. Si no es JSON válido, 422.
2. `parseInput` comprueba que los UUID son válidos, que la pregunta no está vacía y tiene como máximo 500 caracteres, y que el historial tiene como máximo 6 mensajes, de 1500 caracteres cada uno y 6000 en total. Si algo falla, responde 422.
3. `loadContext(userId, businessId)`. Si no hay negocio del usuario, 404. Si falta tanto el nombre como la categoría, 422 `profile_incomplete`. En ambos casos no se reserva nada.
4. `reserve_ai_usage(requestId, user, 'business-advisor')`:
   - `fn_limit` devuelve 429 `advisor_limit`;
   - `global_limit` devuelve 429;
   - `invalid` devuelve 409 `duplicate_request`;
   - cualquier otro resultado, 503.
5. Se llama al modelo como máximo 2 veces. La salida se parsea, se valida y se aplican las reglas anti-invención.
6. Si todo es correcto, se liquida como `completed` y responde 200 `{status:'answered', answer}`.
7. Si el proveedor falla sin facturar, se liquida como `released` y responde 502 `ai_unavailable`, sin coste para el usuario.
8. Si el modelo respondió pero la respuesta se rechazó, se liquida como `consumed` y responde 502 `generation_failed`. Esto limita el gasto ante prompts abusivos, igual que en SEO.
9. Nunca se genera una respuesta de relleno.

## I. Idempotencia
- Cada envío lleva un `requestId` nuevo, generado con `crypto.randomUUID()` en el navegador.
- Un `requestId` repetido devuelve `invalid`, que se traduce en 409, y nunca se factura dos veces.
- Verificado en la base de datos real: primera reserva `reserved`, segunda `invalid`.

## J. Aislamiento entre usuarios
- Todas las consultas filtran por `user_id` del JWT, y `businesses` también por `id`.
- `settle_ai_usage` exige que el usuario sea el dueño de la reserva. En la base de datos real, liquidar la reserva de otro usuario devuelve `false`.

## K. Contexto de negocio (sin datos inventados)
- No existen datos persistidos de análisis web ni de GBP. `gbp-sync` devuelve los datos en vivo y `connected_sources.metadata` está vacío. El Advisor usa solo lo que realmente existe:
  - Perfil de `businesses`: nombre, categoría, ciudad, web, teléfono, horario, público, servicios y objetivos, traducidos a texto.
  - `first_value_progress.manual_context`.
  - Títulos y estado de `business_actions`: abiertas (PENDING / IN_PROGRESS) y completadas.
  - Tipos de fuente con estado `connected`.
- `not_available` incluye los campos vacíos del perfil y siempre: customer_count, bookings, revenue, website_traffic, google_ranking, maps_position, calls, conversions, review_count, rating, competitors, historical_trends y campaign_results.
- Funciona sin GBP (test 27).

## L. Prompt
- Se construye solo en el servidor. El system prompt es fijo y bilingüe.
- Los datos van en `<business_facts>`, `<conversation_history>` y `<user_question>`, todos marcados como NO CONFIABLES.
- Se eliminan `<` y `>` de todos los datos, así que la inyección no puede cerrar etiquetas (test 35).
- Al modelo nunca llegan user_id, business_id, email, datos de facturación, Stripe ni tokens (test de privacidad).

## M. Validación de la salida
La salida se rechaza en estos casos:
- **Formato:** el JSON tiene una estructura incorrecta, la respuesta mide menos de 20 o más de 1200 caracteres, o el texto supera 600 palabras. Si hay más de 5 acciones, se recortan a 5.
- **Promesas de resultados:** garantías ("garantiz", "conseguirás más clientes", "aumentarán tus ventas", "you will…") o promesas de puesto en Google ("número 1", "primera posición").
- **Datos inventados sobre el negocio:**
  - posiciones de ranking que el usuario no ha dado;
  - competidores con nombre;
  - cifras de clientes, reservas o reseñas que no estén declaradas y sean mayores que 10;
  - valoraciones (x/5, estrellas), importes o porcentajes no declarados.
- **Datos de contacto:** emails, URLs ajenas al dominio del negocio y teléfonos distintos del registrado.
- **Herramientas desactivadas:** menciones a Radar, GEO, Maps scanner, Twin o Voice.

## N. Modelo
- `gpt-4o-mini` con `LocalSEO_KEY` en el servidor.
- `temperature` 0.5, `max_tokens` 1100, `response_format: json_object`, timeout de 25 s.

## O. Página `/herramientas/advisor`
- Está dentro del mismo AppGuard y AppShellV2, con el mismo lenguaje visual que `/herramientas/seo`.
- En escritorio tiene un panel izquierdo (contexto, consumo y sugerencias) y uno principal (conversación y entrada). En móvil queda en una sola columna.
- Bloque de contexto: Negocio, Actividad, Ciudad y Objetivo principal, más el enlace "Completar Mi negocio" si falta algún dato.
- Estado vacío: "¿En qué puedo ayudarte hoy?" con las 4 preguntas rápidas. Elegir una solo rellena el campo y no consume nada.
- Respuesta estructurada: respuesta directa, primer paso, acciones prioritarias, por qué puede ayudar, siguiente paso, nota de datos, aviso de IA y botón Copiar (gratis).
- Contador "Consultas este mes: X / 15", leído de `my_ai_usage`. Se refresca después de cada envío.
- La conversación vive solo en el navegador. Al servidor se envían como máximo los 6 últimos mensajes, recortados. No hay tablas nuevas.
- Errores con mensajes amigables para 401, 403, 404, 409, 422, 429 y 5xx, sin trazas técnicas.

## P. Hub de herramientas
- Advisor y SEO aparecen como "Disponible" / "Abrir herramienta".
- Las otras 5 siguen como "Aún no disponible" / "En preparación".

## Q. Funciones retiradas
Las 14 funciones legacy siguen con 410 (test 38).

## R. Verificación real en la base de datos (DO blocks con rollback mediante RAISE, sin persistir nada)
- 16 reservas de advisor: 15 `reserved` y 1 `fn_limit`.
- Release: `true`, y después vuelve a admitir una reserva.
- voice-simulator: `disabled`.
- Límites: adv 15, seo 20, impr 20, weekly 25, voice 0, global 80, cualquier otra 0.
- Idempotencia: la primera reserva da `reserved` y la segunda con el mismo id `invalid`.
- Liquidar la reserva de otro usuario devuelve `false`. Liquidar la propia devuelve `true`.

## S. Concurrencia
- `reserve_ai_usage` bloquea la fila del mes con `SELECT … FOR UPDATE` y usa `ON CONFLICT (id) DO NOTHING`. Esto viene de A2.3.1 y no cambia.
- Test 25: 20 peticiones en paralelo contra el ledger simulado dan 15 respuestas 200, 5 respuestas 429 y 15 llamadas al modelo.
- Test 26: los usuarios que ya están en el global de 80 quedan bloqueados.
- **Pendiente:** una prueba de concurrencia real con peticiones HTTP simultáneas contra la función desplegada. Necesita un JWT de una cuenta premium de prueba. Pasos manuales:
  ```
  for i in $(seq 1 20); do
    curl -s -X POST "$SUPABASE_URL/functions/v1/business-advisor-v2" \
      -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
      -d "{\"businessId\":\"$BIZ\",\"requestId\":\"$(uuidgen)\",\"question\":\"¿Qué debería mejorar primero?\"}" &
  done; wait
  ```
  Resultado esperado: como máximo 15 respuestas 200 en el mes y el resto 429 `advisor_limit`.

## T. Prueba funcional real (§29)
**No realizada.** El entorno de trabajo no tiene sesión de usuario premium ni JWT, y no se crean cuentas ni suscripciones de prueba para no tocar Stripe. Pasos manuales con el ejemplo de Gopik.Digital:
1. Entrar con una cuenta premium cuyo negocio sea Gopik.Digital (Marbella, agencia digital).
2. Abrir `/herramientas/advisor` y comprobar que el contador no cambia.
3. Preguntar "¿Qué debería mejorar primero?". Comprobar que la respuesta tiene 2–5 acciones, no trae cifras inventadas y el contador sube 1.
4. Repreguntar "¿Y qué publico esta semana?". Comprobar que tiene en cuenta la respuesta anterior y el contador sube 1.
5. Copiar la respuesta y comprobar que el contador no cambia.

No se afirma que esto se haya probado.

## U. Tests (§28)
Nuevo `a243BusinessAdvisor.test.ts` con 25 casos que cubren los puntos 1–41:
- ruta y AppGuard;
- hub (Advisor y SEO activos, 5 bloqueados);
- 410 de las funciones legacy;
- autenticación y entitlement;
- `user_id` del cliente rechazado;
- límites 15/20/25/20/0/80;
- abrir, escribir, preguntas rápidas y copiar no consumen;
- reserva y consumo;
- release;
- idempotencia;
- aislamiento A/B;
- 422 vacío y largo;
- 429 advisor y global con peticiones paralelas;
- funcionamiento sin GBP;
- `not_available`;
- métricas, valoraciones, importes, URLs, teléfonos y competidores inventados;
- garantías y herramientas desactivadas;
- prompt en servidor e inyección;
- privacidad;
- ni `LocalSEO_KEY` ni OpenAI en el frontend;
- historial limitado;
- repregunta consume 1;
- no regresión en SEO, weekly-content y business-improvement.

Tests existentes actualizados porque fijaban "solo SEO activo" o la lista de funciones que llaman a la IA:
- `a23CostControl` T30;
- `a2420Ledger` 14 y 17;
- `a242SeoGenerator` 3;
- `toolsHub` 5;
- `premiumAccess` (PREMIUM_FUNCTIONS y ENTITLEMENT_COPIES ahora incluyen `business-advisor-v2`).

## V. Comprobaciones (§31)
| Comprobación | Base A2.4.2 | A2.4.3 | Nuevos |
|---|---|---|---|
| vitest | 680 | **706/706** | +26 tests, 0 fallos |
| tsc (`tsconfig.app.json`) | 20 errores | 20 errores | 0 (todos preexistentes, p. ej. `useAuth` sin usar en App.tsx) |
| ESLint | 30 problemas | 30 problemas | 0 (los ficheros nuevos están limpios) |
| build | OK | OK | — |

## W. Seguridad
- Security advisors: 8 avisos, todos preexistentes (edge_rate_limits / stripe_customer_repairs sin políticas, search_path de get_funnel_stats, billing_status / current_user_has_premium / start_trial, leaked password protection).
- Ninguno es nuevo ni tiene que ver con el Advisor.
- No se crean tablas ni políticas.

## X. Riesgos conocidos y siguientes pasos
- La validación anti-invención es heurística. Admite números ≤ 10 junto a palabras de métrica (por ejemplo "pide reseñas a 3 clientes"), lo que puede dejar pasar una cifra pequeña inventada.
- Cuando se descarta una respuesta ya facturada, el usuario pierde 1 consulta. Es una decisión deliberada para limitar el gasto.
- Quedan pendientes la prueba E2E real (T) y la concurrencia HTTP real (S).
- A2.4.4 no se inicia hasta recibir autorización.

## Y. Archivos
- **Base de datos:** `supabase/migrations/20261014214444_a243_business_advisor_limits.sql`
- **Función:** `supabase/functions/business-advisor-v2/{index,handler,logic,entitlement}.ts` y `supabase/config.toml`
- **Frontend:** `src/features/business-advisor/{AdvisorPage.tsx,repository.ts,copy.ts}`, `src/App.tsx` y `src/features/tools/catalog.ts`
- **Tests:** `src/features/billing/__tests__/a243BusinessAdvisor.test.ts`, además de los actualizados en U

## Z. Confirmaciones
- Only AI Business Advisor was activated in A2.4.3.
- SEO Generator remains operational.
- Legacy generate-business-audit remains retired with HTTP 410.
- Global AI limit remains 80.
- Voice Simulator remains disabled.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.
