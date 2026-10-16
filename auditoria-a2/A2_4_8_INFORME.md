# A2.4.8 — Voice Simulator (Customer Conversation & Response Training) — Informe

## A. Resumen

Voice Simulator is a text-based AI conversation training tool in A2.4.8.

- **Clasificación:** PARTIAL (MVP de texto, un único intercambio, sin "Continuar simulación").
- **Ruta:** `/herramientas/voice` dentro de AppGuard. Las 7 herramientas del hub quedan disponibles.
- **Backend:** nueva Edge Function `voice-simulator-v2` (desplegada) con:
  - auth y Premium (`requirePremium`);
  - propiedad del negocio y validación de entrada;
  - reserva en el ledger, prompt construido en servidor y gpt-4o-mini;
  - validación de la salida, settlement/release y errores seguros.
- **Legacy:** `generate-voice-script` no se ha modificado y sigue devolviendo 410.
- **Ledger redistribuido:** 22 / 18 / 18 / 12 / 10, global 80. Verificado en la base de datos en producción.
- **Tests:** 982 en verde (base 944 + 37 nuevos en `a248VoiceSimulator.test.ts` + 1 en `premiumAccess`).
- **Calidad:** TypeScript 20 errores (= base), ESLint 30 problemas (= base), build OK. 0 problemas nuevos.
- **E2E autenticado en producción:** NOT TESTED. Sí se comprobó la llamada no autenticada (sección X).
- **A2.5:** no iniciado. Se espera auditoría y autorización expresa.

## B. Legacy

- `supabase/functions/generate-voice-script/index.ts`: stub 410 `{"error":"gone"}` con CORS. No se ha tocado.
- Comprobación en producción (POST sin auth y con anon key) → **410** `{"error":"gone"}`.
- El frontend no referencia `generate-voice-script` (test 3-4).

Legacy generate-voice-script remains retired with HTTP 410.

## C. Clasificación

**PARTIAL.**

Implementado:
- 10 escenarios, incluido uno personalizado de ≤800 caracteres;
- un intercambio completo con los bloques CLIENTE, RESPUESTA RECOMENDADA, POR QUÉ FUNCIONA, CONSEJO y datos usados;
- "Generar otra respuesta", que consume 1 uso.

No implementado, por decisión:
- **"Continuar simulación" (multi-turno).** Requiere enviar historial, que es contenido no confiable y crece, y cada turno consume un uso. Con un tope de 10 usos al mes, un diálogo de varios turnos agotaría el cupo en 2–3 sesiones. Aumentaría la superficie de inyección y el coste. Se pospone hasta auditar el MVP.

## D. Definición

- Simulador de conversaciones de **texto** para formación del dueño del negocio. Genera:
  - un mensaje realista de cliente;
  - una respuesta recomendada prudente;
  - de 1 a 4 motivos;
  - un consejo;
  - la lista de datos del negocio usados.
- No es un chatbot autónomo: no responde a clientes reales ni se publica en ningún canal.
- No es un CRM.
- El nombre comercial "Voice Simulator" se mantiene.

## E. Text-only

- Voice Simulator does not make or receive real phone calls.
- Voice Simulator does not record microphone audio.
- Voice Simulator does not clone voices.
- No hay STT, TTS, Twilio, telefonía, WhatsApp, SMS ni CRM.
- El test 65 verifica estáticamente que ni el frontend ni el servidor usan:
  - `getUserMedia`, `MediaRecorder`, `speechSynthesis`, `SpeechRecognition` o `Audio`;
  - twilio, whatsapp, sms, tts, stt, whisper, elevenlabs o crm.

## F. Arquitectura

```
VoiceSimulatorPage (AppGuard + gate Premium en UI)
  └─ repository.runSimulation → functions.invoke('voice-simulator-v2', {businessId, scenario, customText, lang, requestId})
voice-simulator-v2/index.ts
  1. requirePremium (401/403/429/503) ANTES de leer el body, la clave o la BD
  2. POST, content-length ≤ 8192 → 413
  3. simulate(userId de la sesión, rawBody, deps)
handler.simulate
  parseInput (claves permitidas) → 422
  loadBusiness(id AND user_id) → 404
  hasEnoughContext (name o category) → 422 profile_incomplete
  reserve_ai_usage('voice-simulator') → 429 voice_limit / 429 global_limit / 409 duplicate_request / 503
  buildMessages → callModel (máx. 2 llamadas) → parseModelOutput → violations
  settle: completed | consumed (facturado pero rechazado) | released (fallo del proveedor)
```

- `logic.ts` es puro y testeable.
- `entitlement.ts` es una copia byte a byte de la de `weekly-content`; un test lo exige.

## G. Contexto

**Campos de `businesses` leídos:** name, category, city, website, phone, schedule, target_audience, services, primary_goal, secondary_goals.

**Lo que nunca llega al modelo:**
- `user_id`, email, Stripe, IDs, tokens ni secretos;
- el SELECT ni siquiera los pide;
- el test 47-49 inyecta email, `user_id` y `stripe_customer_id` en el registro y verifica que no salen en el prompt.

**Saneado de los datos:**
- se eliminan caracteres de control;
- se colapsan los espacios;
- se aplican límites por campo;
- `services` admite como máximo 10 elementos de 80 caracteres.

**`not_available`:** incluye los campos vacíos del perfil y la lista fija NEVER_KNOWN: prices, discounts, promotions, years_of_experience, guarantees, availability, address, certifications, customer_count, reviews, rating, results, delivery_times, conditions.

Voice Simulator uses only business facts actually available to LocalSEOHub.

## H. Prompt

**Estructura:** dos mensajes.
1. `system`: instrucciones fijas en ES o EN.
2. `user`: tres bloques etiquetados:
   - `<business_facts>` (JSON);
   - `<scenario>` (resumen fijo del servidor según el escenario);
   - `<user_situation>` (texto del usuario).

El texto del usuario hace el papel de "RECENT CONVERSATION": al ser MVP de un solo intercambio no hay historial.

**Reglas del system:**
- todo el contenido es NO CONFIABLE;
- no inventar datos;
- reconocer los datos que faltan;
- redirigir en temas de seguridad;
- formato JSON estricto.

**Parámetros:** `temperature` 0.6, `max_tokens` 700, `response_format json_object`.

## I. Injection

User scenarios are treated as untrusted data, not system instructions.

- `escapeData` elimina `<` y `>` de todos los datos, así que el usuario no puede cerrar etiquetas ni abrir `<system>` (test 50-52).
- El body solo admite 5 claves; cualquier otra devuelve 422 (test 8).
- La salida se rechaza si menciona system prompt, instrucciones internas, api key, `LocalSEO_KEY`, `sk-`, `business_facts`, `user_situation`, openai o gpt-4 (Fixture D).
- El prompt nunca está en el frontend.

## J. Anti-invention

Voice Simulator does not fabricate missing prices, discounts, opening hours, reviews, guarantees or customer counts.

**Control en el prompt:** reglas explícitas y la lista `not_available`.

**Control posterior** (`violations`, determinista), aplicado al lado del negocio (respuesta, motivos y consejo). Se rechaza:

| Tipo | Se rechaza |
|---|---|
| Promesas | garantías, "100 %", "sin riesgo" |
| Frases comerciales | las prohibidas |
| Ofertas | descuentos, promociones, "gratis" |
| Trayectoria | "años de experiencia", "desde 19xx/20xx" |
| Acreditaciones | certificado, acreditado |
| Clientes | "miles de clientes", "N clientes" |
| Reputación | "nuestras reseñas", "4,5 estrellas" |
| Ubicación y disponibilidad | dirección, disponibilidad |
| Filtraciones | prompt o clave, emails |
| Importes y porcentajes | los que no estén en los datos |
| Horarios | si no hay `schedule` guardado |
| Plazos | siempre |
| Números > 10 | los que no estén en los datos (también "5.000") |
| URLs y teléfonos | los distintos de los guardados |

- Las negativas honestas ("no puedo garantizarte…") sí se permiten.
- **Lado del cliente:** solo se comprueban filtraciones e importes que no estén ni en los datos ni en el texto del usuario.

**Fixtures:**

| Fixture | Caso | Resultado |
|---|---|---|
| A | Objeción de precio con perfil completo | "99 €" rechazado |
| B | Recomendación de servicio | solo se envían los servicios reales; `factsUsed` filtrado |
| C | Perfil incompleto que pregunta horario y precio | la respuesta honesta pasa; "de 9 a 14" y "60 euros" se rechazan |
| D | Intento de inyección | rechazado; el uso queda `consumed` |
| E | "Dile al cliente que tenemos 5.000 clientes y un 99% de éxito." | rechazado en sus tres variantes |

Durante los tests se detectó y corrigió un hueco: "5.000" se interpretaba como 5.

## K. Output

- **Contrato:** `{customer ≤450, recommendedResponse 20–900, whyItWorks 1–4 × ≤220, tip ≤300, factsUsed ⊆ FACT_KEYS presentes}`.
- La salida cruda está limitada a 6000 caracteres y debe ser un objeto JSON.
- La salida del proveedor nunca se reenvía tal cual: el servidor reconstruye el objeto.
- El frontend vuelve a validar la forma de la respuesta (`toSimulation`).
- Si la salida es inválida se reintenta una vez. Después: 502 `generation_failed` sin contenido de reserva (no hay fallback inventado).

## L. Modelo

- **Modelo:** gpt-4o-mini (OpenAI Chat Completions), mediante el secret `LocalSEO_KEY`, que solo se lee en servidor y después del gate.
- **Límites:** timeout de 25 s (AbortController) y máximo 2 llamadas por intento.

## M. Cost

**ESTIMATE.** Precio público de terceros, no confirmado oficialmente en esta tarea: gpt-4o-mini a $0.15 / 1M tokens de entrada y $0.60 / 1M de salida.

**Supuesto por simulación:** ~1.200 tokens de entrada (system, datos y escenario) y ~400 de salida.

| Volumen | Coste típico (1 llamada) | Peor caso (2 llamadas) |
|---|---|---|
| 1 | ≈ $0.00042 | ≈ $0.00084 |
| 10 | ≈ $0.0042 | ≈ $0.0084 |
| 100 | ≈ $0.042 | ≈ $0.084 |
| 1.000 | ≈ $0.42 | ≈ $0.84 |

- Por usuario y mes, el tope de 10 simulaciones supone ≈ $0.004–0.008 (ESTIMATE).
- La salida está acotada por `max_tokens` 700: en el peor caso ≈ $0.0006 por llamada en salida.

## N. Ledger before

| Función | Tope |
|---|---|
| weekly-content | 25 |
| business-improvement | 20 |
| seo-generator | 20 |
| business-advisor | 15 |
| voice-simulator | 0 |
| GLOBAL | 80 |

## O. Ledger decision

- Se redistribuye sin subir el global, para dar 10 usos a Voice.
- Antes de aplicar se comprobó que ningún usuario superaba los nuevos topes (seo máx. 3, advisor máx. 2).
- La migración no modifica contadores ni filas: solo `CREATE OR REPLACE FUNCTION public.ai_usage_cap`.
- Se aplica `REVOKE ALL … FROM PUBLIC, anon`.

## P. Ledger after

| Función | Tope |
|---|---|
| weekly-content | 22 |
| business-improvement | 18 |
| seo-generator | 18 |
| business-advisor | 12 |
| voice-simulator | 10 |
| GLOBAL | 80 |
| función desconocida | 0 |

- Suma por función = 80.
- Verificado con SQL en producción después del despliegue.

Global AI usage limit remains 80.

## Q. Reservation

Voice Simulator uses the hardened AI usage reservation and settlement system.

| Caso | Coste |
|---|---|
| Generación real válida | 1 (`completed`) |
| Error previo al proveedor (413/422/404/profile_incomplete/límite/duplicado) | 0, sin reserva |
| Fallo del proveedor (429/timeout/error/sin clave) | `released` → 0 |
| Salida facturada pero rechazada | `consumed` → 1, para limitar abusos |
| `requestId` repetido | 409 `duplicate_request`, sin segundo cobro (idempotente) |
| "Generar otra respuesta" | `requestId` nuevo → 1 uso nuevo |

- 15 peticiones en paralelo dan exactamente 10 éxitos y 5 respuestas 429 `voice_limit`.
- Las reservas caducan a los 10 minutos (ledger A2.3.1).

## R. Auth

- `verify_jwt = true` y `requirePremium` responde 401 / 403 / 429 / 503 antes de leer el body.
- El `userId` sale siempre de la sesión; si el cliente envía `user_id` o `userId`, se responde 422.
- El negocio se busca por `id` y `user_id`; uno ajeno devuelve 404 sin reservar.
- La UI añade un gate Premium (`useBilling`) como capa visual; la autoridad es el servidor.
- **Producción:** sin auth → 401; con anon key → 401 `unauthorized`.

## S. Privacy

- Aviso en la UI: "No introduzcas datos personales sensibles de clientes."
- No se persisten escenarios ni simulaciones: no hay insert/upsert/update ni localStorage (test 66). La UI muestra la nota "no se guarda".
- El prompt no lleva identificadores, email ni Stripe.
- Los logs del servidor solo registran el mensaje de error interno, nunca el body ni el prompt.
- **Analytics:** no existe un patrón interno de eventos para las herramientas de IA (`v2Analytics` cubre recomendaciones, onboarding y fuentes), así que **no se emite ningún evento**.

## T. Safety

- El system prompt indica que amenazas, acoso, discriminación, fraude, suplantación y datos sensibles no se reproducen: el cliente simulado será genérico y la respuesta profesional, calmada y respetuosa.
- La validación posterior impide promesas, garantías y filtraciones.

## U. UI

- **Cabecera:** "Voice Simulator", badge "Simulación con IA" y subtítulo "Practica conversaciones con clientes y prepara mejores respuestas."
- **Panel izquierdo:**
  - 10 escenarios con icono;
  - textarea (máx. 800, contador) con el aviso de privacidad;
  - 3 ejemplos rápidos que solo rellenan el campo, sin llamar a la IA;
  - aviso de perfil incompleto con enlace a Mi negocio;
  - "Simulaciones IA X / 10 utilizadas";
  - botón Generar con protección contra doble clic.
- **Panel derecho:**
  - disclaimer literal "Esta conversación es una simulación generada por IA…";
  - estado vacío "Practica una situación con un cliente." / "Selecciona un escenario o describe una situación concreta.";
  - skeleton de carga;
  - tarjeta de resultado con CLIENTE (burbuja con borde discontinuo para no parecer un chat real), RESPUESTA RECOMENDADA, POR QUÉ FUNCIONA, CONSEJO, datos usados y botón copiar;
  - "Generar otra respuesta" con la nota "Cada nueva simulación consume 1 uso.".
- **Errores:** cada código tiene su texto en ES y EN. No hay mensajes técnicos.
- **Copy prohibido** ausente: "respuesta perfecta", "garantiza la venta", "convierte al cliente", "cerrará la venta".

## V. Files created

- `supabase/migrations/20261016091512_a248_voice_simulator_limits.sql`
- `supabase/functions/voice-simulator-v2/index.ts`
- `supabase/functions/voice-simulator-v2/handler.ts`
- `supabase/functions/voice-simulator-v2/logic.ts`
- `supabase/functions/voice-simulator-v2/entitlement.ts` (copia idéntica)
- `src/features/voice-simulator/VoiceSimulatorPage.tsx`
- `src/features/voice-simulator/copy.ts`
- `src/features/voice-simulator/repository.ts`
- `src/features/billing/__tests__/a248VoiceSimulator.test.ts`
- `auditoria-a2/A2_4_8_INFORME.md`

## W. Files modified

**Código:**
- `supabase/config.toml`: `[functions.voice-simulator-v2] verify_jwt = true`.
- `src/features/tools/catalog.ts`: voice ACTIVE, enabled, ruta `/herramientas/voice`.
- `src/App.tsx`: ruta lazy dentro de AppGuard.

**Tests de regresión**, ajustados porque Voice pasa a estar habilitado: a23CostControl, a2420Ledger, a242SeoGenerator, a243BusinessAdvisor, a244MapsScanner, a245GeoAudit, a246DigitalTwin, a247CompetitorRadar, toolsHub, premiumAccess.

**Sin cambios:** Stripe, OAuth/GBP, signup, SMTP, Pixel, Clarity y los motores de Radar, Twin, GEO, Maps, SEO y Advisor.

## X. Tests/fixtures/E2E

**`a248VoiceSimulator.test.ts`:** 37 casos que cubren los puntos 1–71 y los fixtures A–E:
- ruta y hub; legacy 410; orden de auth y Premium;
- rechazo de `user_id`; aislamiento A/B;
- escenarios; texto personalizado; body grande o malformado; perfil incompleto;
- reserva → modelo → completed; idempotencia; regenerar;
- tope 10 en paralelo; global 80; release en fallos del proveedor; consumed en salida inválida;
- errores sin filtraciones; topes de la migración;
- contexto y privacidad; arquitectura del prompt; modelo y clave;
- contrato de salida; anti-invención; copy prohibido;
- seguridad; text-only; sin persistencia; textos de la UI; ejemplos sin IA;
- frontend (requestId, mapeo de errores, uso);
- regresión de las demás herramientas.

**Suite completa:** 36 ficheros, 982 tests, todos en verde.

**E2E:**
- `voice-simulator-v2` sin auth → 401.
- `voice-simulator-v2` con anon key → 401 `{"error":"unauthorized"}`.
- `generate-voice-script` → 410 `{"error":"gone"}`.
- Topes del ledger en producción: 22 / 18 / 18 / 12 / 10 / 80, y función desconocida = 0.
- **AUTHENTICATED PRODUCTION E2E = NOT TESTED.** No hay credenciales de una cuenta Premium de prueba legítima, y no se crean cuentas ni se suplanta a usuarios.

## Y. Build/TS/ESLint

| Métrica | Base | Ahora |
|---|---|---|
| Tests | 944 | 982 (todos pasan) |
| TypeScript (`tsc -p tsconfig.app.json`) | 20 | 20 |
| ESLint | 30 | 30 (0 en los ficheros nuevos) |
| `npm run build` | OK | OK |

Durante la verificación aparecieron 10 errores TS en la página (tipo de los iconos) y se corrigieron con `LucideIcon`.

## Z. Riesgos

1. **Servicios inventados.** El filtro determinista no detecta nombres de servicio inventados en texto libre; solo el prompt y `factsUsed` lo mitigan. Riesgo residual bajo-medio.
2. **Falsos positivos.** Algunas respuestas legítimas pueden rechazarse (p. ej. "3 clientes" o plazos), lo que da 502 `generation_failed` y consume 1 uso. Hay que vigilar la tasa en producción.
3. **Uso facturado ante salidas rechazadas.** Consume a propósito, para frenar abusos; el usuario puede percibirlo como coste sin resultado.
4. **Advisor no puede mencionar Voice.** Su regex NEVER bloquea "simulador de voz" / "voice simulator", así que el Advisor no puede recomendar Voice. Advisor se dejó intacto a propósito; ajustarlo requiere autorización.
5. **MVP de un intercambio.** No hay "Continuar simulación" (sección C).
6. **Coste.** Basado en precios de terceros (ESTIMATE).
7. **E2E autenticado** pendiente.
8. **Topes por herramienta reducidos** en las otras 4 herramientas (−3/−2/−2/−3), dentro del global 80.

**Confirmaciones:**
- Competitor Radar remains operational.
- AI Digital Twin remains operational.
- GEO Audit remains operational.
- Maps Profile Scanner remains operational.
- SEO Generator remains operational.
- AI Business Advisor remains operational.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.

**A2.5 NO iniciado. Se espera auditoría y autorización expresa.**
