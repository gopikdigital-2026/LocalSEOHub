# HOTFIX USER-NAME-001 — Nombre mostrado en el dashboard

Estado: **COMPLETADO** (verificado con tests automáticos y con los datos reales de los 10 usuarios, en solo lectura). Falta una revisión visual en el navegador.

## Causa raíz
- El saludo (`DashboardHeader`) recibía solo `businessName={profile.name}` desde `TodayPage`. Como `ownerName` nunca se pasaba, `displayName = ownerName || businessName` mostraba el nombre comercial: «Gopik.Digital».
- El menú (`AppShellV2`, escritorio y móvil) usaba `user_metadata.name`, que Google rellena («ManuelJ.Pérez»). Si no había nombre, usaba el prefijo del email.
- Problemas añadidos del saludo: estaba fijado en español, sin tilde («Buenos dias»), y la fecha siempre se mostraba en `es-ES`.
- `profiles.full_name` es `null` en esta cuenta: se creó por email y Google se vinculó después. El trigger solo copia el nombre al crear la cuenta.

## Usuarios afectados (consulta de solo lectura, 10 usuarios)
| Perfil | Metadatos | Negocio | Usuarios | Antes (saludo / menú) | Ahora (ambos) |
|---|---|---|---|---|---|
| no | sí | sí | 2 | negocio / nombre | nombre |
| sí | sí | sí | 1 | negocio / nombre | nombre del perfil |
| no | sí | no | 2 | – / nombre | nombre |
| sí | sí | no | 1 | – / nombre | nombre del perfil |
| no | no | no | 4 | – / prefijo del email | neutro |

Ningún nombre personal coincide con un nombre de negocio. No se ha modificado ningún dato.

## Lógica nueva (única fuente)
`src/features/user-identity/personalName.ts` → `resolvePersonalName()`:
1. `profiles.full_name`
2. `user_metadata.full_name`
3. `user_metadata.name`
4. `null`, que se muestra como «Buenas tardes, te damos la bienvenida» / «Good afternoon, welcome» en el saludo y como «Mi cuenta» / «My account» en el menú.

Se descartan los valores vacíos, los emails, el prefijo del email del usuario, los textos sin letras, los de más de 80 caracteres y cualquier valor igual al nombre del negocio activo.

`usePersonalName()` lee solo la propia fila de `profiles` (permitido por RLS, sin escrituras) y la combina con los metadatos. Mientras carga, no muestra ningún nombre, para evitar que aparezca uno y cambie a otro. El saludo y `UserIdentity` (menú de escritorio y móvil) usan este mismo hook. El saludo usa las claves i18n `mc_greeting_*` según la hora (<7 noche, <13 mañana, <20 tarde) y formatea la fecha según el idioma.

## Archivos
- Nuevos:
  - `src/features/user-identity/personalName.ts`
  - `src/features/user-identity/usePersonalName.ts`
  - `src/features/user-identity/UserIdentity.tsx`
  - `src/features/user-identity/__tests__/personalName.test.ts`
- Modificados:
  - `src/features/dashboard/DashboardHeader.tsx`
  - `src/app-v2/routes/TodayPage.tsx`
  - `src/app-v2/layouts/AppShellV2.tsx`
  - `src/lib/i18n.tsx` (claves `identity_*`)

## Pruebas
12 tests nuevos cubren:
- nombre personal con negocio;
- nombre personal sin negocio;
- usuario sin nombre;
- metadatos de Google;
- alta por email sin metadatos;
- prioridad del perfil;
- rechazo de emails y del nombre del negocio;
- franjas horarias;
- textos ES/EN;
- conexión del saludo y de los dos menús con el mismo hook, sin escrituras.

Suite completa: 614/614. `tsc`: 20 errores, los mismos que ya había. ESLint no da errores en los archivos tocados. Build: OK.

Google OAuth, registro, recuperación de contraseña, Stripe y suscripciones no se han tocado (sus tests siguen en verde).

## Riesgos / pendientes
- Se lanza una consulta pequeña a `profiles` por cada lugar donde se muestra el nombre (hasta 3).
- Si un usuario no tiene nombre, verá el texto neutro hasta que exista un lugar donde añadirlo. Hoy la app no tiene un formulario para editar el nombre personal.
- El nombre se muestra tal como lo da Google («ManuelJ.Pérez», sin espacio). No se ha corregido porque no se deben sobrescribir datos personales.
- Falta la revisión visual en el navegador (en este entorno no hay navegador).
