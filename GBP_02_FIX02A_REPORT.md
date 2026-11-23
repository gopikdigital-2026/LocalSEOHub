# GBP-02-FIX02A — Bloqueo de resolución multinegocio

## Veredicto: NO-GO para cerrar FIX02A

No se ha implementado la corrección. Se aplica la condición expresa: «Si no existe un mecanismo fiable para determinar el negocio activo, detenerse y documentarlo antes de inventar uno».

## Evidencia concreta

- `src/features/business-memory/BusinessContext.tsx`: `BusinessContextValue` no ofrece selección/cambio de negocio ni acepta un identificador activo. `load()` llama a `resolveBusiness(uid)`. `businessId` procede exclusivamente de `currentBusiness?.id`. Las asignaciones a `setCurrentBusiness` cargan, actualizan o borran el registro; no seleccionan otro negocio.
- `src/features/business-memory/businessRepository.ts`: `fetchOwnBusiness()` consulta `businesses` mediante `user_id` y `maybeSingle()`. `resolveBusiness()` no recibe un identificador. Con varias filas no hay resolución inequívoca.
- Búsqueda en `src` de `activeBusiness`, `selectedBusiness`, `currentBusinessId`, `setCurrentBusiness`, `setBusinessId`, `switchBusiness` y persistencia del identificador activo: no se encontró un mecanismo de selección multinegocio.
- `src/features/reviews/repository.ts`: `loadReviews()` transmite solamente `action: 'list'`; `draftReply()` tampoco transmite negocio. `ReviewsPage.tsx` no proporciona identificador en esas llamadas.

Un UUID enviado por el navegador puede validarse en servidor por propietario, pero esa validación no crea por sí misma una elección del negocio activo en el flujo actual. Adoptar un parámetro de URL o una preferencia almacenada ahora sería inventar un mecanismo nuevo, no reutilizar uno existente.

## Dependencia que requiere decisión

Autorizar explícitamente un contrato no visual para la elección del negocio activo y definir de dónde procede su identificador (por ejemplo, una selección explícita transmitida por navegación). No se propone elegir el primero, reutilizar una ficha arbitraria ni deducir el negocio por cuenta Google.

Los endpoints podrían corregirse de forma independiente para aceptar negocio explícito y rechazar ambigüedad, pero eso no habilitaría el flujo de la interfaz para un segundo negocio. No se inició una implementación parcial porque la instrucción exige detenerse al comprobar la ausencia del mecanismo fiable.

## Inventario de cambios y hashes

No se modificó ningún archivo de producción ni test. No hay hashes anteriores/posteriores distintos de código que registrar. Los hashes de los guardianes permanecen intactos. Los únicos entregables nuevos son este informe, el informe de pruebas y el ZIP de diagnóstico actualizado; su manifiesto incluye SHA-256 de cada entrada.

Las correcciones F01/F02 y FIX01A permanecen sin cambios. No se tocaron Facebook, Instagram, Hoy, Tu Semana, Stripe, migraciones, RLS, secretos ni configuración de producción. No hubo llamadas reales a Google, publicación, despliegue ni inicio de FIX03. `gbp-sync` continúa sin desplegar.

## Riesgos y limitaciones

F03 sigue abierto: los endpoints y el contexto aún no resuelven múltiples negocios. Las comprobaciones actuales no demuestran aislamiento multinegocio ni autorizan un piloto multinegocio. No se añadieron regresiones permanentes de una corrección inexistente; quedan pendientes junto con la implementación.

## Entrega

`GBP_02_FIX02A_REPORT.md`, `GBP_02_FIX02A_TEST_REPORT.md` y `deliverables/localseohub-gbp02-fix02a.zip` documentan el bloqueo, no una corrección terminada. El ZIP conserva el proyecto de FIX01A, incorpora los informes actuales y los registros de comprobación. Se solicita la decisión anterior antes de continuar.
