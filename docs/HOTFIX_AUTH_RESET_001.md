# HOTFIX AUTH-RESET-001 — Recuperación de contraseña

Fecha: 2026-10-12 · Estado final: **PARCIAL** (ver sección F)

## A. Auditoría inicial

**Componentes identificados**
- `src/components/LoginModal.tsx`: único formulario email + contraseña en uso. Lo usan `/` (landing, por `#login`/`#registro` o botones), `/login` y `/signup`.
- `CopilotLanding`, `GrowthPlanLanding`, `BusinessAuditLanding`, `ContentGeneratorLanding`, `DiagnosticLanding`, `PotentialLanding`, `MetaAdsLanding`: tienen formularios propios, pero **no están importados por ninguna ruta** (código no alcanzable). No se han modificado.
- `LandingPage.tsx`: no tiene campo de contraseña; abre `LoginModal`.

**Arquitectura de autenticación**
- Cliente único `src/lib/supabase.ts` (supabase-js 2.57.4, auth-js 2.71.1), con la configuración por defecto: `flowType: 'implicit'` y `detectSessionInUrl: true`.
- No hay AuthContext: `useAuth` y `useOnboardingStatus` se suscriben a `onAuthStateChange`.
- Guards en `src/app-v2/auth.tsx`: `AppGuard`, `OnboardingGuard` y `useAuthRedirect`.
- Las rutas públicas `/`, `/login` y `/signup` redirigen al panel cuando hay sesión.
- Retornos validados en `src/app-v2/returnTo.ts`, con lista `AUTH_PATHS`.
- Registro mediante la función `signup-instant` seguido de `signInWithPassword`. Google con `signInWithOAuth`.
- i18n propio en `src/lib/i18n.tsx` (`useI18n().t`, ES/EN, idioma guardado en localStorage). `LoginModal` tenía todo el texto en español fijo.

**Problemas encontrados**
1. No existía ninguna implementación de recuperación de contraseña.
2. **Carrera con la URL.** El cliente de Supabase procesa el `#access_token…&type=recovery` de forma asíncrona y después borra el hash. Una página cargada en diferido (lazy) podía llegar tarde y no ver el enlace.
3. **Redirección indebida.** Si Supabase no acepta el `redirectTo` y usa la Site URL (`/`), `RootRoute` detecta la sesión de recuperación y manda al usuario a `/hoy` sin pedirle la contraseña nueva.
4. **Riesgo de enumeración.** Los límites de envío por dirección de Supabase (`over_email_send_rate_limit`, «For security purposes…») solo se disparan para cuentas existentes. Mostrarlos como error revelaría qué correos están registrados.
5. **Comportamiento de la librería.** Un enlace con error en la URL hace que supabase-js cierre la sesión local existente en ese navegador. Es comportamiento de la librería y se documenta, no se altera.

## B. Implementación

**Archivos creados**
- `src/features/password-reset/recovery.ts`: lógica pura y testeable.
  - Captura y clasificación del enlace: hash implícito, `token_hash`, `code` PKCE y errores.
  - Validación de email y de contraseña (6–72 caracteres; 6 es el mínimo vigente en el registro y 72 el límite de bcrypt).
  - Solicitud a Supabase y clasificación de errores sin enumeración.
  - Establecimiento de la sesión de recuperación.
  - Actualización de la contraseña y cierre de sesiones.
- `src/features/password-reset/ForgotPasswordForm.tsx`: formulario «Recuperar contraseña».
- `src/features/password-reset/ResetPasswordPage.tsx`: página `/reset-password`, con selector ES/EN.
- `src/features/password-reset/__tests__/passwordReset.test.ts`: 58 pruebas.
- `docs/HOTFIX_AUTH_RESET_001.md`: este informe.

**Archivos modificados**
- `src/components/LoginModal.tsx`:
  - enlace «¿Olvidaste tu contraseña?» bajo el campo Contraseña, alineado a la derecha y solo en modo login;
  - vista de recuperación dentro del modal;
  - prop `initialRecovering`.
  - Login, registro y Google no cambian.
- `src/App.tsx`:
  - ruta pública `/reset-password`, fuera de todos los guards;
  - redirección a `/reset-password` cuando un enlace de recuperación llega a otra página (conserva hash y query);
  - `/login?recuperar=1` abre el modal directamente en recuperación.
- `src/main.tsx`: captura del enlace con `captureRecoveryLink(window.location.href)` antes del primer render. Supabase solo borra el hash después de una petición de red, así que la captura síncrona siempre llega antes. El resultado se pasa a `App` por props.
- `src/app-v2/returnTo.ts`: `/reset-password` añadido a `AUTH_PATHS`, para que no pueda usarse como destino `next`.
- `src/lib/i18n.tsx`: 45 claves `reset_*` en ES y EN.

**Rutas añadidas:** `/reset-password` (pública). `public/_redirects` ya sirve la SPA para cualquier ruta (`/* /index.html 200`).

**Flujo**
1. Login → «¿Olvidaste tu contraseña?» → formulario con el email ya rellenado.
2. `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`.
3. Mensaje genérico y espera de 60 s antes de poder reenviar.
4. Correo (SMTP de Resend configurado en Supabase) → `/reset-password`.
5. Estado «Comprobando el enlace…».
6. Según el formato del enlace:
   - hash implícito: `getSession()`, que espera a que el cliente procese la URL;
   - `token_hash`: `verifyOtp({ type: 'recovery' })`;
   - `code`: `exchangeCodeForSession`.
7. Se limpia la URL con `history.replaceState`.
8. Formulario con nueva contraseña y confirmación → `updateUser({ password })`.
9. `signOut({ scope: 'global' })`, con `local` como respaldo → confirmación → «Iniciar sesión».
10. Estados de error: caducado, no válido o sin enlace, cada uno con «Solicitar un enlace nuevo».

## C. Seguridad

- **Enumeración.** El mensaje es siempre «Si existe una cuenta asociada a este correo, recibirás un enlace…».
  - Los límites por dirección se tratan como envío correcto.
  - Solo el límite por IP (`over_request_rate_limit` / 429), que Supabase evalúa antes de buscar la cuenta, muestra un aviso de frecuencia.
  - La espera de 60 s se aplica igual a todas las direcciones.
- **Tokens.**
  - Solo se usan mecanismos oficiales de Supabase.
  - El enlace se guarda únicamente en memoria (estado de React).
  - La URL se limpia tras procesarse.
  - No hay `console`, analítica, localStorage ni sessionStorage en el flujo.
  - Las contraseñas solo viven en el estado del formulario y se vacían tras el éxito.
- **Validación del estado.**
  - El formulario solo se muestra en la fase `ready`, que solo se alcanza tras verificar el enlace.
  - Sin enlace, la página muestra «Falta el enlace»; tampoco con una sesión normal abierta se ofrece el cambio.
  - Un `access_token` sin `type=recovery` se rechaza.
  - La verificación se ejecuta una sola vez aunque React repita el efecto (StrictMode), porque los tokens son de un solo uso.
- **Caducidad.**
  - `otp_expired` en la URL o en la verificación → pantalla de enlace caducado.
  - Si la sesión expira a mitad (sesión ausente, 401/403, `session_not_found`, `reauthentication_needed`) → pantalla de caducado.
- **Sin redirección abierta.** `redirectTo` es siempre el origen actual + ruta fija, sin parámetros del usuario. `/reset-password` está excluida de `next`.
- **Sesiones.**
  - Tras cambiar la contraseña se cierran todas las sesiones de esa cuenta, por si otra persona tenía la antigua.
  - No afecta a otros usuarios.
- **Google OAuth.**
  - El botón y su `redirectTo` no cambian.
  - Las redirecciones OAuth (incluidas las de error) fuera de `/reset-password` no se interpretan como recuperación.
  - Un usuario que solo usa Google recibe la misma respuesta genérica. Si existe la cuenta, Supabase le envía el enlace y podrá fijar una contraseña; no se crea ninguna cuenta.
- **Política de contraseña.**
  - En el cliente: 6–72 caracteres.
  - El servidor manda: `weak_password` muestra los motivos traducidos (longitud, caracteres, filtrada) y `same_password` tiene su propio mensaje.

## D. Pruebas

**Ejecutadas**
- `vitest run`: 26 archivos y **602 pruebas superadas**: las 544 previas más 58 nuevas, que cubren los 16 puntos.
- `tsc`: 20 errores, los mismos que antes. Ninguno está en archivos nuevos. El aviso de `useAuth` sin uso en `App.tsx` ya existía.
- `eslint .`: 23 errores y 7 avisos, igual que la línea base. Ninguno en archivos nuevos.
- `npm run build`: correcto. `ResetPasswordPage` sale en un fragmento separado de 7,5 kB.

**Matriz** (archivo `passwordReset.test.ts`)

| # | Prueba | Tipo |
|---|---|---|
| 1 | Enlace visible, solo en login, bajo la contraseña | Inspección de código fuente |
| 2 | Apertura y vuelta del formulario, email prellenado, `?recuperar` | Inspección de código fuente |
| 3 | Validación de email; sin llamada a Supabase si es inválido | Lógica |
| 4 | Llamada exacta a `resetPasswordForEmail` y `redirectTo`; antidoble envío; sin credenciales | Lógica + inspección de código fuente |
| 5 | 429 por IP, email inválido, red, error genérico; sin mensajes crudos | Lógica |
| 6 | Límites por dirección = envío correcto; mensaje genérico | Lógica |
| 7 | Ruta pública sin guards, captura previa, redirección desde `/`, URL ajenas ignoradas | Lógica + inspección de código fuente |
| 8 | Enlace válido: hash, `token_hash`, `code`; verificación única | Lógica |
| 9 | Caducado, no válido, reutilizado, sin sesión, PKCE fallido | Lógica |
| 10 | No coinciden, demasiado corta, demasiado larga | Lógica |
| 11 | `updateUser`, cierre de sesiones con respaldo, limpieza, errores de política | Lógica |
| 12 | Sin enlace no hay formulario; sesión caducada; sin almacenamiento ni logs | Lógica + inspección de código fuente |
| 13 | Redirecciones de Google no confundidas; usuario solo-Google | Lógica |
| 14 | Claves ES = EN, todas las usadas existen, textos requeridos | Inspección de código fuente |
| 15 | Clases responsive y accesibilidad | Inspección de código fuente |
| 16 | Login, registro, `minLength` y reglas de retorno sin cambios | Inspección de código fuente |

**Limitaciones**
- El proyecto no tiene entorno DOM (ni jsdom ni Testing Library) y no se han añadido dependencias. Las pruebas de interfaz (1, 2, 14, 15, 16) son inspecciones del código fuente, no renderizados.
- **No se ha ejecutado una prueba real** de envío, recepción y cambio: el entorno no puede recibir correos ni abrir un navegador.
- No se ha visto el diseño en móvil ni en escritorio; solo se ha revisado el código.

**Errores pendientes:** ninguno conocido en el código.

## E. Configuración manual (no verificable desde aquí)

No hay acceso de lectura a la configuración de Auth del panel de Supabase (URL, plantillas, SMTP). Pendiente de comprobar en **Supabase Dashboard → Authentication**:

1. **URL Configuration → Redirect URLs**: incluir
   - `https://localseohub.io/reset-password`;
   - los dominios de vista previa o desarrollo que se usen, por ejemplo `http://localhost:5173/reset-password`.

   Si falta, Supabase envía al usuario a la Site URL. La app lo redirige igualmente a `/reset-password` (resiliencia añadida), pero conviene configurarlo.
2. **Site URL**: `https://localseohub.io`, no una URL de desarrollo.
3. **Email Templates → Reset Password**:
   - debe contener `{{ .ConfirmationURL }}`. Es el formato por defecto y compatible.
   - Si se personaliza con `{{ .TokenHash }}`, el enlace debe ser `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`, también soportado.
   - No hace falta modificar la plantilla y no se ha tocado.
4. **SMTP (Resend)**: no se ha modificado. Comprobar que el remitente está verificado en Resend.
5. **Rate Limits → emails**: con SMTP propio, el límite por hora es configurable; conviene revisarlo.
6. **Password policy** (Providers → Email): la app muestra los motivos de rechazo del servidor. Si se sube el mínimo por encima de 6, hay que alinear el texto «Mínimo 6 caracteres».

## F. Estado final: **PARCIAL**

El flujo está implementado, probado automáticamente (58 pruebas nuevas, 602 en total) y compila sin regresiones. No se declara COMPLETADO porque, según las propias restricciones del hotfix:
- no se ha superado una prueba real de envío, recepción y cambio de contraseña;
- no se ha podido verificar que `/reset-password` esté en las Redirect URLs ni revisar la plantilla de correo.

Pasos para cerrar:
1. Configurar lo indicado en la sección E.
2. Prueba manual con una cuenta real:
   - solicitar el enlace;
   - recibir el correo;
   - cambiar la contraseña;
   - iniciar sesión con la nueva.
3. Comprobar en esa prueba:
   - enlace reutilizado → «no válido»;
   - enlace antiguo → «caducado»;
   - correo inexistente → mismo mensaje genérico.

**Comportamientos a conocer**
- Al abrir un enlace válido, Supabase inicia sesión de recuperación. Si el usuario abandona la página sin cambiar la contraseña, queda con sesión iniciada; es el comportamiento estándar de Supabase.
- Si el usuario recarga la página tras validar el enlace, verá «Falta el enlace»; por seguridad no se reutiliza el estado.
