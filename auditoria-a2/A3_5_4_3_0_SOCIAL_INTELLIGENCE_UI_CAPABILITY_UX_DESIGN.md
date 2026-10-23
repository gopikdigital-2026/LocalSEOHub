# A3.5.4.3.0 — SOCIAL INTELLIGENCE UI — CAPABILITY & UX DESIGN AUDIT

Modo: AUDITORÍA + DISEÑO. No se ha implementado UI, rutas, componentes, tablas, endpoints ni edge functions. A3.5.4.1 y A3.5.4.2 permanecen congelados e intactos. Única consulta a base de datos: un `SELECT` agregado read-only sobre `meta_content_items` (recuento de permalinks), sin modificar datos.

---

## 1. Executive recommendation

Construir **una única página nueva "Inteligencia Social" en `/herramientas/social`**, accesible como tarjeta del hub Herramientas (sin nueva entrada en el sidebar), que:

1. Lee los datos Meta del propio usuario directamente desde el navegador (RLS owner-only ya existente, sin tokens accesibles), los pasa por los motores congelados `evaluateSocialSignals` → `evaluateSocialFindings` y presenta el resultado.
2. Ordena la información en tres niveles de peso visual: **Qué merece tu atención** (accionable) > **Lo que sabemos hasta ahora** (informativo) > **Alcance del análisis** (limitaciones de datos, una única línea por plataforma).
3. Sólo ofrece botones que ejecutan acciones **que ya existen**:
   - "Ver publicaciones" → abre una lista desplegable de las publicaciones sin texto con enlace a la publicación real en Facebook (permalink https ya almacenado; 4/4 posts reales tienen permalink).
   - "Actualizar datos" → la sincronización existente (`meta-read` acción `sync`, enfriamiento de 60 s en servidor).
   - "Ir a Fuentes" → el flujo de conexión/reconexión existente en `/fuentes`.
   - El resto de recomendaciones se muestran sin botón.
4. No muestra puntuaciones, semáforos globales, gráficos, porcentajes ni métricas inventadas; NULL nunca se muestra como 0.

No se necesita edge function, tabla ni migración nueva para la v1.

## 2. Existing UI architecture audit

| Área | Hallazgo |
|---|---|
| Router | `src/App.tsx`, React Router con `lazy()` por página y un único `<Suspense>`. Rutas de la app dentro de `<Route element={<AppGuard><AppShellV2/></AppGuard>}>` (L185–203). |
| Herramientas | Hub `/herramientas` (`ToolsPage`) + 8 rutas hijas planas: `/herramientas/seo`, `advisor`, `maps`, `geo`, `twin`, `radar`, `voice`, `resenas`. |
| Catálogo | `src/features/tools/catalog.ts`: `{ id: ToolId, dataKind, recoveryStatus, legacyFunction, copy: {es,en}, enabled, path }`. `TOOL_ICONS: Record<ToolId, ReactNode>` en ToolsPage. Grid `1 / sm:2 / xl:3` columnas. Badges "Premium" + "Disponible". |
| Sidebar | `NAV_ITEMS` (7): Hoy, Plan, Herramientas, Resumen, Mi negocio, Fuentes, Facturación. Breakpoint único `lg`. |
| Móvil | Header `h-14` + drawer derecho `w-72` + bottom bar `h-16` con `['hoy','plan','informes','negocio','fuentes']`. |
| Contenedor | `<main>` con `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8`; las páginas usan `space-y-6`. |
| Patrón de herramienta conectada | `ReviewsPage` (`/herramientas/resenas`): copy local `COPY.es/en`, `PageData` con `loading | error | estados`, `StateCard` para estados de conexión con `<Link to="/fuentes">` (conectar/reconectar) y botón "Reintentar". Es el modelo más cercano y debe replicarse. |
| Meta en Fuentes | `MetaConnectionCard` + `MetaSyncStatus` en `/fuentes` (`SourceManager.tsx` L214): conectar, elegir página, reconectar, desconectar, sincronizar. Único lugar con OAuth Meta. |

Restricciones de tests existentes que la implementación deberá actualizar conscientemente (no son defectos):
- `toolsHub.test.ts` fija la lista ordenada de 8 nombres/indicadores, la lista de ids habilitados, que sólo `reviews` tiene `cta`, y prohíbe `onClick`/`navigate(`/`href=` en ToolsPage.
- Sidebar y bottom bar tienen orden fijado por test → refuerza no tocar la navegación principal.

## 3. Proposed route

**`/herramientas/social`**, hija del layout `AppShellV2` y protegida por `AppGuard`, cargada con `lazy()` como el resto.

Motivos: coherente con las 8 herramientas existentes (`/herramientas/<id>`), con `/herramientas/resenas` (otra herramienta basada en fuente conectada) y con la preferencia del encargo. No se crea todavía.

## 4. Navigation strategy

- **Entrada principal:** nueva tarjeta en el catálogo de Herramientas (`id: 'social'`, `dataKind: 'sources'`, icono lucide `Share2` o `MessagesSquare`), mismo diseño que las demás.
- **Sin entrada en sidebar ni bottom bar** (7 y 5 elementos ya; orden fijado por tests).
- **Enlace contextual secundario** (opcional, recomendado): en `/fuentes`, bajo la tarjeta Meta conectada, un enlace de texto "Ver Inteligencia Social". Se valorará en implementación porque toca la tarjeta Meta congelada en A3.5.3 → si requiere modificar `MetaConnectionCard`, posponer.
- **Volver:** enlace "Volver a Herramientas" arriba, igual que Reseñas.
- **Móvil:** se llega por drawer → Herramientas → tarjeta. Sin cambios en navegación móvil.
- **Integraciones con Hoy / Plan / Advisor / Resumen:** fuera de alcance (A3.5.4.4).

## 5. Product hierarchy

```
1. Estado de las plataformas (overview compacto)       — orientación
2. Qué merece tu atención (findings ACTIVE + recs)    — mayor peso
3. Lo que sabemos hasta ahora (INFORMATIONAL)         — peso medio-bajo
4. Alcance del análisis (INSUFFICIENT / NOT_AVAILABLE) — peso mínimo, una línea por plataforma
5. Datos del análisis (actualización / fuente)        — pie
```

Regla: `ACTIONABLE > INFORMATIONAL > DATA LIMITATIONS`. Nunca seis tarjetas iguales. Con los datos reales actuales: 1 tarjeta destacada, 2 líneas informativas, 1 bloque compacto de alcance.

Excepción: si una plataforma está bloqueada (acceso) o desactualizada, su estado ocupa la sección 2 porque es lo único accionable para esa plataforma.

## 6. Header

Patrón de página existente (`h1 text-v2-2xl sm:text-v2-3xl font-bold tracking-tight` + subtítulo `text-v2-sm text-v2-text-secondary`).

| | ES | EN |
|---|---|---|
| Volver | Volver a Herramientas | Back to Tools |
| Título | Inteligencia Social | Social Intelligence |
| Subtítulo | Analizamos los datos reales de tus cuentas conectadas de Facebook e Instagram para mostrarte qué merece atención y qué puedes revisar. | We analyse real data from your connected Facebook and Instagram accounts to show you what deserves attention and what you can review. |
| Nota de fuente (línea pequeña con icono `ShieldCheck`) | Solo leemos tus publicaciones. No publicamos ni modificamos nada en Meta. | We only read your posts. We never publish or change anything on Meta. |

Prohibido: "Mejora tus resultados", "Aumenta tus ventas", "Consigue más alcance". Sin badges de "IA".

## 7. Platform overview

Dos tarjetas compactas lado a lado (`sm:grid-cols-2`), una por plataforma, siempre en orden Facebook → Instagram.

Contenido de cada tarjeta:

| Campo | Fuente | Regla |
|---|---|---|
| Icono + nombre plataforma | fijo | lucide `Facebook` / `Instagram` |
| Cuenta | `meta_connections.page_name` / `instagram_username` (`@…`) | Omitir si null; nunca IDs |
| Conexión | `blockedReason` / estado sync | Badge texto+icono: "Conectado", "Requiere reconexión", "Sin vincular", "Sin conectar", "Pendiente de sincronizar", "Acceso limitado", "Error temporal" |
| Actividad | finding de actividad | Ver §8. Oculto si la plataforma está bloqueada o stale |
| Contenido observado | `item_count` / evidencia | "3 publicaciones analizadas" / "1 publicación analizada". Nunca "0 publicaciones" si bloqueada (no se sabe) |
| Historial | presencia de LIMITED_HISTORY | "Historial en construcción" (neutral) o nada |
| Actualización | `last_success_at` + freshness | "Datos actualizados hace 5 h" (relativo, con fecha absoluta en `title`/`<time dateTime>`) |

**No aparece ninguna métrica de interacción en la tarjeta** (ni FB NULL, ni IG 0/0). La interacción vive sólo en "Alcance del análisis" (§14).

## 8. Activity language

| Estado interno | Etiqueta ES | Etiqueta EN | Detalle |
|---|---|---|---|
| RECENT_ACTIVITY | Actividad reciente | Recent activity | "Última publicación hace {n} días" |
| INTERMEDIATE_ACTIVITY | Última publicación hace {n} días | Last post {n} days ago | Sin adjetivo |
| LONG_INACTIVITY | Sin publicaciones recientes | No recent posts | "Última publicación hace {n} días" |
| NO_CONTENT | Sin publicaciones observadas | No posts observed | — |
| RECENCY_INSUFFICIENT | Fechas no disponibles | Dates unavailable | — |

Decisión INTERMEDIATE: **"Última publicación hace X días"** es más preciso y menos alarmista que "Sin actividad reciente". "Sin actividad reciente" contradice el contrato congelado ("No se considera actividad reciente **ni una inactividad prolongada**") y empuja a leerlo como problema. La etiqueta descriptiva con la cifra es puramente factual.

Prohibido: "Inactivo", "Abandonado", "Cuenta parada". `n` siempre en días completos (`daysSinceLastPost`, ya calculado por el motor). Singular/plural correcto ("hace 1 día").

## 9. Attention section

Título: **"Qué merece tu atención"** / "What deserves your attention".

Contenido: sólo
- findings `ACTIVE` (TEXT_MISSING, CAPTION_MISSING, LONG_INACTIVITY, NO_CONTENT) con su recomendación;
- findings de acceso (`ACCESS_*`) y `DATA_STALE`, porque son lo único accionable para esa plataforma.

Excluido: INFORMATIONAL, INSUFFICIENT_DATA, ENGAGEMENT_METRICS_UNAVAILABLE.

Orden: el del motor (prioridad → categoría → plataforma → key), ya determinista. No se reordena en UI.

Si queda vacía (estado M/N) se sustituye por una línea neutral: "Ahora mismo no hay nada que requiera tu atención con los datos disponibles." — sin tono de "todo perfecto" (no podemos afirmarlo).

### Comportamiento seguro del CTA "Revisar publicaciones"

Opciones auditadas:

| Opción | Veredicto |
|---|---|
| Crear acción en Action Layer | ✗ Prohibido en A3.5.4.3 (A3.5.4.4) |
| Navegar a vista existente | ✗ No existe vista de publicaciones en la app |
| Sin CTA | Válido pero menos útil |
| **Desplegar lista de publicaciones sin texto con enlace a Facebook** | ✓ **Recomendado** |

El botón "Ver publicaciones" (`aria-expanded`) despliega, dentro de la tarjeta, la lista de las publicaciones sin texto: fecha de publicación, tipo ("Foto") y enlace "Abrir en Facebook" al `permalink` real. Es una acción real, no ficticia: el usuario revisa y edita la publicación en Facebook. LocalSEOHub no edita nada.

Salvaguardas:
- Enlaces `target="_blank" rel="noopener noreferrer"`, sólo si el host es `facebook.com`/`www.facebook.com`/`m.facebook.com` o `instagram.com`/`www.instagram.com` (el servidor ya fuerza https). Si no, se muestra la fila sin enlace.
- La lista se calcula en la capa de UI con el mismo predicado que el motor (texto vacío tras `trim`). Como `hasText` del motor congelado no está exportado, se duplica el predicado y **un guard de consistencia** compara la longitud de la lista con `params.postsWithoutText` del finding: si difieren, se oculta la lista y se muestra sólo la evidencia (sin error visible). Un test lo cubre.
- No se muestra ningún texto de publicación (no aplica: son posts sin texto; para CAPTION se aplica lo mismo).

## 10. Recommendation cards

Estructura de la tarjeta de atención (una por finding accionable):

```
┌───────────────────────────────────────────────────────────┐
│ [icono plataforma]  Facebook                  [Revisar]    │  ← badge texto, no enum
│ Revisa el texto de algunas publicaciones                   │  ← título humano (UI key)
│ Revisa si las publicaciones sin texto (2) necesitan unas   │  ← social.rec.* (congelado)
│ palabras que expliquen o den contexto al contenido.        │
│ ▸ ¿Por qué?  2 de las 3 publicaciones analizadas no        │  ← evidencia (§11)
│   incluyen texto.                                          │
│ [Ver publicaciones ▾]                                      │  ← CTA sólo si acción real
└───────────────────────────────────────────────────────────┘
```

- Título humano: clave UI nueva por recommendationKey (los títulos `social.finding.*.title` son descriptivos, no orientados a acción).
- Cuerpo: `formatSocialMessage(lang, rec.messageKey, rec.params, rec.platform)` — copy congelada y validada.
- Prioridad visual (interna, nunca texto "LOW/MEDIUM"):
  - MEDIUM → borde izquierdo `v2-warning-300` + badge "Prioritario" / "Priority".
  - LOW → borde `v2-primary-200` + badge "Para revisar" / "To review".
  - INFO (acceso/stale) → borde `v2-neutral-200`.
- DIRECT/CONTEXTUAL no se muestran; CONTEXTUAL sólo afecta al tono (su copy ya es condicional "Si…").
- Recomendaciones `WAIT_FOR_MORE_HISTORY` **no** son tarjetas: se integran en §13.

## 11. Evidence UX

Cada tarjeta de atención incluye una línea "¿Por qué?" visible por defecto (sin clic; es corta) generada desde `finding.summaryKey` + `params` con `formatSocialMessage`:

> ¿Por qué? Parte del contenido observado en Facebook no incluye texto: 2 de 3 publicaciones.

Reglas:
- Nunca JSON, SignalKey, ReasonCode, sufficiency, engineVersion, trace ni nombres de columna.
- Siempre "publicaciones analizadas/observadas" (lo que hemos visto), no "tus publicaciones" (podría haber más fuera de la ventana).
- Si `windowTruncated` (≥100 items o ≥4 páginas), añadir "Basado en tus publicaciones más recientes." (clave UI).
- Para findings de acceso: la evidencia es la fecha de la última sincronización correcta, si existe.

## 12. Informational section

Título: **"Lo que sabemos hasta ahora"** / "What we know so far". Estilo: lista compacta dentro de una única `Card` (no una tarjeta por finding), icono pequeño + frase, texto `text-v2-sm text-v2-text-secondary`.

Contiene findings `INFORMATIONAL`:
- RECENT_ACTIVITY / INTERMEDIATE_ACTIVITY por plataforma (frase congelada `summary`);
- FREQUENCY_OBSERVED, CONTENT_TYPE_MIX, ENGAGEMENT_DATA_AVAILABLE (cuando haya datos suficientes);
- cross-platform FB_ONLY_RECENT / IG_ONLY_RECENT / RECENCY_DIFFERENCE.

Sin botones. Se oculta entera si no hay ningún finding informativo.

## 13. Limited-data UX

Una única representación, al final, en un bloque "Alcance del análisis" / "Analysis coverage":

> **Historial en construcción**
> Facebook · Instagram — Necesitamos más publicaciones sincronizadas para valorar el ritmo de publicación, los formatos y la interacción con fiabilidad. Esto describe los límites del análisis, no la situación de tu negocio.
> El análisis será más completo a medida que se sincronicen más publicaciones. ← `social.rec.WAIT_FOR_MORE_HISTORY` (congelado)

- Una sola entrada aunque ambas plataformas tengan LIMITED_HISTORY (agrupación por mensaje en UI; las plataformas se listan).
- Los `groupedFindings` alimentan sólo la lista de aspectos ("ritmo de publicación", "formatos", "interacción") mediante claves UI por topic; nunca cifras de suficiencia ni %.
- Color neutral (`v2-neutral-50`, icono `Hourglass` o `Info`). **Nunca** warning/ámbar ni la palabra "Insuficiente" como badge.
- Sin CTA (WAIT_FOR_MORE_HISTORY no tiene acción).

## 14. Engagement UX

| Caso | Política |
|---|---|
| FB `ENGAGEMENT_METRICS_UNAVAILABLE` (NULL) | Línea en "Alcance del análisis": "Las métricas de interacción de Facebook no están disponibles actualmente para este análisis." Nunca "0", "—" ni celda vacía con apariencia de métrica. No aparece en overview. |
| IG ceros reales + muestra insuficiente | Agrupado en "Historial en construcción" (aspecto "interacción"). No se muestran los 0/0 en v1. |
| IG `ENGAGEMENT_DATA_AVAILABLE` (muestra suficiente, futuro) | Línea en "Lo que sabemos" con la frase congelada. Sin "bajo/alto", sin tasa, sin comparación. |

Decisión: en v1 **no se muestran cifras de interacción** en ningún sitio. Mostrar "0 me gusta" con muestra de 1 publicación induce a diagnóstico aunque se añada contexto; el beneficio es nulo. Se reconsiderará cuando haya muestra suficiente.

## 15. Freshness UX

- Pie de cada tarjeta de plataforma: "Datos actualizados hace {relativo}" (`<time dateTime=ISO title=fecha local>`), basado en `last_success_at`.
- FRESH (≤24 h): texto neutro.
- AGING (24 h–7 d): texto neutro + "Puedes actualizar los datos cuando quieras." con botón secundario "Actualizar datos".
- STALE (>7 d): badge "Datos desactualizados" (icono `Clock`, tono warning suave), se ocultan actividad y conteos de la tarjeta, y la plataforma aporta sólo la tarjeta DATA_STALE en "Qué merece tu atención" con el copy congelado ("Actualiza los datos antes de sacar conclusiones sobre la situación actual.") y botón **"Actualizar datos"** → `syncMetaContent()` existente.
- Botón Actualizar: estado "Actualizando…" con `aria-busy`; al terminar recarga el informe; si `SYNC_COOLDOWN` → "Acabas de actualizar. Espera un minuto antes de volver a intentarlo."; si `REAUTH_REQUIRED` → recarga (pasará a estado reauth); otro error → aviso temporal sin cambiar el análisis.
- La sincronización actualiza ambas plataformas (contrato de `meta-read`); el botón global en "Datos del análisis" es el mismo.

## 16. Connection/error states

Cuando una plataforma está bloqueada, su tarjeta overview muestra sólo el estado y su único contenido en "Qué merece tu atención" es la tarjeta de acceso. Ningún finding de negocio de esa plataforma (garantizado por el motor y verificado en A3.5.4.2.1).

| blockedReason | Badge overview | Tarjeta atención (título UI) | Cuerpo | CTA |
|---|---|---|---|---|
| REAUTH_REQUIRED | Requiere reconexión (`KeyRound`) | Vuelve a conectar Meta | `social.rec.RECONNECT_META` | "Ir a Fuentes" → `/fuentes` |
| PERMISSION_UNAVAILABLE | Acceso limitado (`ShieldAlert`) | Revisa los permisos de Meta | `social.rec.REVIEW_META_PERMISSIONS` | "Ir a Fuentes" → `/fuentes` |
| NOT_CONNECTED | Sin conectar (`Link2Off`) | — (empty state §17 si ambas) | `social.rec.CONNECT_PLATFORM` | "Conectar redes" → `/fuentes` |
| NOT_LINKED (IG) | Sin vincular | Instagram todavía no está vinculado | `social.rec.CONNECT_PLATFORM` | "Ir a Fuentes" → `/fuentes` |
| RATE_LIMITED | Pausa temporal de Meta (`Timer`) | Meta está limitando temporalmente el acceso | `social.rec.RETRY_LATER` | ninguno (sin temporizador inventado) |
| SYNC_ERROR | Error temporal (`AlertCircle`) | No pudimos actualizar los datos | `social.rec.RETRY_LATER` | ninguno; el botón general "Actualizar datos" sigue disponible |
| NEVER_SYNCED | Pendiente de sincronizar (`RefreshCw`) | Todavía no hemos leído tus publicaciones | `social.rec.REFRESH_DATA` | "Actualizar datos" → sync existente |

Si el finding es `cross_platform` (ambas plataformas mismo problema, D1), se muestra una sola tarjeta con "Facebook e Instagram".

Nota: `/fuentes` es el único punto de OAuth; no se crea un segundo flujo.

## 17. Empty state

Cuando no hay conexión Meta (`CROSS_PLATFORM_ACCESS_NOT_CONNECTED`) se sustituye toda la página bajo el header por el `EmptyState` del design system:

- Icono `Share2` en círculo `v2-primary-50`.
- Título: "Conecta tus redes para empezar" / "Connect your social accounts to get started".
- Valor antes del CTA: "Cuando conectes Facebook e Instagram, analizaremos tus publicaciones reales para mostrarte qué merece atención, como publicaciones sin texto o periodos sin publicar." (sin promesas de resultados).
- CTA primario: "Conectar redes" → `<Link to="/fuentes">`.
- Nota: "Solo leemos tus publicaciones. Puedes desconectar cuando quieras desde Fuentes."

No se muestran tarjetas de plataforma vacías ni métricas a 0.

## 18. Loading states

| Situación | Diseño |
|---|---|
| Carga inicial | Skeleton estático: 2 bloques overview + 1 bloque atención (`animate-pulse`, desactivado con `motion-reduce:animate-none`). Texto accesible "Cargando el análisis de tus redes…" (`role="status"`). Sin spinner infinito: si la lectura supera 15 s → estado error temporal con "Reintentar". |
| Procesamiento | Los motores son síncronos y puros (<5 ms con 200 items): no se muestra estado propio. |
| Actualizar datos | El informe anterior permanece visible con una franja "Actualizando datos…" (`aria-live="polite"`) y contenido atenuado (`opacity-60`, `aria-busy`). Al terminar se re-evalúa. Si falla, el informe anterior se mantiene con la etiqueta "Mostrando los datos de la última actualización correcta (hace X)". |
| Carga parcial por plataforma | No aplica en v1: las tres lecturas se hacen en paralelo y el informe se calcula sólo con las tres completas (el motor necesita el snapshot completo). Si una falla → error general (§18bis), nunca un informe parcial que pueda dar findings erróneos. |

No se muestran findings antiguos como actuales: tras cualquier error de lectura no se reutiliza un informe previo salvo con la etiqueta explícita de arriba.

## 18bis. Error state (sección 18 del encargo)

Tres familias, nunca convertidas en diagnóstico de negocio:

| Familia | Origen | UI |
|---|---|---|
| Problema temporal | fallo de lectura Supabase / red / timeout | `ErrorState`: "No hemos podido cargar el análisis ahora mismo. Inténtalo de nuevo en unos segundos." + "Reintentar". |
| Problema de conexión | `blockedReason` del motor | §16 (dentro del informe, por plataforma) |
| Datos no disponibles | motor devuelve NOT_AVAILABLE / sin negocio seleccionado | Sin negocio: "Selecciona o crea un negocio para ver su análisis social." + enlace `/negocio`. NOT_AVAILABLE: §13–14. |
| Excepción del motor (`UNSUPPORTED_SIGNALS_ENGINE_VERSION`, `INVALID_EVALUATED_AT`) | bug interno | Mismo `ErrorState` temporal; se registra en consola sin datos personales. |

## 19. Mobile layout

Orden vertical (una columna, `space-y-6`):

1. Volver + Header (subtítulo y nota de fuente).
2. Overview: tarjetas Facebook e Instagram apiladas (`grid-cols-1`).
3. Qué merece tu atención (tarjetas a ancho completo; CTA a ancho completo `w-full sm:w-auto`, altura ≥44 px).
4. Lo que sabemos hasta ahora (lista).
5. Alcance del análisis.
6. Datos del análisis (última actualización + "Actualizar datos").

Sin tablas. La lista de publicaciones desplegada usa filas apiladas (fecha arriba, enlace debajo). Padding inferior respetado por el `pb-20` del shell (bottom bar).

## 20. Desktop layout

Dentro del `max-w-5xl` del shell (no se ensancha):

```
← Volver a Herramientas
Inteligencia Social
Subtítulo · nota de fuente
┌────────── Facebook ──────────┐ ┌────────── Instagram ─────────┐
└──────────────────────────────┘ └──────────────────────────────┘
Qué merece tu atención
┌─────────────────────────── tarjeta destacada (ancho completo) ─┐
└────────────────────────────────────────────────────────────────┘
┌── Lo que sabemos hasta ahora ──┐ ┌── Alcance del análisis ─────┐   ← lg:grid-cols-2
└────────────────────────────────┘ └─────────────────────────────┘
Datos del análisis · Actualizar datos
```

Las tarjetas de atención van siempre a ancho completo (máximo protagonismo); las secciones secundarias comparten fila en `lg` para no alargar la página. Sin dashboard, sin widgets adicionales.

## 21. Design-system reuse

Reutilizar sin crear nuevos primitivos:
- `src/components/ui`: `Card`, `Badge` (`success|warning|info|neutral|default`), `Button` (`primary|secondary|ghost`, `loading`, `icon`), `EmptyState`, `ErrorState`, `SectionHeader`, `PageHeader`.
- Tokens Tailwind `v2-*` (fuente Inter `font-v2`, `text-v2-*`, `rounded-v2-*`, `shadow-v2-*`, primario esmeralda `v2-primary-*`).
- Patrones de `ReviewsPage`: botón "Volver", `StateCard` para estados de conexión, clases `btnPrimary`/`btnSecondary`, `<Link to="/fuentes">`.
- Iconos lucide-react (`Facebook`, `Instagram`, `Share2`, `FileText`, `Clock`, `RefreshCw`, `KeyRound`, `ShieldAlert`, `Link2Off`, `Timer`, `Hourglass`, `Info`, `ExternalLink`, `ChevronDown`).
- Breakpoints existentes (`sm`, `lg`).

No usar `DataStatusBadge`/`DataSourceInfo` (etiquetas fijas en ES y semántica verified/estimated/demo distinta).

## 22. Colour semantics

| Semántica | Uso | Tokens | Icono acompañante |
|---|---|---|---|
| Positivo / conectado | Badge "Conectado", "Actividad reciente" | `v2-success-50/700` | `CheckCircle2` |
| Neutral / informativo | Lo que sabemos, historial en construcción, interacción no disponible, INTERMEDIATE, FRESH/AGING | `v2-neutral-50/600`, `v2-text-secondary` | `Info`, `Hourglass` |
| Atención / accionable | Tarjetas de "Qué merece tu atención" (TEXT/CAPTION/LONG_INACTIVITY/NO_CONTENT) | acento `v2-primary-*` (LOW) o `v2-warning-*` suave (MEDIUM) | `FileText`, `CalendarClock` |
| Técnico / acceso | REAUTH, PERMISSION, RATE_LIMITED, SYNC_ERROR, STALE, NEVER_SYNCED | `v2-warning-50/700` (reauth/permisos/stale), `v2-neutral` (rate limited/never synced) | `KeyRound`, `ShieldAlert`, `Timer`, `Clock` |

- No se usa rojo (`v2-error`) para ningún estado de esta página: no hay estados de severidad crítica.
- INSUFFICIENT_DATA nunca en ámbar ni con icono de alerta.
- Sin semáforo global; ningún color sin texto.

## 23. Findings-to-UI matrix

Todos los topics congelados de A3.5.4.2 (sin cambiarlos).

| Topic | Status típico | Sección UI | Prominencia | Icono / badge | Estrategia de título | Evidencia | CTA |
|---|---|---|---|---|---|---|---|
| TEXT_MISSING | ACTIVE | Atención | Alta | `FileText` · "Para revisar"/"Prioritario" | UI: "Revisa el texto de algunas publicaciones" | summary congelado ("2 de 3 publicaciones") | "Ver publicaciones" (lista + permalinks) |
| CAPTION_MISSING | ACTIVE | Atención | Alta | `FileText` | UI: "Revisa la descripción de algunas publicaciones" | summary congelado | "Ver publicaciones" (Instagram) |
| LONG_INACTIVITY | ACTIVE | Atención + badge overview "Sin publicaciones recientes" | Alta | `CalendarClock` · "Prioritario" | UI: "Sin publicaciones recientes en {platform}" | summary congelado (días) | ninguno (CONSIDER_NEW_CONTENT sin acción real) |
| NO_CONTENT | ACTIVE | Atención | Media | `FileX` | finding.title congelado | summary congelado | ninguno |
| RECENT_ACTIVITY | INFORMATIONAL | Overview + Lo que sabemos | Baja | `CheckCircle2` success | Etiqueta "Actividad reciente" | summary | ninguno |
| INTERMEDIATE_ACTIVITY | INFORMATIONAL | Overview + Lo que sabemos | Baja | `Clock` neutral | "Última publicación hace {n} días" | summary | ninguno |
| RECENCY_INSUFFICIENT | INSUFFICIENT_DATA | Alcance (agrupado) | Mínima | `Hourglass` | aspecto "fechas de publicación" | — | ninguno |
| FREQUENCY_OBSERVED | INFORMATIONAL | Lo que sabemos | Baja | `Activity` | summary | summary | ninguno |
| FREQUENCY_INSUFFICIENT | INSUFFICIENT_DATA | Alcance (agrupado) | Mínima | `Hourglass` | aspecto "ritmo de publicación" | — | ninguno |
| CONTENT_TYPE_MIX | INFORMATIONAL | Lo que sabemos | Baja | `LayoutGrid` | summary | summary | ninguno |
| CONTENT_TYPE_INSUFFICIENT | INSUFFICIENT_DATA | Alcance (agrupado) | Mínima | `Hourglass` | aspecto "formatos" | — | ninguno |
| ENGAGEMENT_DATA_AVAILABLE | INFORMATIONAL | Lo que sabemos | Baja | `MessageCircle` | summary | summary (sin juicio) | ninguno |
| ENGAGEMENT_SAMPLE_INSUFFICIENT | INSUFFICIENT_DATA | Alcance (agrupado) | Mínima | `Hourglass` | aspecto "interacción" | — | ninguno |
| ENGAGEMENT_METRICS_UNAVAILABLE | NOT_AVAILABLE | Alcance | Mínima | `Info` | — | summary congelado | ninguno |
| LIMITED_HISTORY | INSUFFICIENT_DATA | Alcance (una entrada) | Mínima | `Hourglass` neutral | UI "Historial en construcción" | lista de aspectos agrupados | ninguno |
| DATA_STALE | STALE | Atención + badge overview | Media | `Clock` warning suave | finding.title congelado | "Última actualización correcta: …" | "Actualizar datos" |
| ACCESS_REAUTH_REQUIRED | NOT_AVAILABLE | Atención + badge overview | Alta | `KeyRound` | UI "Vuelve a conectar Meta" | fecha última sincronización correcta | "Ir a Fuentes" |
| ACCESS_PERMISSION_UNAVAILABLE | NOT_AVAILABLE | Atención + overview | Media | `ShieldAlert` | UI "Revisa los permisos de Meta" | idem | "Ir a Fuentes" |
| ACCESS_NOT_CONNECTED | NOT_AVAILABLE | Empty state (ambas) / overview | Alta | `Link2Off` | UI "Conecta tus redes para empezar" | — | "Conectar redes" |
| ACCESS_NOT_LINKED | NOT_AVAILABLE | Atención + overview | Media | `Link2Off` | finding.title congelado | — | "Ir a Fuentes" |
| ACCESS_RATE_LIMITED | NOT_AVAILABLE | Atención + overview | Baja | `Timer` neutral | finding.title congelado | fecha última correcta | ninguno |
| ACCESS_SYNC_ERROR | NOT_AVAILABLE | Atención + overview | Baja | `AlertCircle` neutral | finding.title congelado | fecha última correcta | ninguno (botón general Actualizar) |
| ACCESS_NEVER_SYNCED | NOT_AVAILABLE | Atención + overview | Media | `RefreshCw` | finding.title congelado | — | "Actualizar datos" |
| FB_ONLY_RECENT | INFORMATIONAL | Lo que sabemos | Baja | `ArrowLeftRight` | summary | summary (sólo fechas) | ninguno |
| IG_ONLY_RECENT | INFORMATIONAL | Lo que sabemos | Baja | `ArrowLeftRight` | summary | summary | ninguno |
| RECENCY_DIFFERENCE | INFORMATIONAL | Lo que sabemos | Baja | `ArrowLeftRight` | summary | summary ("Solo describe fechas") | ninguno |

Topics con status NOT_DETECTED no generan finding y no se muestran (trace NO_FINDING).

## 24. Recommendations-to-UI matrix

| recommendationKey | Ubicación UI | Etiqueta CTA ES / EN | CTA activo | Destino / acción existente | Fallback |
|---|---|---|---|---|---|
| REVIEW_POSTS_WITHOUT_TEXT | Tarjeta atención (cuerpo) | Ver publicaciones / View posts | Sí, si guard de consistencia OK | Despliega lista con permalinks a facebook.com (externo) | Sólo texto + evidencia |
| REVIEW_POSTS_WITHOUT_CAPTION | Tarjeta atención | Ver publicaciones / View posts | Sí, idem | Permalinks a instagram.com | Sólo texto |
| CONSIDER_NEW_CONTENT | Tarjeta atención (bajo LONG_INACTIVITY) | — | No | No existe acción de planificación social (Contenido semanal es A3.5.4.4) | Texto condicional congelado, sin botón |
| REFRESH_DATA | Tarjeta atención (STALE / NEVER_SYNCED) | Actualizar datos / Refresh data | Sí | `syncMetaContent()` → edge `meta-read` `sync` (cooldown 60 s servidor) | Si `SYNC_COOLDOWN`: mensaje de espera |
| RECONNECT_META | Tarjeta atención | Ir a Fuentes / Go to Sources | Sí | `<Link to="/fuentes">` (MetaConnectionCard → "Volver a conectar") | — |
| REVIEW_META_PERMISSIONS | Tarjeta atención | Ir a Fuentes / Go to Sources | Sí | `/fuentes` (reconectar concediendo permisos) | — |
| CONNECT_PLATFORM | Empty state / tarjeta atención | Conectar redes / Connect accounts (NOT_CONNECTED); Ir a Fuentes (NOT_LINKED) | Sí | `/fuentes` | — |
| RETRY_LATER | Tarjeta atención | — | No | Sin temporizador real disponible | Texto congelado; botón general "Actualizar datos" del pie |
| WAIT_FOR_MORE_HISTORY | Bloque "Alcance del análisis" (no tarjeta) | — | No | — | Texto congelado |
| UNSUPPORTED (7 claves) | **Nunca** | — | — | — | El motor nunca las emite; la UI añade un filtro defensivo `safetyClass !== 'UNSUPPORTED'` |

No se inventa ninguna ruta: sólo `/fuentes`, `/negocio`, `/herramientas` y enlaces externos a permalinks ya almacenados.

## 25. Data-delivery architecture

**Decisión: orquestación en cliente, sin edge function.**

```
SocialIntelligencePage
  └─ useSocialIntelligence(businessId)            (hook: estado loading/ready/error/refreshing)
       └─ loadSocialSnapshot(businessId)           (repositorio read-only nuevo)
            ├─ meta_connections  (status, instagram_status, page_name, instagram_username)
            ├─ meta_sync_state   (platform, status, error_code, item_count, pages_fetched, last_success_at)
            └─ meta_content_items(platform, external_id, content_type, text_content, published_at,
                                  reaction_count, comment_count, permalink)  — limit 2×100, por business_id
       ├─ evaluateSocialSignals(snapshot, evaluatedAt)   (congelado)
       └─ evaluateSocialFindings(signalsReport)          (congelado)
```

- **Ubicación:** `src/features/social-intelligence/ui/` (página, componentes, copy UI, hook) + `src/features/social-intelligence/ui/repository.ts`. Los motores congelados no se tocan; la carpeta `findings/` tampoco.
- **No se modifica `metaRepository.ts`** (A3.5.3 congelado; no selecciona `pages_fetched` ni lee `meta_content_items`). El repositorio nuevo selecciona sólo las columnas listadas.
- **RLS:** las tres tablas tienen SELECT owner-only `auth.uid() = user_id` y `GRANT SELECT` a `authenticated`; `meta_connections` tiene grant por columnas que excluye `user_token_ref`. Filtrar además por `business_id` del negocio activo (`useBusiness()`).
- **Volumen:** máximo 100 items por plataforma (SYNC_WINDOW / MAX_ITEMS); una consulta con `.limit(200)` y orden estable.
- **evaluatedAt:** `new Date()` en la capa de página en el momento de la carga (los motores siguen puros). Se guarda junto al informe y se re-evalúa al recargar o tras sincronizar. Riesgo de reloj del dispositivo desfasado documentado en §34.
- **Manejo de errores:** cada lectura comprueba `error`; cualquier fallo → estado `error` (§18bis). Sin informe parcial.
- **Persistencia:** ninguna. El informe vive en memoria del componente.
- **Edge function:** innecesaria; los datos ya están normalizados y protegidos por RLS. La única llamada a función es la sincronización existente.

## 26. Security

- El navegador nunca recibe tokens: `user_token_ref` no es seleccionable (grant por columnas), el token real vive en Vault y `meta_read_token` es sólo `service_role`; `meta-read` no devuelve tokens.
- El repositorio nuevo usa listas explícitas de columnas (nunca `select('*')`); test que lo verifica.
- Sin `appsecret`, estado OAuth ni payloads crudos de Graph (no se almacenan en estas tablas).
- `text_content` llega al navegador del propietario (sus propios posts, RLS owner) pero **no se renderiza** en v1.
- Permalinks: sólo `https:` y allowlist de host Meta; `rel="noopener noreferrer"`; se renderizan como `href` de React (sin `dangerouslySetInnerHTML`).
- Todo el copy se interpola con `formatSocialMessage` (texto plano), nunca HTML.
- Logs de error sin IDs externos ni contenido.

## 27. Accessibility

- Estructura: `h1` página; `h2` por sección ("Qué merece tu atención", "Lo que sabemos hasta ahora", "Alcance del análisis"); `h3` por tarjeta. Overview como `<section aria-labelledby>` con `<ul>` de plataformas.
- Estado nunca sólo por color: badge con icono + texto; iconos decorativos `aria-hidden`.
- CTA "Ver publicaciones" con `aria-expanded` / `aria-controls`; enlaces externos con texto "Abrir en Facebook (se abre en una pestaña nueva)" (`sr-only` para la parte entre paréntesis) + icono `ExternalLink`.
- Foco visible: `focus-visible:ring-2 ring-v2-primary-500 ring-offset-2` en botones y enlaces; orden de tabulación = orden visual.
- Fechas: `<time dateTime>` con fecha absoluta accesible.
- Carga/actualización: `role="status"` / `aria-live="polite"`, `aria-busy` en la región que se actualiza.
- Contraste: texto principal `v2-text-primary` sobre blanco; secundarios `v2-text-secondary` (#64748B, ≥4.5:1 sobre blanco); badges con pares 50/700.
- `motion-reduce:` para skeleton y transiciones; sin animaciones esenciales.
- Objetivos táctiles ≥44 px en móvil.

## 28. i18n

**Reutilizable directamente (congelado, sin cambios):**
- `social.finding.<TOPIC>.summary` → evidencia "¿Por qué?" y frases de "Lo que sabemos".
- `social.finding.<TOPIC>.title` → títulos de findings de acceso/stale/NO_CONTENT.
- `social.rec.*` (9) → cuerpo de las recomendaciones.
- `formatSocialMessage(lang, key, params, platform)` resuelve `{platform}` y parámetros.

**No reutilizables como etiqueta visible:** títulos de activity (`INTERMEDIATE_ACTIVITY.title` "Última publicación en {platform}" sirve como título de línea, pero las etiquetas cortas del overview requieren claves propias).

**Nuevas claves exclusivamente UI** (en `ui/copy.ts`, objeto local `{es, en}` como el resto de features; ES/EN idénticos en estructura, test de paridad):
- Página: `back`, `title`, `subtitle`, `sourceNote`, `loading`, `errorTemporary`, `retry`, `noBusiness`.
- Secciones: `attentionTitle`, `attentionEmpty`, `knownTitle`, `coverageTitle`, `dataTitle`.
- Overview: `platform.facebook/instagram`, `status.connected|reauth|permission|notConnected|notLinked|rateLimited|syncError|neverSynced|stale`, `activity.recent|intermediate(n)|long|noContent|noDates`, `postsAnalysed(n)` (singular/plural), `historyBuilding`, `updatedAgo(rel)`.
- Tarjetas: `recTitle.<recommendationKey>` (9), `priority.prioritary|toReview`, `why`, `viewPosts`, `hidePosts`, `openOn(platform)`, `newTab`, `windowTruncated`.
- Alcance: `coverage.body`, `coverage.aspect.frequency|contentType|engagement|dates`.
- Acciones: `refresh`, `refreshing`, `refreshCooldown`, `refreshFailed`, `showingLastGood(rel)`, `goToSources`, `connectCta`.
- Empty: `emptyTitle`, `emptyBody`, `emptyNote`.

Formato de fechas relativas con `Intl.RelativeTimeFormat(lang)`; absolutas con `Intl.DateTimeFormat(lang)`.

## 29. Real-data textual wireframe

Snapshot real (A3.5.4.2.1), `evaluatedAt = 2026-10-22T22:31:43Z` (actividad INTERMEDIATE). Nombres de cuenta: se mostrarían `page_name` / `@instagram_username` reales de `meta_connections`; aquí se representan como `‹nombre de la página›` / `@‹usuario›` para no inventarlos.

```
← Volver a Herramientas

Inteligencia Social
Analizamos los datos reales de tus cuentas conectadas de Facebook e Instagram
para mostrarte qué merece atención y qué puedes revisar.
🛡 Solo leemos tus publicaciones. No publicamos ni modificamos nada en Meta.

┌─ [f] Facebook ──────────────────────┐  ┌─ [◎] Instagram ─────────────────────┐
│ ‹nombre de la página›               │  │ @‹usuario›                          │
│ ✓ Conectado                          │  │ ✓ Conectado                          │
│ Última publicación hace 8 días       │  │ Última publicación hace 8 días       │
│ 3 publicaciones analizadas           │  │ 1 publicación analizada              │
│ ⧗ Historial en construcción          │  │ ⧗ Historial en construcción          │
│ Datos actualizados hace 5 h          │  │ Datos actualizados hace 5 h          │
└──────────────────────────────────────┘  └──────────────────────────────────────┘

Qué merece tu atención
┌──────────────────────────────────────────────────────────────── Para revisar ─┐
│ [f] Facebook                                                                  │
│ Revisa el texto de algunas publicaciones                                      │
│ Revisa si las publicaciones sin texto (2) necesitan unas palabras que         │
│ expliquen o den contexto al contenido.                                        │
│ ¿Por qué? Parte del contenido observado en Facebook no incluye texto:         │
│ 2 de 3 publicaciones.                                                         │
│ [ Ver publicaciones ▾ ]                                                       │
│   · Foto · 14 oct 2026        Abrir en Facebook ↗                             │
│   · Foto · 14 oct 2026        Abrir en Facebook ↗                             │
└───────────────────────────────────────────────────────────────────────────────┘

┌─ Lo que sabemos hasta ahora ─────────────┐ ┌─ Alcance del análisis ───────────────┐
│ ◷ Facebook: La última publicación         │ │ ⧗ Historial en construcción          │
│   observada es de hace 8 días completos.  │ │ Facebook · Instagram                 │
│   No se considera actividad reciente ni   │ │ Necesitamos más publicaciones        │
│   una inactividad prolongada.             │ │ sincronizadas para valorar el ritmo  │
│ ◷ Instagram: La última publicación        │ │ de publicación, los formatos y la    │
│   observada es de hace 8 días completos.  │ │ interacción con fiabilidad. Esto     │
│   No se considera actividad reciente ni   │ │ describe los límites del análisis,   │
│   una inactividad prolongada.             │ │ no la situación de tu negocio.       │
└───────────────────────────────────────────┘ │ El análisis será más completo a      │
                                              │ medida que se sincronicen más        │
                                              │ publicaciones.                       │
                                              │ ⓘ Las métricas de interacción de     │
                                              │ Facebook no están disponibles        │
                                              │ actualmente para este análisis.      │
                                              └──────────────────────────────────────┘

Datos del análisis
Última actualización: 22 oct 2026, 17:22 · [ ↻ Actualizar datos ]
```

Contiene exactamente los 6 findings reales y las 3 recomendaciones reales (REVIEW_POSTS_WITHOUT_TEXT en tarjeta; WAIT_FOR_MORE_HISTORY FB+IG en una sola entrada de "Alcance"). Ninguna métrica de interacción, ningún 0, ninguna recomendación adicional. Con `evaluatedAt` anterior a 8 días, las dos líneas de actividad serían "Actividad reciente" (badge success) con la frase RECENT congelada.

## 30. State matrix

| Estado | Header | Tarjeta plataforma | Sección principal | CTA | Semántica aviso/error |
|---|---|---|---|---|---|
| A. Ambas conectadas, datos sanos | Normal | Conectado · actividad · N analizadas · actualizado | Atención: sólo si hay ACTIVE; Lo que sabemos con actividad, frecuencia, formatos, interacción | Según finding (Ver publicaciones) | Neutral/positivo |
| B. Conectadas + historial limitado | Normal | + "Historial en construcción" | Atención (si ACTIVE) + Alcance con una entrada | Ninguno extra | Neutral, nunca ámbar |
| C. FB conectada / IG sin vincular | Normal | IG: "Sin vincular", sin actividad ni conteo | Atención: tarjeta "Instagram todavía no está vinculado" + findings FB | "Ir a Fuentes" | Neutral |
| D. Ninguna conectada | Normal | — | Empty state | "Conectar redes" → /fuentes | Neutral, invitación |
| E. Stale | Normal | "Datos desactualizados" (Clock), sin actividad/conteo | Atención: tarjeta DATA_STALE (1 por plataforma o cross) | "Actualizar datos" | Warning suave |
| F. Reauth requerida | Normal | "Requiere reconexión" (ambas) | Atención: tarjeta única cross "Vuelve a conectar Meta" | "Ir a Fuentes" | Warning |
| G. Permiso no disponible | Normal | "Acceso limitado" en la afectada | Atención: "Revisa los permisos de Meta" + findings de la otra | "Ir a Fuentes" | Warning suave |
| H. Rate limited | Normal | "Pausa temporal de Meta" | Atención: "Meta está limitando temporalmente el acceso…" | Ninguno | Neutral |
| I. Sync error | Normal | "Error temporal" | Atención: "No pudimos actualizar los datos" | Ninguno (pie: Actualizar datos) | Neutral |
| J. Nunca sincronizado | Normal | "Pendiente de sincronizar" | Atención: "Todavía no hemos leído tus publicaciones" | "Actualizar datos" | Neutral |
| K. Sin contenido | Normal | Conectado · "Sin publicaciones observadas" | Atención: NO_CONTENT (finding.title congelado) | Ninguno | Atención suave |
| L. Finding accionable | Normal | Normal | Tarjeta(s) destacadas en Atención | Si existe acción real | Atención (primario/warning suave) |
| M. Sólo informativos | Normal | Normal | Atención: línea "Ahora mismo no hay nada que requiera tu atención con los datos disponibles." + Lo que sabemos | Ninguno | Neutral |
| N. Sin recomendaciones | Normal | Normal | Igual que M; Alcance oculto si no hay limitaciones | Ninguno | Neutral |
| Carga / error lectura | Normal | Skeleton / — | Skeleton / ErrorState | Reintentar | Neutral |

## 31. Proposed component tree

```
src/features/social-intelligence/ui/
  SocialIntelligencePage.tsx        página (ruta /herramientas/social)
  ├─ SocialHeader                   volver + h1 + subtítulo + nota de fuente
  ├─ PlatformOverview               grid 1/2 columnas
  │   └─ PlatformCard ×2            cuenta, badge conexión, actividad, conteo, historial, actualización
  ├─ AttentionSection
  │   └─ AttentionCard (n)          título UI, cuerpo rec, "¿Por qué?", prioridad visual, CTA
  │       └─ PostList               lista desplegable con permalinks (sólo TEXT/CAPTION)
  ├─ KnownSection                   lista compacta de findings informativos
  ├─ CoverageSection                historial en construcción + interacción no disponible
  ├─ AnalysisDataFooter             última actualización + RefreshButton
  ├─ SocialEmptyState               (reutiliza EmptyState)
  └─ SocialLoadingSkeleton
  useSocialIntelligence.ts          carga, evaluación, refresco, estados
  repository.ts                     loadSocialSnapshot (3 SELECT con columnas explícitas)
  viewModel.ts                      función pura: SocialFindingsReport (+ snapshot) → modelo de presentación
                                    (sección, prominencia, etiqueta, CTA, lista de posts con guard)
  copy.ts                           claves UI ES/EN
  __tests__/a3543SocialIntelligenceUi.test.ts
```

El `viewModel` puro concentra toda la lógica de mapeo (§23–24) para que sea testeable sin DOM y los componentes sólo pinten.

Cambios fuera de la carpeta (mínimos, en la fase de implementación): una línea `lazy()` + `<Route>` en `App.tsx`, una entrada en `tools/catalog.ts`, un icono en `TOOL_ICONS`, y actualización consciente de `toolsHub.test.ts`.

## 32. Complexity exclusions

Fuera de la v1: gráficos, filtros, selectores de fecha, pestañas, dashboards configurables, drag & drop, calendario social, compositor/publicación, gestión de comentarios, bandeja de mensajes, generación con IA, Social Score / salud / 0–100 / estrellas / semáforos / porcentajes, tendencias (engagement, seguidores, alcance, rendimiento), comparación con competidores, métricas de ejemplo, integración con Hoy / Plan / Advisor / Twin / Resumen / Action Layer (A3.5.4.4), persistencia de informes, notificaciones.

## 33. Test strategy

Suite `a3543SocialIntelligenceUi.test.ts` (Vitest), principalmente sobre `viewModel` puro + render de componentes clave:

| Área | Casos |
|---|---|
| Datos reales | Snapshot real a 22:31Z → 1 AttentionCard (TEXT_MISSING), 2 líneas Known (INTERMEDIATE), 1 entrada Coverage (FB+IG), línea "interacción no disponible"; a 18:00Z → RECENT |
| NULL vs 0 | Ningún texto renderizado contiene "0 me gusta", "0 interacciones", "engagement: 0"; FB NULL sólo como frase de no disponible; IG 0/0 no se muestra |
| Datos limitados | Exactamente una entrada de historial aunque haya 2 plataformas; tono neutral (sin clases `warning`/`error`) |
| Stale | Sólo tarjeta DATA_STALE; overview sin actividad ni conteo; CTA "Actualizar datos" llama a la sincronización existente (mock) |
| Errores técnicos | 7 blockedReasons → tarjeta correcta, CTA correcto (`/fuentes`, sync o ninguno), cero findings de negocio de la plataforma bloqueada |
| Jerarquía | Atención antes que Known antes que Coverage; INFORMATIONAL nunca en Atención; orden del motor preservado |
| Unsupported | Las 7 claves UNSUPPORTED nunca renderizan aunque se inyecten en un informe manipulado (filtro defensivo) |
| CTA | Sólo existen destinos `/fuentes`, `/negocio`, `/herramientas` y permalinks Meta; guard de consistencia de lista de posts; allowlist de host |
| Responsive | Clases `grid-cols-1 sm:grid-cols-2`, sin `<table>` |
| Accesibilidad | Jerarquía h1/h2/h3, `aria-expanded`, `role="status"`, iconos `aria-hidden`, badges con texto |
| ES/EN | Paridad de claves UI; renderizado completo en ambos idiomas sin `{placeholders}` sin resolver |
| Sin Social Score / métricas falsas | Regex sobre fuentes y salida: score, health, salud, /100, %, estrellas, ranking, trend, reach, alcance, impresiones, ventas, competidor, "engagement bajo"/"low engagement" |
| Secretos | `repository.ts` sin `select('*')`, sin `token`, `user_token_ref`, `appsecret`; listas de columnas explícitas |
| Congelados | Hashes A3.5.4.1 y nuevos hashes A3.5.4.2 (§28 de A3.5.4.2.1) intactos |
| Fronteras | La carpeta `ui/` no importa action-layer, today-intelligence, business-advisor, digital-twin, weekly, roadmap |

Además: suite completa (2189 + nuevos), tsc sin errores nuevos (20 legacy), build.

## 34. Risks

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Duplicar el predicado "sin texto" en UI (hasText no exportado y congelado) | Lista de posts distinta del recuento | Guard de consistencia vs `params.postsWithoutText`; si difiere, se oculta la lista |
| Reloj del dispositivo desfasado como `evaluatedAt` | Actividad/frescura mal clasificadas | Riesgo bajo (umbrales en días); documentado. Alternativa futura: hora del servidor |
| `toolsHub.test.ts` fija 8 herramientas | Fallo de tests al añadir la tarjeta | Actualización consciente en A3.5.4.3 |
| Tarjeta Meta en `/fuentes` congelada | Enlace contextual requeriría tocarla | Enlace opcional; posponer si exige modificarla |
| Sincronizar desde dos sitios (Fuentes y aquí) | Confusión / cooldown | Mismo endpoint y mismo cooldown servidor; mensaje claro de espera |
| `text_content` en memoria del cliente | Exposición percibida | Datos propios bajo RLS owner; no se renderizan |
| Usuario interpreta "Historial en construcción" como problema | Ansiedad | Tono neutral y frase "no la situación de tu negocio" |
| Estados de plataforma múltiples simultáneos | Página confusa | Un único estado dominante por plataforma (blocked > stale > análisis) ya garantizado por el motor |

## 35. Implementation plan (A3.5.4.3)

1. `ui/repository.ts`: `loadSocialSnapshot(businessId)` con 3 SELECT de columnas explícitas.
2. `ui/viewModel.ts`: mapeo puro de §23–24, guard de lista de posts, allowlist de permalinks, filtro UNSUPPORTED.
3. `ui/copy.ts`: claves UI ES/EN (§28).
4. `ui/useSocialIntelligence.ts`: estados loading / ready / refreshing / error, timeout 15 s, refresco vía `syncMetaContent`.
5. Componentes (§31) reutilizando el design system.
6. Ruta `/herramientas/social` (lazy) + entrada de catálogo + icono; actualizar `toolsHub.test.ts`.
7. Tests §33.
8. Validación con datos reales (lectura) + build + tsc + hashes congelados.
9. Informe A3.5.4.3 y fase de validación/freeze separada (A3.5.4.3.1).

Sin cambios en A3.5.4.1, A3.5.4.2, `meta-connection`, migraciones, edge functions ni navegación principal.

## 36. Exact next step

**A3.5.4.3 — SOCIAL INTELLIGENCE UI (implementación)** siguiendo este diseño, en una fase separada, seguida de **A3.5.4.3.1 — validación con datos reales y freeze**. A3.5.4.4 (integración con Hoy / Plan / Advisor / Twin / Resumen / Action Layer) sigue fuera de alcance.

---

GO — SOCIAL INTELLIGENCE UI DESIGN READY FOR IMPLEMENTATION
