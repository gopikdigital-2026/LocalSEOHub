# A2.4.1 — TOOLS HUB FOUNDATION & SAFE RECOVERY AUDIT

Estado: **COMPLETADO** (ver checklist de la sección T). No se avanza a A2.4.2 sin autorización expresa.

## A. Resumen ejecutivo

Se ha creado la sección autenticada **Herramientas** (`/herramientas`). Usa el mismo guard que el resto de páginas del producto (`AppGuard` + `AppShellV2`).

La página muestra exactamente las 7 herramientas aprobadas:
- con su icono, nombre, descripción, tipo de información y estado;
- con el CTA **deshabilitado** "En preparación";
- sin ejecutar nada.

La auditoría del código histórico confirma que:
- las 6 funciones objetivo (y las 8 restantes retiradas en A2.1) siguen respondiendo **410 Gone**;
- **no queda implementación original en el árbol de trabajo**: solo existe dentro de los ZIP antiguos, que no se han abierto ni restaurado.

Ninguna herramienta es `READY_FOR_SAFE_RECOVERY`. El motivo principal es que el sistema de contabilidad de IA (A2.3/A2.3.1) está cableado a dos funciones (`weekly-content`, `business-improvement`). Cualquier herramienta IA nueva necesita antes una migración que generalice el ledger.

En la landing pública se han corregido tres rótulos que presentaban resultados simulados como detectados o generados por IA. Se han etiquetado como "ejemplo orientativo". No se ha tocado nada más del funnel.

## B. Archivos creados
- `src/features/tools/catalog.ts`: catálogo de las 7 herramientas (copy ES/EN, tipo de dato, estado interno de recuperación, función histórica). El estado interno no se renderiza.
- `src/features/tools/ToolsPage.tsx`: página `/herramientas`.
- `src/features/tools/__tests__/toolsHub.test.ts`: 24 tests.
- `auditoria-a2/A2_4_1_INFORME.md`: este informe.

## C. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | `lazy` import de `ToolsPage`; `<Route path="/herramientas">` dentro del bloque `AppGuard`/`AppShellV2`, justo después de `/plan` |
| `src/app-v2/layouts/AppShellV2.tsx` | Entrada "Herramientas" (icono `Wrench`) tras "Plan". La barra inferior móvil conserva sus 5 destinos originales mediante `BOTTOM_BAR_IDS`; antes era `slice(0, 5)`, que habría desplazado "Fuentes" |
| `src/components/LandingPage.tsx` | Tres rótulos (ver H) |

No se han modificado:
- Edge Functions, `supabase/config.toml`, migraciones, RLS ni la base de datos;
- Stripe, billing, Auth, signup, trial, password reset, OAuth/GBP;
- Pixel ni analytics.

## D. Nueva ruta implementada
- `/herramientas`: requiere sesión y onboarding completo, exactamente igual que `/hoy`, `/plan`, `/informes`, `/negocio`, `/fuentes` y `/facturacion`. No se ha creado ningún guard nuevo.
- Sin sesión, `AppGuard` redirige al login con `returnTo`, que es el comportamiento existente.

## E. Navegación

**Sidebar (escritorio) y menú lateral móvil:** Hoy · Plan · **Herramientas** · Resumen · Mi negocio · Fuentes · Facturación.

**Barra inferior móvil:** sin cambios (Hoy · Plan · Resumen · Mi negocio · Fuentes). Herramientas es accesible desde el menú lateral móvil.

**Página:**
- Cabecera "Herramientas", con el subtítulo y el aviso de transparencia aprobados.
- Rejilla responsive de 1, 2 o 3 columnas.
- Cada tarjeta tiene hover sutil y contiene:
  - icono;
  - nombre;
  - descripción;
  - etiqueta del tipo de información (con icono según sea IA, fuentes, estimación o simulación);
  - insignia "Aún no disponible";
  - botón deshabilitado "En preparación".
- ES/EN mediante `useI18n`.

## F. Inventario de las 7 herramientas

| # | Herramienta | Estado interno | Función histórica | 410 | verify_jwt | Frontend existente |
|---|---|---|---|---|---|---|
| 1 | Generador SEO | REQUIRES_REBUILD | `generate-seo` | Sí | true | Solo demo simulada en la landing |
| 2 | Maps Profile Scanner | PARTIAL | `audit-maps-profile` | Sí | true | Demo simulada en la landing; datos reales GBP y web ya almacenados |
| 3 | AI Digital Twin | NO_IMPLEMENTATION_FOUND | — (no hay función dedicada) | — | — | Solo demo simulada en la landing |
| 4 | Competitor Radar | BLOCKED | `analyze-competitor-url` | Sí | true | Solo demo simulada en la landing |
| 5 | GEO Audit | BLOCKED | `generate-geo-audit` | Sí | **false** | Solo tarjeta de marketing |
| 6 | AI Business Advisor | REQUIRES_REBUILD | `generate-business-audit` (más cercana) | Sí | true | Solo demo simulada en la landing |
| 7 | Voice Simulator | REQUIRES_REBUILD | `generate-voice-script` | Sí | **false** | Solo tarjeta de marketing |

**Elementos comunes a las funciones históricas antes de A2.1** (fuente: `auditoria-a1/C_INVENTARIO_SEGURIDAD.md:78-91`, `auditoria-a2/A2_1_INFORME.md:33-46`):
- premium (`requirePremium`) con 30 peticiones/h;
- modelo `gpt-4o-mini`, secreto `LocalSEO_KEY`;
- **sin `max_tokens` ni límite de entrada** (F-03);
- **ningún uso desde el frontend** (F-09).

**Estado actual de cada función:**
- `index.ts` idéntico de 616 bytes, con `status: 410`;
- sin imports, sin `Deno.env`, sin `fetch` y sin lectura del body;
- la carpeta solo contiene `index.ts`. Los `entitlement.ts` se eliminaron en A2.1.

**Motivos de retirada documentados** (`A_INFORME_PRINCIPAL.md:58-151`, `A2_1_INFORME.md:1-75`):
- F-09: código muerto desplegado.
- F-01: SSRF en `analyze-competitor-url`.
- F-03: coste de IA sin límites.
- F-08: filtrado de errores del proveedor (`errBody`/`err.message`).

**Matriz de puntos A–T por herramienta.** Común a todas, salvo que se indique otra cosa:

| Punto | Situación |
|---|---|
| A. Frontend | Ninguno funcional. La demo de la landing es 100 % simulada (`LandingPage.tsx:287-549`) |
| B. Backend | Stub 410. Original solo en `localseohub-v073.zip` / `localseohub-auditA1.zip` (no abiertos) |
| C. Tablas | Solo `saved_seo_results` documentada (generate-seo). El resto, no documentado |
| D. RPC | Solo `authorize_premium_request`. Sin reservas A2.3 |
| E. Modelo | `gpt-4o-mini` |
| F. Secretos | `LocalSEO_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (solo nombres) |
| G. Autenticación | Bearer, validado en código, incluso con verify_jwt=false |
| H. Autorización | Premium a nivel de usuario. Sin comprobación documentada de pertenencia del negocio |
| I. Premium | Sí (`requirePremium`) |
| J. Rate limit | 30/h por función |
| K. Usage accounting | **No.** Anterior a A2.3 |
| L. Validación de entradas | Mínima. Sin límites de tamaño (la imagen de generate-seo no tenía límite) |
| M. SSRF | **Crítico en Radar (F-01) y GEO** (descargaban URLs arbitrarias). Ninguno en el resto |
| N. Prompt injection | Alto en Radar y GEO (contenido web de terceros enviado al modelo). Medio en el resto (texto del usuario) |
| O. Exposición de datos | Errores del proveedor devueltos al cliente (F-08); contenido de URLs internas reflejado (F-01) |
| P. Dependencias externas | OpenAI; web de terceros (Radar, GEO); Google Business Profile (Maps) |
| Q. Estado actual | 410 Gone, sin lógica |
| R. Retirada en A2.1 | Sí, las 6 (y 8 más) |
| S. Motivo | F-09 + F-03 (todas), F-01 (Radar), fetch tipo SSRF (GEO), F-08 (SEO, Maps y otras) |
| T. Reutilización segura | **No se recomienda restaurar ningún código histórico.** Reutilizar solo los patrones actuales: `business-improvement`/`weekly-content` para IA y `analyze-website` para la descarga de URLs |

## G. Detalle por herramienta

### 1. Generador SEO — REQUIRES_REBUILD
- **Riesgos:** coste (2 llamadas al modelo sin límite, imagen sin límite de tamaño); filtrado de errores.
- **Datos necesarios:** ya existen en `businesses` (`name`, `category`, `city`, `services`, `target_audience`, `primary_goal`).
- **Coste IA:** 1 llamada (`max_tokens` ~500).
- **Estrategia:** nueva función clonando la estructura de `business-improvement`:
  - `requirePremium`;
  - parseo estricto;
  - comprobación de pertenencia del negocio;
  - reserva, modelo y liquidación;
  - errores genéricos.
  - Sin entrada de imagen en la primera versión.
- **Recomendación:** primera herramienta. Es la de menor superficie de ataque (sin fetch) y la que más reaprovecha el contexto existente.

### 2. Maps Profile Scanner — PARTIAL
- **Lo que ya existe:**
  - la sincronización GBP guarda los metadatos reales en `connected_sources.metadata` (`engine.ts:184,196`; `gbp-sync:97`: title, categories, address, phone, website, hours);
  - el análisis web se guarda en `connected_sources.metadata.analysis` (`engine.ts:66`).
- **Riesgos:**
  - dependencia del OAuth GBP, que tiene el hallazgo P1-03 (CSRF de `state`) abierto en AUDIT PRE-LAUNCH-001;
  - verificación de Google para `business.manage`, pendiente externamente;
  - el usuario puede editar `connected_sources.metadata` (F-07), así que el dato GBP no es plenamente fiable mientras no se aísle.
- **Coste IA:** 0. Puede ser una revisión determinista de completitud sin IA.
- **Estrategia:**
  - comprobación de completitud basada en reglas sobre los datos reales;
  - "no disponible" explícito cuando no hay GBP;
  - sin IA en la primera versión.
- **Recomendación:** tras corregir P1-03 y F-07.

### 3. AI Digital Twin — NO_IMPLEMENTATION_FOUND
- No existe ni ha existido una función dedicada. Solo la simulación de la landing (`TwinResult`, l.388-448).
- **Riesgo principal:** la tentación de mostrar una "puntuación de presencia" inventada.
- **Estrategia:** agregador de las salidas reales de Maps Scanner, análisis web y GEO, con origen etiquetado por dato.
- **Recomendación:** de las últimas, porque depende de otras herramientas.

### 4. Competitor Radar — BLOCKED
- **Bloqueo:** F-01 SSRF en el código histórico (`fetch(url)` sin validación, redirects libres, body sin límite, contenido reflejado).
- **Pipeline seguro reutilizable:** `analyze-website` (A2.2) aporta:
  - `urlSafety.ts` (esquema, puerto, IP literal, sufijos internos, DNS con todas las IP públicas);
  - `safeHttp.ts` (conexión TCP a la IP validada, que impide el DNS rebinding);
  - redirects revalidados (máximo 3);
  - límites de tamaño y tiempo.
  - Es **reutilizable**, pero **todavía no se ha reutilizado**.
- **Riesgos adicionales:**
  - prompt injection desde la web del competidor;
  - coste por competidor;
  - abuso como proxy de descargas.
- **Estrategia:**
  - solo competidores indicados por el usuario (máximo N);
  - descargas mediante `safeGet`;
  - extracción de campos (como `analyze-website`) en lugar de enviar el HTML al modelo;
  - IA opcional sobre campos acotados.
- **Recomendación:** después de las herramientas sin fetch.

### 5. GEO Audit — BLOCKED
- **Bloqueo:**
  - el histórico descargaba páginas y hacía 2 llamadas al modelo sin límite;
  - verify_jwt=false en `config.toml`, que debe pasar a true al reconstruirla (no se ha tocado ahora).
- **Datos:** señales de `analyze-website` ya almacenadas (schema, title, meta, robots, sitemap) y datos del negocio.
- **Riesgo:** presentar una evaluación como "ranking en IA". La UI ya indica "Evaluación orientativa, no ranking real en IA".
- **Estrategia:** checklist determinista sobre los datos reales; IA opcional solo para explicar.
- **Coste:** 0–1 llamadas.

### 6. AI Business Advisor — REQUIRES_REBUILD
- **Histórico:** `generate-business-audit` (sin límite de coste).
- **Patrón reutilizable:** `business-improvement` ya lee el contexto (`businesses` + `business_actions`) con `user_id`.
- **Riesgos:**
  - prompt injection mediante la pregunta del usuario (impacto bajo: solo afecta a su propia respuesta, sin herramientas ni datos de otros);
  - coste por conversación.
- **Estrategia:**
  - pregunta única con longitud limitada (sin chat multivuelta al principio);
  - `max_tokens`;
  - contador propio en el ledger.
- **Recomendación:** segunda.

### 7. Voice Simulator — REQUIRES_REBUILD
- **Histórico:** `generate-voice-script`, con verify_jwt=false y sin límite.
- **Riesgo:** bajo. Es texto generado y está etiquetado como "Simulación generada con IA".
- **Datos:** negocio y servicios.
- **Estrategia:** igual que el Generador SEO. Solo guiones de texto (sin síntesis de voz).
- **Recomendación:** puede adelantarse si se desea, porque técnicamente es casi idéntica al Generador SEO.

### Contexto de negocio reutilizable (punto 12)

| Fuente | Datos |
|---|---|
| `businesses` (`create_businesses.sql:32-49`) | `name`, `category` (actividad), `city`, `website`, `phone`, `schedule` (horario), `target_audience`, `services[]`, `primary_goal`, `secondary_goals[]` |
| `first_value_progress` | `business_data` y `manual_context` (entrada manual del onboarding) |
| `connected_sources.metadata` | Análisis web y GBP |
| `business_actions` | Acciones y estado |

Las herramientas futuras deben leer estas fuentes en servidor, por `user_id` + `business_id`, y no volver a pedirlas.

### IA y control de costes (punto 11)

Todas las herramientas IA pueden integrarse con:
- `requirePremium` (usuario autenticado, premium, 30/h);
- `ai_usage_reservations` + `settle_ai_usage` (reserva e idempotencia);
- bloqueo `FOR UPDATE` (concurrencia).

**Requisito previo:** el ledger está cableado a dos funciones:
- `ai_usage_monthly` solo tiene `weekly_content_used` y `business_improvement_used` (`a23_*.sql:64-73`);
- el CHECK `function IN ('weekly-content','business-improvement')` (`a231_*.sql:49`) limita las funciones admitidas;
- `reserve_ai_usage` rechaza otras funciones (`a231:89`);
- `settle_ai_usage` / `reconcile_ai_usage` ramifican por nombre.

Hay que **extender el mismo ledger**, sin crear un segundo sistema: una fila por función, o columnas nuevas más un CHECK ampliado, y decidir si el tope global de 80/mes se reparte entre más herramientas. Ninguna llamada IA debe hacerse desde el frontend.

## H. Landing Demo Consistency Audit

**Componentes revisados:**
- `ToolTrialSection` (`LandingPage.tsx:552-723`, pestañas SEO/Maps/Twin/Radar/Advisor);
- `VisibilityChecker` (l.1083).

**¿Ejecuta análisis reales?** **No.**
- `handleScan` solo guarda el input, llama a `track()` y espera 1,8 s con un temporizador.
- No hay llamadas a Supabase, Edge Functions ni IA.
- Las puntuaciones son fijas (`EXAMPLE_SCORE`, l.271-272).

**Etiquetado existente:**
- `DemoNotice` siempre visible: "Ejemplo de diagnóstico · Datos de demostración";
- "Propuesta de ejemplo", "Puntuación de ejemplo", "Gemelo Digital de ejemplo", "Preparando ejemplo para…".

**Afirmaciones técnicamente falsas, corregidas con el cambio mínimo:**

| Línea | Antes | Ahora | Motivo |
|---|---|---|---|
| 355 | "Fallos críticos detectados" | "Fallos habituales (ejemplo orientativo)" | Nada se detecta |
| 410 | "Señales detectadas" (con "Presencia en Google Maps: Activa", "Categoría principal: Correcta") | "Señales de ejemplo orientativo" | Afirmaba una comprobación del negocio concreto |
| 521 | "Consejo AI para {biz}" | "Ejemplo orientativo de consejo para {biz}" | No interviene ninguna IA |

**Textos que pueden inducir a error, no modificados** (ya están bajo el aviso de demostración; se recomienda revisarlos en una fase de landing):
- "pierdes el 68% de búsquedas nocturnas" (l.359);
- "Resultados Garantizados" y "más de 10 años de experiencia" (l.290-291);
- competidores "#1/#2 en tu zona" con reseñas inventadas (l.372-379, 469-480);
- "Análisis completo (8 puntos más) bloqueado" (l.529);
- "Sin registro · Sin tarjeta · Resultado en segundos" (l.663);
- "Tu {tool} está listo" / "Ver mi informe completo — gratis" (`i18n.tsx:645,649`). Promete un informe que no existe tras el registro.

**CTA hacia el registro:**
- `RegistrationGate` llama a `onLoginClick`, que en `App.tsx` abre el modal en modo **login**, no en registro, aunque el texto invite a empezar gratis. No se ha modificado (es funnel comercial); se recomienda corregirlo.
- El `VisibilityChecker` del hero sí abre el registro y conserva el nombre del negocio (`sessionStorage.pending_business_name`).

**Contexto conservado tras el registro:**
- Desde la demo de herramientas, solo el email (prerrelleno). La herramienta y los datos tecleados se pierden.
- `track('widget_scan_start', { input })` envía a `analytics_events` el texto tecleado por el visitante (dato a valorar en privacidad).

## I. Confirmación
**NO retired Edge Function was reactivated.** Las 14 siguen siendo stubs 410 (verificado por tests). No se ha desplegado nada.

## J. Confirmación
**NO Stripe configuration was modified.**

## K. Confirmación
**NO Google OAuth/GBP configuration was modified.**

## L. Tests

| Total | Superados | Fallidos |
|---|---|---|
| 638 (28 ficheros) | 638 | 0 |

Antes había 614 tests en 27 ficheros. Se han añadido 24 tests nuevos (`toolsHub.test.ts`) y no se ha eliminado ni alterado ningún test existente.

**Cobertura de los 12 puntos exigidos:**
1. La ruta está dentro del bloque `AppGuard`.
2. La ruta está declarada en el shell autenticado.
3. Orden del sidebar.
4. Las 7 tarjetas con el copy aprobado (ES y EN presentes).
5. CTA deshabilitado "En preparación", sin `onClick`, enlaces ni "Probar".
6. Las 14 funciones siguen en 410.
7. Sin llamadas IA ni a Edge Functions en el código de herramientas.
8. Sin `fetch` externo.
9. Sin claves ni variables de entorno en el frontend.
10. Barra inferior móvil intacta, rejilla responsive.
11. Rutas existentes declaradas.
12. Build (sección M).

Además: los estados internos no se renderizan, y los rótulos de la landing están corregidos.

**Limitación:** los tests leen el código fuente (no hay DOM ni navegador en el entorno). No se ha hecho una prueba visual real en navegador.

## M. Build
`npm run build`: **correcto**. Genera el fragmento `ToolsPage` (6,9 kB).

## N. TypeScript (`tsc --noEmit -p tsconfig.app.json`)
- **NEW ERRORS: 0.**
- **PRE-EXISTING ERRORS: 20**, todos TS6133 (declaraciones no usadas): `LandingPage.tsx` (11), `MetaAdsLanding.tsx` (2), `ContentGeneratorLanding.tsx` (2), `BusinessAuditLanding.tsx` (2), `DiagnosticLanding.tsx` (1), `legacy/AdminDashboard.tsx` (1), `App.tsx` (1, el import `useAuth` sin usar).
- El recuento y su reparto por fichero coinciden con AUDIT PRE-LAUNCH-001.
- Los ficheros nuevos no producen errores.

## O. ESLint (`eslint .`)
- **NEW: 0.**
- **PRE-EXISTING: 30 problemas** (23 errores, 7 avisos), con el mismo recuento y los mismos ficheros que en AUDIT PRE-LAUNCH-001.
- `src/features/tools/*` y `AppShellV2.tsx` no tienen hallazgos.

## P. Avisos de Supabase y seguridad observados
No se ha modificado la base de datos. Siguen vigentes los avisos registrados en AUDIT PRE-LAUNCH-001:
- protección de contraseñas filtradas desactivada;
- `search_path` mutable en `get_funnel_stats`;
- inserciones públicas con `check true` en `analytics_events` y `beta_access_requests`.

Además, a efectos de esta fase:
- `generate-geo-audit`, `generate-voice-script` y `generate-countermeasure` tienen `verify_jwt=false`. Hoy no tiene impacto (son 410), pero debe corregirse si se reconstruyen.
- F-07 (`connected_sources.metadata` editable por el usuario) afecta a la fiabilidad del futuro Maps Scanner.

## Q. Regresiones encontradas
Ninguna. Rutas, sidebar, menú móvil y barra inferior conservan su comportamiento, y la suite previa está íntegra.

## R. Riesgos pendientes
1. Ledger de IA no generalizado: es el bloqueante técnico para cualquier herramienta IA.
2. P1-02 de AUDIT PRE-LAUNCH-001 (pruebas ilimitadas mediante el alta autoconfirmada). Añadir herramientas IA amplía la superficie de coste. Se recomienda corregirlo antes de A2.4.2.
3. P1-03 (OAuth GBP) y F-07: bloquean un Maps Scanner fiable.
4. CTA de la demo que abre login en vez de registro, y textos de la landing listados en H.
5. La UI de `/herramientas` no se ha probado visualmente en navegador.

## S. Orden de recuperación recomendado

Prerrequisito **A2.4.2-0**: migración que generaliza el ledger de IA (una sola vez) y corrección de P1-02.

| Fase | Herramienta | Justificación técnica |
|---|---|---|
| A2.4.2 | Generador SEO | Sin fetch; solo contexto propio; clona `business-improvement` |
| A2.4.3 | AI Business Advisor | Mismo patrón; entrada de texto libre acotada |
| A2.4.4 | Voice Simulator | Técnicamente idéntica a la anterior; riesgo mínimo. **Se propone adelantarla** desde la posición 7 |
| A2.4.5 | Maps Profile Scanner | Datos reales ya existentes, pero requiere cerrar antes P1-03 y F-07. Puede no usar IA |
| A2.4.6 | GEO Audit | Reutiliza las señales de `analyze-website`; checklist determinista |
| A2.4.7 | Competitor Radar | Única con fetch de URLs de terceros por petición (mayor superficie SSRF/inyección); exige integrar `safeHttp` |
| A2.4.8 | AI Digital Twin | Agregador; depende de Maps, GEO y análisis web |

**Diferencias respecto al orden propuesto, con su evidencia:**
- **Voice se adelanta:** no tiene dependencias externas ni fetch, y el patrón es el mismo que SEO/Advisor.
- **Radar pasa después de GEO:** GEO puede construirse sobre datos de `analyze-website` ya almacenados, mientras que Radar necesita nuevas descargas de URLs ajenas en cada uso.

## T. Definition of Done

| Condición | Cumple |
|---|---|
| `/herramientas` existe | Sí |
| Protegida por Auth (mismo guard) | Sí |
| Aparece en la navegación | Sí |
| Exactamente 7 herramientas | Sí |
| Ninguna herramienta falsa operativa | Sí (todas con CTA deshabilitado) |
| Ninguna función retirada reactivada | Sí |
| Ninguna protección previa eliminada | Sí |
| Stripe sin tocar | Sí |
| Google OAuth/GBP sin tocar | Sí |
| Sin regresiones en la suite | Sí (638/638) |
| Build de producción correcto | Sí |
| Inventario técnico entregado | Sí |

**A2.4.1 = COMPLETADO.** Se espera auditoría y autorización expresa antes de A2.4.2.
