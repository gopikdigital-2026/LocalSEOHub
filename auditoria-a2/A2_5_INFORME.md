# A2.5 — Integrations & Real End-to-End Validation — Informe

## A. Resumen ejecutivo

- **Alcance:** solo integración previa al lanzamiento. Sin herramientas nuevas, sin rediseño y sin funciones comerciales nuevas.
- **Hallazgos:** 14 en total.
  - 3 P2, corregidos: A25-001, A25-002 y A25-003.
  - 2 P3 pequeños y seguros, corregidos: A25-004 y A25-005.
  - 8 P4/Info, documentados.
  - 1 P3/P4, documentado.
  - 0 P0 y 0 P1.
- **Hallazgo principal (A25-001):** un cliente podía falsificar el estado "verificado con Google" escribiendo `status` y `metadata` en `connected_sources`.
  - Ahora el dato verificado vive en columnas que solo escribe el servidor (`verified_profile`, `verified_at`).
  - Solo las escribe `gbp-sync` con service role.
- **GBP readiness:** **PARTIAL**. La ruta de código es segura, pero `gbp-sync` no refresca tokens y no hay E2E real con Google.
- **Tests:** 1045 en verde. Son 982 de base más 63 nuevos en `src/features/billing/__tests__/a25Integration.test.ts`, que cubren los ítems 1–60 del §41.
- **Calidad:**
  - TypeScript: 20 errores (= base).
  - ESLint: 30 problemas (= base).
  - Build: OK.
  - 0 problemas nuevos.
- **AUTHENTICATED PRODUCTION E2E = NOT TESTED.**
- **REAL GBP E2E = NOT TESTED.**
- **A2.6:** no iniciado. Se espera auditoría y autorización expresa.

All seven LocalSEOHub tools remain available.

## B. Inventario de integraciones (Tabla 1)

| Integración | Componente | Dirección | Auth | Escribe en BD | Estado |
|---|---|---|---|---|---|
| Supabase Auth | cliente + edge functions | bidireccional | JWT | auth.users | Producción |
| Mi negocio | `businesses` (cliente) | escritura cliente | RLS dueño | businesses | Producción |
| Google OAuth | `gbp-oauth-start`, `gbp-oauth-callback` | servidor ↔ Google | JWT + state | connected_sources (tokens, servidor) | PARTIAL |
| Google locations | `gbp-list-locations` | servidor → Google | JWT | refresca tokens | PARTIAL |
| Google sync | `gbp-sync` | servidor → Google | JWT + propiedad | `verified_profile`, `verified_at` (servidor) | PARTIAL |
| Website analysis | `analyze-website` | servidor → web pública | JWT + Premium | nada | Producción |
| Competitor Radar | `competitor-radar-v2` | servidor → web pública + IA | JWT + Premium | ledger | Producción |
| IA (OpenAI) | seo-generator-v2, business-advisor-v2, weekly-content, business-improvement, voice-simulator-v2, competitor-radar-v2 | servidor → OpenAI | JWT + Premium + ledger | ai_usage_* | Producción |
| Stripe | funciones de billing existentes | sin cambios | — | — | Sin tocar |
| Fuentes | `connected_sources`, `source_sync_events` | cliente + servidor | RLS dueño + grants por columna | sí | Producción |

## C. Data lineage (Tabla 2)

| Dato | Origen | Escritor | Lectores |
|---|---|---|---|
| name, category, city, phone, schedule, services, target_audience, goals | Usuario (onboarding / Mi negocio) | cliente → `businesses` | las 7 herramientas, prompts IA en servidor |
| website | Usuario o conexión de web en Fuentes | cliente → `businesses.website` | Maps, GEO, Twin, Radar, analyze-website |
| Perfil Google (rating, reseñas, categorías, horario) | Google Business Profile API | `gbp-sync` (service role) → `verified_profile` | Maps, GEO, Twin, Radar (vía `normalizeGbp`), motor de acciones |
| Fecha de sync Google | servidor (`syncedAt`) | `gbp-sync` → `verified_at` | sourceStatus, Fuentes, "datos de hace X" |
| Estado de conexión | cliente / OAuth callback | cliente y servidor → `status`, `metadata` | Fuentes (solo "en progreso", nunca "verificado") |
| Tokens OAuth | Google | `gbp-oauth-callback` / `gbp-list-locations` | solo edge functions |
| Uso de IA | ledger | RPCs service role | contadores de UI (lectura) |

## D. Fuente de verdad por campo (Tabla 3)

| Campo | Fuente de verdad | Nivel de confianza |
|---|---|---|
| Datos de negocio manuales | `businesses` | DECLARADO |
| Señales de la web | `analyze-website` (efímero) | DETECTADO |
| Perfil Google | `connected_sources.verified_profile` + `verified_at` | VERIFICADO |
| Google sin sync de servidor | — | NO COMPROBADO |
| Premium | `current_user_has_premium()` / `requirePremium` (servidor) | autoritativo |
| Límites IA | `ai_usage_cap()` + ledger | autoritativo |

## E. Modelo de confianza

- **DECLARADO:** datos introducidos por el usuario. Se muestran como "declarado" y nunca como verificado (test 2).
- **DETECTADO:** lo que se extrae de la web pública en el momento del análisis.
- **VERIFICADO:** solo existe si `verified_at` no es nulo. Esa columna solo la escribe `gbp-sync` (tests 1, 3, 4, 4b, 4c y 58).
- **NO COMPROBADO:** sin GBP, o con GBP falsificado. Los checks de Google quedan como no comprobados (tests 4 y 5).

Manual business data is never represented as Google-verified data.

Google-verified data requires a trusted server-side source.

## F. Arquitectura GBP

1. `gbp-oauth-start`:
   - comprueba el JWT;
   - genera un `state` aleatorio y lo guarda en `metadata.oauth_state`;
   - devuelve la URL de Google.
2. `gbp-oauth-callback`:
   - empareja el `state`;
   - intercambia el código por tokens con el secreto del servidor;
   - guarda los tokens (columnas `*_encrypted`, sin grant de lectura para el cliente);
   - redirige a Fuentes.
3. `gbp-list-locations`:
   - lista las fichas;
   - refresca el token si ha caducado.
4. `gbp-sync`, que en orden:
   - valida los IDs;
   - comprueba el JWT;
   - comprueba que el negocio pertenece al usuario;
   - descarga la ficha y las reseñas;
   - persiste `verified_profile` y `verified_at` con service role, filtrando por `user_id`, `business_id` y `source_type`.
5. Cliente:
   - `selectGBPLocation` solo escribe `status`, `last_error` y `metadata.locationName`;
   - el dato verificado lo lee de las columnas de servidor.

## G. GBP readiness

**Clasificación: PARTIAL.**

- Bien:
  - OAuth con `state`.
  - Tokens fuera del alcance del cliente.
  - Sync que valida la propiedad.
  - Verificado solo desde el servidor.
  - Errores genéricos.
- Pendiente (P4):
  - Sin refresco de token en `gbp-sync`. Ahora devuelve "La sesion de Google ha caducado. Vuelve a conectar…" (A25-006).
  - El `state` no caduca en el servidor (A25-007).
  - Tokens en texto plano protegidos por grants (A25-008).
  - Desconectar no revoca el token en Google (A25-009).
- Sin E2E real con una cuenta de Google: REAL GBP E2E = NOT TESTED.

## H. Seguridad GBP

- **Falsificación de "verificado" (A25-001, P2):** CORREGIDO.
  - Columnas nuevas `verified_profile` y `verified_at`.
  - `authenticated` solo tiene SELECT sobre ellas.
  - Las 4 herramientas, Fuentes y el motor de acciones leen solo esas columnas.
  - Test 4: la fila `FORGED_ROW` (SIMULATED) no produce "verificado" en ningún consumidor.
- **Sync con perfil vacío como éxito (A25-002, P2):** CORREGIDO. Si falla la descarga de la ficha, se devuelve `success:false` y no se persiste nada (test 8c/8d).
- **IDs sin validar en rutas de Google (A25-003):** CORREGIDO. Se aplican regex estrictas, se rechaza `locations/default` y se devuelve 400 (test 8c).
- **Fugas de errores en OAuth (A25-004 y A25-005):** CORREGIDO. Mensajes genéricos al usuario; en logs solo nombre o código de error (tests 59 y 60).
- **Smoke en vivo (sin sesión):**
  - `gbp-sync` sin auth → 401; con anon key → 401 "Usuario no autenticado".
  - `gbp-oauth-start` sin auth → 401; con anon key → 401.
  - `gbp-oauth-callback` sin parámetros → 302 a Fuentes.

## I. Flujo de web

- `analyze-website`:
  - requiere Premium;
  - no escribe en BD;
  - timeouts de 25 s y 10 s;
  - límite de 2 MB (test 10).
- Sin web, todas las herramientas funcionan y piden añadirla (test 9).
- A25-013 (P3/P4): conectar una web en Fuentes sobrescribe `businesses.website`. Es intencional (un solo campo de web), pero no avisa. Documentado.

LocalSEOHub continues to operate when website analysis is unavailable.

## J. Seguridad web (SSRF)

- `safeHttp.ts` y `urlSafety.ts` son idénticos byte a byte en `analyze-website` y `competitor-radar-v2` (test 12).
- Se rechazan:
  - localhost;
  - IPs privadas;
  - direcciones de metadatos;
  - esquemas que no son http(s) (test 11).

No new arbitrary URL fetch pipeline was introduced.

Existing SSRF protections remain active.

## K. Perfiles (Tabla 4: datos mínimos por herramienta)

Fixtures FIXTURE FULL, PARTIAL, MINIMAL y EMPTY probados en Maps, GEO y Twin, con y sin GBP (tests 13–16b). En las herramientas IA se comprueban por la validación de servidor.

| Herramienta | Mínimo para funcionar | Con EMPTY |
|---|---|---|
| Maps Scanner | ninguno (motor local) | sin puntuación inventada (16b) |
| GEO Audit | ninguno | checks pendientes |
| Digital Twin | ninguno | estado vacío honesto |
| Competitor Radar | nombre + ciudad/categoría | pide completar |
| SEO Generator | nombre + categoría/servicio | error de validación claro |
| Business Advisor | nombre | error de validación claro |
| Voice Simulator | nombre | error de validación claro |

## L. Consistencia entre herramientas

- Ciudad, servicios, teléfono y horario llegan a todas las herramientas desde el mismo registro de negocio (tests 17–20).
- Si el dato manual y el de GBP no coinciden, se marca el conflicto y nunca se sobrescribe en silencio (test 21).
- La frescura que se muestra es la hora del servidor (`verified_at`), no la del reloj del cliente (tests 7 y 22).

## M. Contexto de IA

- Los prompts se construyen en el servidor a partir del negocio del usuario autenticado.
- Se comprueba la propiedad del negocio (test 23). El cliente no puede inyectar el negocio de otro usuario.

## N. Ledger

- Las RPCs `reserve`, `settle` y `reconcile`:
  - son SECURITY DEFINER;
  - solo las puede ejecutar service_role (comprobado en la BD: `anon` y `authenticated` no pueden);
  - usan `FOR UPDATE`;
  - las reservas caducan a los 10 min.
- Tests 27–36 (MOCK ledger):
  - límites;
  - éxito, fallo y liberación;
  - límite por función y global;
  - idempotencia;
  - concurrencia;
  - settle/release entre usuarios rechazados.

AI usage global limit remains 80.

Voice Simulator limit remains 10.

SEO Generator limit remains 18.

AI Business Advisor limit remains 12.

Weekly Content limit remains 22.

Business Improvement limit remains 18.

No AI usage counters were reset.

## O. Premium (Tabla 5)

| Herramienta | Gate frontend | Gate backend | Coherente |
|---|---|---|---|
| Maps Scanner | `hasPremium` | — (motor local) | Sí |
| GEO Audit | `hasPremium` | `analyze-website` requirePremium | Sí |
| Digital Twin | `hasPremium` | — (motor local) | Sí |
| Competitor Radar | `hasPremium` | requirePremium | Sí |
| Voice Simulator | `hasPremium` | requirePremium | Sí |
| SEO Generator | sin pre-gate; muestra `premium_required` + enlace a /facturacion | requirePremium | Sí (A25-012, P3/P4) |
| Business Advisor | ídem | requirePremium | Sí (A25-012, P3/P4) |
| Weekly Content / Business Improvement | existente | requirePremium | Sí |

`requirePremium` es idéntico byte a byte en las 7 funciones (tests 41 y 42). No falta ningún gate de backend (no hay P1).

## P. Auth

- Todas las funciones v2 y GBP exigen JWT. El dueño se obtiene del JWT, nunca de un parámetro (test 25).
- A25-014: la protección contra contraseñas filtradas está desactivada. Es configuración externa de Auth y no se ha modificado.

## Q. Onboarding

- `FirstValueFlow` guarda los datos limpios, los objetivos y `onboarding_completed` (test 43).
- Al editar en Mi negocio se sustituye el negocio en memoria por la fila guardada, así que las herramientas se vuelven a renderizar (test 44).

## R. Fuentes

- Una fuente GBP conectada pero sin sync de servidor aparece "en progreso". Solo aparece "verificado" con `verified_at`.
- Las reseñas que dependen de un GBP sin verificar aparecen "pendiente" (fix061).
- Desconectar borra la fila y las herramientas vuelven a "no conectado" (test 45). Es una acción del propio usuario sobre su fila.
- A25-010 (P4): los eventos de sync y la metadata de web/manual siguen siendo editables por el cliente. Están etiquetados como DETECTADO/DECLARADO, no como verificados.

## S. Aislamiento A vs B

- `businesses` y `connected_sources` solo son accesibles para su dueño en las 4 operaciones (test 24).
- Las funciones de IA rechazan el negocio de otro usuario (test 23).
- `gbp-sync` rechaza un `businessId` ajeno y filtra la escritura por `user_id` (test 25).
- El ledger rechaza settle/release entre usuarios (tests 35 y 36).

Cross-user business access is blocked.

Cross-user connected-source access is blocked.

**Límite de negocios (A25-011, Info):** no existe el límite de 5 negocios. El índice único `businesses_user_id_key` impone 1 negocio por usuario, lo que es más estricto y seguro frente a carreras (test 26).

## T. RLS

- Las 27 tablas públicas tienen RLS activado.
- `edge_rate_limits` y `stripe_customer_repairs` tienen RLS sin políticas. Son solo de servicio, así que es correcto.
- Las columnas verificadas solo tienen grant de SELECT para el cliente (test 58).
- Advisors (A25-014, P4):
  - `get_funnel_stats` tiene `search_path` mutable;
  - `billing_status`, `current_user_has_premium` y `start_trial` son RPCs definer que puede llamar `authenticated`, de forma intencional.

## U. Degradación (casos GBP A–H)

| Caso | Situación | Resultado |
|---|---|---|
| A | Sin GBP | Herramientas operativas, checks Google no comprobados |
| B | Perfil verificado vacío | Sin datos Google, sin crash |
| C | Sync antiguo | Se conserva la fecha original |
| D | Error | Sin dato verificado |
| E | Token caducado | `success:false` + "vuelve a conectar" |
| F | Desconectado | "no conectado" |
| G | Configuración parcial (solo nombre) | Evalúa sin crash |
| H | Estado falsificado por cliente | NO COMPROBADO (SIMULATED) |

Tests 5–8e. Los fallos de IA (tests 37–40) liberan la reserva y devuelven errores seguros.

LocalSEOHub continues to operate when Google Business Profile is unavailable.

## V. Observabilidad

- Los logs de funciones GBP tienen prefijo `[función]` e incluyen solo códigos de estado o de error.
- No se registran tokens, perfiles, emails ni mensajes de excepción (test 60).
- El error boundary global está en `src/main.tsx`.

## W. Secretos

- No hay secretos en `src/` ni en `dist/` (tests 48 y 49).
- Las credenciales de Google y OpenAI se leen solo de `Deno.env` en el servidor.
- No faltan secretos.

No Stripe configuration was modified.

No Google OAuth or Google Cloud configuration was modified.

## X. Tests y E2E

### Tabla 7: resultados

| Comprobación | Resultado |
|---|---|
| Vitest | 1045 / 1045 en verde (37 ficheros) |
| Nuevos A2.5 | 63 checks (`a25Integration.test.ts`) |
| Tests actualizados | a244, a245, a246, a247 (fixtures a columnas verificadas), fix061, a2420Ledger (test 17) |
| TypeScript | 20 (= base) |
| ESLint | 30 (= base) |
| Build | OK |
| Smoke en vivo sin sesión | gbp-sync 401, gbp-oauth-start 401, callback 302 |

### Tabla 8: estado E2E real

| E2E | Estado |
|---|---|
| AUTHENTICATED PRODUCTION E2E | NOT TESTED |
| REAL GBP E2E | NOT TESTED |
| Llamadas en vivo sin autenticar | TESTED |
| Fixtures de perfil | FIXTURE |
| Ledger | MOCK |
| Ataque de estado falsificado | SIMULATED |

## Y. Hallazgos (Tabla 6)

| ID | SEVERITY | AREA | DESCRIPTION | EVIDENCE | FIX | TEST | STATUS |
|---|---|---|---|---|---|---|---|
| A25-001 | P2 | GBP trust | El cliente podía falsificar `status` + `metadata` y obtener "verificado" | Consumidores leían `metadata`/`last_sync_at`, escribibles por el cliente | Columnas `verified_profile`/`verified_at` solo de servidor; consumidores migrados | 1–4c, 58 | FIXED |
| A25-002 | P2 | GBP sync | `success:true` con perfil vacío si fallaba la ficha | `gbp-sync` ignoraba `!ok` | `success:false` + mensaje claro; sin persistir | 8c, 8d | FIXED |
| A25-003 | P2 | GBP sync | IDs sin validar en rutas de Google | Concatenación directa | Regex estrictas, 400 | 8c | FIXED |
| A25-004 | P3 | GBP OAuth | `gbp-oauth-start` devolvía `err.message` | catch | Mensaje genérico; log `err.name` | 59, 60 | FIXED |
| A25-005 | P3 | GBP OAuth | El callback reenviaba el error crudo de Google | redirect | Mensaje fijo | 59, 60 | FIXED |
| A25-006 | P4 | GBP sync | Sin refresco de token en sync | código | Mensaje "vuelve a conectar" | 8 | DOCUMENTED |
| A25-007 | P4 | GBP OAuth | `state` sin caducidad en servidor | callback | — (el cliente limpia a los 10 min) | — | DOCUMENTED |
| A25-008 | P4 | GBP tokens | Tokens en texto plano, protegidos por grants | esquema | — | 58 | DOCUMENTED |
| A25-009 | P4 | Fuentes | Desconectar no revoca el token en Google | `disconnectSource` | — | 45 | DOCUMENTED |
| A25-010 | P4 | Fuentes | Eventos de sync y metadata web/manual editables por el cliente | grants | Etiquetados DETECTADO/DECLARADO | 2 | DOCUMENTED |
| A25-011 | Info | Límite de negocios | No hay límite de 5; se impone 1 por usuario | índice único | — | 26 | DOCUMENTED |
| A25-012 | P3/P4 | Premium UI | SEO y Advisor sin pre-gate en frontend | páginas | Backend aplica el gate; la UI muestra `premium_required` | 41, 42 | DOCUMENTED |
| A25-013 | P3/P4 | Website | Conectar una web sobrescribe `businesses.website` | `SourceManager` | — | 9 | DOCUMENTED |
| A25-014 | P4 | Supabase advisors | Contraseñas filtradas desactivado; `search_path` mutable; RPCs definer intencionales | advisors | — (configuración externa) | — | DOCUMENTED |

## Z. Riesgos y condiciones de parada

- **Riesgos abiertos:**
  - E2E autenticado y GBP real no probados.
  - Sin refresco de token en sync.
  - Tokens en texto plano.
  - Sin revocación al desconectar.
  - Protección de contraseñas filtradas desactivada.
- **Condiciones de parada:** ninguna se ha activado.
  - No hubo P0 que requiriera cambio de arquitectura.
  - La migración es solo aditiva.
  - No se cambió OAuth ni Stripe.
  - No faltan secretos.
- **Cambios en la BD:** una migración aditiva, `20261016095839_a25_gbp_server_verified_profile.sql` (2 columnas nullable + GRANT SELECT). Las únicas filas GBP existentes eran 2 desconectadas, sin impacto.
- **Funciones desplegadas:** `gbp-sync`, `gbp-oauth-start` y `gbp-oauth-callback`.

All fourteen retired legacy functions remain retired.

No businesses were deleted.

No connected sources were deleted.

**A2.6 no iniciado. Se espera auditoría y autorización expresa.**
