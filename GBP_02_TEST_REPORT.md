# LocalSEOHub.io — GBP-02 — Informe de pruebas

Fecha: 23/11/2026. No se modificó aplicación, base de datos ni producción. Las dos sondas adicionales usaron el handler existente con dependencias totalmente simuladas; el archivo temporal se eliminó tras la ejecución.

## 1. Resultados ejecutados

| Comprobación | Resultado real | Clasificación |
|---|---|---|
| `npm test -- --reporter=dot` | 97 archivos aprobados; 3.247 tests aprobados; 0 fallidos; salida 0 | Automatizada existente |
| Sonda perfil válido + Reviews HTTP 503 | Assertions aprobadas; reproduce verificación falsa de reseñas | Automatizada adicional, proveedor simulado |
| Sonda perfil HTTP 200 con JSON inválido + Reviews 503 | Assertions aprobadas; reproduce perfil nulo verificado | Automatizada adicional, proveedor simulado |
| `npm run lint` | Salida 1: 48 errores y 10 warnings | Análisis estático, fallido |
| `npm run typecheck` | Salida 2: 20 diagnósticos | Análisis estático, fallido |
| `npm run build` | Salida 0; `built in 12.52s` | Empaquetado local, aprobado |
| Catálogo actual, triggers, RPC, índices y permisos de columnas | Consultas de estructura ejecutadas, sin datos privados | Evidencia de configuración actual de base de datos |
| Conexión real Gopik Digital | Comunicada por el usuario, no repetida por el auditor | Evidencia real declarada de producción |
| Flujo visual/multiusuario/20 pilotos/refresh/revoke reales | No ejecutados | Pendiente de autorización y validación manual |

La suite completa duró 42,23 s según Vitest. Se ejecutó completa, incluyendo los tests GBP, acciones, billing y planes, en lugar de atribuir a GBP-02 las 79 pruebas parciales ejecutadas anteriormente en GBP-01. No se añadieron las sondas temporales al cómputo de 3.247 tests: son dos comprobaciones adicionales separadas.

Los mensajes de errores simulados de proveedores en la suite no se interpretaron como fallos de tests; el resumen final fue 97/97 y 3.247/3.247. Un test que comprueba una respuesta fallida esperada puede pasar correctamente. Asimismo las dos sondas pasan porque verifican que el defecto existe, no porque el producto satisfaga el comportamiento deseado.

## 2. Sondas adicionales: procedimiento y resultados

Se importó `createHandler` de `supabase/functions/gbp-sync/handler.ts`. Se inyectaron autenticación, negocio, fuente, credenciales, escrituras, reloj y fetch simulados. Token ficticio, ninguna conexión a Google/Supabase ni escritura persistente. Se compiló la sonda local a un módulo Node y se ejecutó con `node:assert/strict`. Solo se inspeccionaron los patches recibidos por adaptadores en memoria.

### Sonda A: reseñas no disponibles

Entrada: selección válida `accounts/123`, `locations/456`; ficha con título simulado, HTTP 200; petición de reseñas HTTP 503.

Observado y comprobado con assertions:
- HTTP del handler: 200.
- `success: true`.
- Perfil final: `status: connected` con `verified_at`.
- Fila de reseñas: `status: connected`, `metadata.reviewCount: 0`.

La tarjeta considera verificado ese vínculo por `sourceStatus.ts` y puede presentar cero reseñas. No se comprobó visualmente en navegador. La regla de primeras reseñas no se activa por este 503 porque el perfil no recibe `totalReviews`; ese matiz evita exagerar el resultado.

### Sonda B: perfil ilegible

Entrada: mismo flujo, pero la ficha devuelve el texto `not json` con HTTP 200, y Reviews devuelve HTTP 503.

Observado y comprobado con assertions:
- HTTP del handler: 200, `success: true`.
- Patch final `status: connected`, `verified_at: 2026-11-23T12:00:00.000Z` (reloj simulado).
- `verified_profile.name: null`.
- Fuente de reseñas conectada con contador cero.

Resultado: demuestra que el parseo inválido no impide declarar verificación. No prueba que Google haya emitido esa respuesta en producción.

## 3. Cobertura existente pertinente y lo que no prueba

Entre los archivos revisados y ejecutados dentro de la suite están `gbpListLocations.test.ts`, `a341GbpSecurity.test.ts`, `a3422GbpRecovery.test.ts` y tests de acciones, weekly-plan y billing/premiumAccess.

Se encuentran pruebas sobre autenticación, negocio ajeno, IDs malformados, rechazo de ubicación ficticia, token disponible/renovación simulada, estados de fallo, recuperación temporal, transición syncing→connected, perfil/reseñas simulados, distinción manual/verificado y reglas de acceso. Parte de las pruebas de seguridad comprueba texto de archivos/migraciones: **no equivale a ejecutar un ataque con dos sesiones contra la base actual**. Por eso se contrastaron también los permisos y triggers actuales mediante consultas de estructura.

La suite no demuestra cargas de 20 negocios, despliegue de este mismo código, permisos efectivos de una cuenta Google concreta, revocación real, carreras concurrentes, límites reales de Google ni actualización visual inmediata de Hoy/Tu Semana tras OAuth.

## 4. TypeScript: 20 diagnósticos completos agrupados

19 diagnósticos TS6133 de símbolos no usados:
- `src/App.tsx`: useAuth.
- `src/components/BusinessAuditLanding.tsx`: MessageSquare, category.
- `src/components/ContentGeneratorLanding.tsx`: index, handleStartGenerate.
- `src/components/DiagnosticLanding.tsx`: MessageSquare.
- `src/components/LandingPage.tsx`: Users, Award, Building2, MessageSquare, Clock, Layers, getToolsShowcase, TOOL_COLORS, useReveal, AnimatedCounter.
- `src/components/MetaAdsLanding.tsx`: Check, AlertCircle.
- `src/legacy/components/AdminDashboard.tsx`: supabase.

Un diagnóstico TS2550:
- `src/features/reality-engine/__tests__/a3422GbpRecovery.test.ts:269`: uso de `.at` no incluido en la lib objetivo de TypeScript.

Estos problemas estaban presentes al comenzar los cambios de entregables. El cómputo previo de 20 en la auditoría de Tu Semana es consistente, pero no se dispone de diagnósticos anteriores/baseline verificable para atribuir fecha o autor de introducción. No se aplicó ninguna corrección ni se ocultaron errores.

## 5. Lint

48 errores, 10 warnings, salida 1. Incluye `@typescript-eslint/no-explicit-any` en `supabase/functions/gbp-sync/handler.ts:83`; además aparecen símbolos no usados, bloque vacío en i18n, regex con caracteres de control en publication-adaptations/publication-proposals y avisos de hooks/fast refresh en otras áreas.

Se ejecutó `eslint .` sin autofix y antes de crear la sonda temporal. Las infracciones son anteriores a los entregables de esta auditoría; no existe baseline de lint anterior comprobado para una atribución histórica más precisa. Build aprobado no subsana estos fallos.

## 6. Seguridad: evidencia actual, no ataque activo

Consultas ejecutadas:
- Postura de seguridad actual: RLS, políticas, grants, vistas y funciones.
- Triggers actuales en `businesses`/`connected_sources` y código de sus funciones.
- Definiciones de `gbp_read_credentials` y `gbp_store_credentials`.
- Índices únicos de `connected_sources`.
- `information_schema.column_privileges` para roles anon/authenticated.

Resultado pertinente: ownership `auth.uid()`, trigger server-owned para INSERT/UPDATE GBP/reviews del cliente, SELECT de columnas sin tokens y RPC Vault sin EXECUTE de roles cliente. Índice único usuario/negocio/tipo. Trigger de negocios permite hasta cinco, incompatible con adaptadores que exigen una única fila por usuario. Estas consultas no invocaron los RPC de credenciales y no devolvieron tokens.

No se verificó aislamiento mediante JWT ajeno, cambios persistentes de identificadores o dos usuarios reales. Esos escenarios quedan pendientes, no aprobados implícitamente por el análisis estático.

## 7. Validaciones manuales pendientes

Tras autorización explícita, y sin publicar contenido:
1. Dos usuarios independientes: intentar consultar/sincronizar/desconectar IDs ajenos y verificar denegación.
2. Un usuario con dos negocios, elegir cada negocio y confirmar resolución correcta (actualmente F03).
3. Cuenta con varias ubicaciones y varios grupos/cuentas, comprobar selección, par account/location y aviso de resultado parcial.
4. Renovación de token y revocación reales; fallo de revocación/limpieza y reintento.
5. Perfil y contador válidos, desconocidos y errores 401/403/429/503; preservar evidencia previa y no afirmar cero/verificación falsa.
6. OAuth finalizado seguido de Hoy y Tu Semana sin recargar; desconexión y cuenta con ensayo caducado; distinguir acciones manuales y verificadas.
7. Repeticiones/concurrencia, replays del callback e intento caducado; confirmar invariantes sin mezclar ficha y perfil.
8. Piloto progresivo hasta 20 usuarios con medición de llamadas/cuota. No se certifica carga antes de ejecutarla.

## 8. Entregables y ZIP

El ZIP es `deliverables/localseohub-gbp02-final-audit.zip`. `GBP_02_ARCHIVE_MANIFEST.json` registra archivos distribuidos con tamaño/hash, exclusiones y redacciones de la copia si fueran necesarias. Se excluyen archivos de variables/credenciales, dependencias instaladas, compilados, caches, registros y ZIP históricos. No se incluyen snapshots de base de datos ni secretos del entorno alojado, que no se leyeron.

El empaquetador comprueba CRC, presencia de ambos informes y archivos esenciales, ausencia de nombres prohibidos y escanea el contenido distribuido contra valores privados locales detectados y patrones de credenciales. Los resultados y límites quedan en el manifiesto. Es una comprobación de paquete local, no prueba de inexistencia de secretos desconocidos en servicios externos.

**Conclusión:** automatización existente aprobada; dos defectos nuevos reproducidos; lint y TypeScript fallidos; build aprobado; veredicto funcional NO-GO. No se implementó ninguna propuesta y se requiere autorización expresa antes de continuar.
