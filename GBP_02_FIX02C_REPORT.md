# GBP-02-FIX02C — entrega reconstruida

Fecha: 2026-11-23. Estado: NO APROBADO PARA CONGELACIÓN O DESPLIEGUE.

## Incidencia de entrega
Los informes y el ZIP anunciados previamente no estaban presentes en el proyecto actual. Esta entrega documenta el estado disponible y comprobado ahora, no una reproducción certificada del cierre anterior. La prueba permanente gbp02Fix02cDependencies.test.ts tampoco está disponible: debe recuperarse desde Version History antes de dar por completo el cierre FIX02C. No se han inventado sus resultados.

## Correcciones presentes
- gbp-list-locations/index.ts importa ../activeBusiness.ts, consulta negocios propios y resuelve selección antes de acceder a credenciales. La fuente se consulta por usuario, negocio y google_business, con maybeSingle; ya no por fecha o posición.
- gbp-recover-attempt/index.ts resuelve negocio propio mediante el mismo contrato antes de leer o cancelar/recuperar una tentativa; mantiene actualización condicional por id, usuario, tipo, estado y updated_at.
- engine.ts transmite businessId a gbp-disconnect. Se conserva compatibilidad automática del servidor si se omite.
- El callback no fue modificado durante esta reparación de entrega.

## Auditoría anterior (referencia histórica, no nueva consulta de producción)
La fase 1 registrada en la conversación confirmó el índice UNIQUE businesses_user_id_key sobre businesses(user_id), contradictorio con el trigger de máximo 5. Habilitación del modelo multinegocio DETENIDA. No cambiar índices, límites, migraciones ni RLS.
La asociación OAuth se evaluó por estado exacto + tipo Google + connecting, usuario/negocio guardados en tentativa y credenciales por sourceId. No se certificó concurrencia ni uso único del estado.

## Evidencias del paquete
EVIDENCE_FIX02C incluye registros nuevos de suite, TypeScript, lint y build, inventario SHA-256 y diferencias contra el ZIP FIX02B disponible. Estas diferencias son de instantáneas; no atribuyen automáticamente cualquier divergencia a FIX02C.

## Limitaciones y prohibiciones
- Prueba permanente específica FIX02C AUSENTE. Cierre de validaciones INCOMPLETO hasta recuperarla y ejecutarla.
- Empaquetado Supabase Edge: NOT VERIFIED. No se desplegó ni se ejecutó Deno.
- No se realizaron llamadas reales a Google ni escrituras de base de datos.
- No se modificaron código, guardianes, FB/IG, Stripe, Hoy, Tu Semana, migraciones, RLS ni configuración de producción en esta reparación de entrega.
- Sin selector visual. No se inició FIX03.
- Funciones que permanecen pendientes según el cierre anterior: gbp-oauth-start, gbp-sync, gbp-disconnect, gbp-reviews, gbp-list-locations, gbp-recover-attempt, con activeBusiness.ts.

Detenido para auditoría independiente. ZIP de estado actual, no certificación de cierre original.
