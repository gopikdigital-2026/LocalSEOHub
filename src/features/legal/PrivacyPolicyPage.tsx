import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import LegalLayout, { MailLink } from './LegalLayout';
import { useConsent } from '../consent/ConsentProvider';

export default function PrivacyPolicyPage() {
  const { decision, openPreferences } = useConsent();

  return (
    <LegalLayout
      title="Política de privacidad"
      updated="Última actualización: 21 de octubre de 2026"
      intro={
        <p>
          Esta política explica qué datos trata LocalSEOHub (localseohub.io), para qué los usa, con quién los comparte y
          cómo puedes ejercer tus derechos. Describe el funcionamiento actual del servicio.
        </p>
      }
    >
      <section id="responsable">
        <h2>1. Quién es responsable</h2>
        <p>
          LocalSEOHub es un servicio online para negocios locales, disponible en localseohub.io. El responsable del
          tratamiento es el titular del servicio LocalSEOHub. Para cualquier cuestión sobre privacidad puedes escribir
          a <MailLink />.
        </p>
      </section>

      <section id="datos">
        <h2>2. Datos que tratamos</h2>
        <h3>Datos de tu cuenta</h3>
        <ul>
          <li>Correo electrónico y contraseña (la contraseña se guarda cifrada por nuestro proveedor de autenticación; nunca la vemos).</li>
          <li>Tu nombre, si lo indicas o si inicias sesión con Google (en ese caso recibimos de Google tu nombre y correo).</li>
        </ul>
        <h3>Datos de tu negocio</h3>
        <ul>
          <li>Lo que introduces en la aplicación: nombre del negocio, categoría, ciudad, sitio web, teléfono, horarios, servicios, objetivos y público.</li>
          <li>Los resultados que generamos y guardamos para ti: análisis, planes, tareas, textos y su historial.</li>
        </ul>
        <h3>Análisis de sitios web y del negocio</h3>
        <p>
          Cuando nos das la dirección de tu web (o la de un competidor), consultamos esa página pública para analizarla.
          Para generar recomendaciones y textos enviamos la información necesaria de tu negocio a un proveedor de
          inteligencia artificial (OpenAI). No le enviamos tu contraseña ni datos de pago.
        </p>
        <h3>Google Business Profile (opcional)</h3>
        <p>
          Si decides conectar tu ficha de Google Business Profile, Google nos da acceso a la información de tu ficha
          (por ejemplo, datos del negocio y reseñas) para mostrártela y analizarla. Las credenciales de acceso se guardan
          cifradas en nuestros servidores y puedes desconectar la ficha cuando quieras.
        </p>
        <h3>Pagos</h3>
        <p>
          Las suscripciones se pagan a través de Stripe. Introduces los datos de tu tarjeta directamente en Stripe;
          nosotros no los recibimos ni los guardamos. Solo conservamos el estado de tu suscripción y referencias técnicas de Stripe.
        </p>
        <h3>Estadísticas internas de uso</h3>
        <p>
          Registramos en nuestra propia base de datos eventos básicos de uso (por ejemplo, qué pantallas se visitan, tipo de
          dispositivo y navegador) junto a un identificador aleatorio de sesión, para mejorar el producto. Estos datos no se
          comparten con terceros con fines publicitarios.
        </p>
      </section>

      <section id="finalidades">
        <h2>3. Para qué usamos los datos</h2>
        <ul>
          <li>Crear y gestionar tu cuenta y permitirte iniciar sesión.</li>
          <li>Prestar el servicio: analizar tu negocio, generar recomendaciones y guardar tus resultados.</li>
          <li>Gestionar tu suscripción y los pagos.</li>
          <li>Enviarte correos necesarios del servicio (verificación de cuenta, recuperación de contraseña).</li>
          <li>Mejorar la aplicación y mantenerla segura.</li>
          <li>Solo si lo aceptas: medir el rendimiento de nuestras campañas publicitarias (ver sección 5).</li>
        </ul>
        <p>No vendemos tus datos personales.</p>
      </section>

      <section id="proveedores">
        <h2>4. Proveedores que intervienen</h2>
        <ul>
          <li><strong className="text-slate-800">Supabase</strong>: alojamiento de la base de datos, autenticación y funciones del servidor.</li>
          <li><strong className="text-slate-800">Stripe</strong>: procesamiento de pagos y suscripciones.</li>
          <li><strong className="text-slate-800">OpenAI</strong>: generación de análisis y textos con inteligencia artificial.</li>
          <li><strong className="text-slate-800">Google</strong>: inicio de sesión con Google y conexión opcional de Google Business Profile. La web también carga tipografías desde Google Fonts.</li>
          <li><strong className="text-slate-800">Resend</strong>: envío de los correos del servicio.</li>
          <li><strong className="text-slate-800">Meta Platforms</strong> y <strong className="text-slate-800">Microsoft</strong>: solo si aceptas las tecnologías opcionales (sección 5).</li>
        </ul>
        <p>Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo conforme a sus propias condiciones y garantías.</p>
      </section>

      <section id="cookies">
        <h2>5. Cookies y tecnologías similares</h2>
        <h3>Esenciales (siempre activas)</h3>
        <p>
          Almacenamiento en tu navegador necesario para que la aplicación funcione: mantener tu sesión iniciada, recordar tu
          idioma, recordar tu decisión sobre privacidad y conservar datos temporales mientras completas un proceso.
        </p>
        <h3>Opcionales de publicidad y medición (solo con tu permiso)</h3>
        <ul>
          <li>
            <strong className="text-slate-800">Meta Pixel</strong> (Meta Platforms): nos permite medir el rendimiento de nuestras
            campañas en Facebook e Instagram, por ejemplo, saber si una visita desde un anuncio termina en un registro o una
            suscripción. Meta puede usar cookies y recibir datos técnicos de tu navegador y de las páginas que visitas en
            nuestra web.
          </li>
          <li>
            <strong className="text-slate-800">Microsoft Clarity</strong> (Microsoft): nos ayuda a entender cómo se usa la web
            (por ejemplo, clics y desplazamiento) para mejorarla.
          </li>
        </ul>
        <p>
          Estas tecnologías no se cargan ni envían nada hasta que pulsas «Aceptar». Si pulsas «Rechazar», no se cargan
          nunca y la aplicación funciona exactamente igual.
        </p>
      </section>

      <section id="preferencias">
        <h2>6. Tu decisión y cómo cambiarla</h2>
        <p>
          Puedes cambiar tu decisión en cualquier momento desde «Preferencias de privacidad», en el pie de página o aquí
          mismo. Si retiras tu permiso, dejamos de enviar datos a partir de ese momento; lo ya enviado no se ve afectado por
          ese cambio.
        </p>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="flex-1 text-sm text-slate-600">
            Tecnologías opcionales:{' '}
            <span className="font-semibold text-slate-900">
              {decision ? (decision.advertising ? 'aceptadas' : 'rechazadas') : 'sin decidir'}
            </span>
          </p>
          <button
            type="button"
            onClick={openPreferences}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            <SlidersHorizontal size={16} />
            Cambiar preferencias
          </button>
        </div>
      </section>

      <section id="conservacion">
        <h2>7. Cuánto tiempo conservamos los datos</h2>
        <p>
          Conservamos los datos de tu cuenta y de tu negocio mientras tu cuenta esté activa o mientras sean necesarios para
          prestarte el servicio. Cuando solicitas la eliminación de tu cuenta, borramos tus datos, salvo aquellos que debamos
          conservar por obligación legal (por ejemplo, registros de facturación). Los datos que reciben los proveedores
          opcionales se rigen por sus propias políticas de conservación.
        </p>
      </section>

      <section id="derechos">
        <h2>8. Tus derechos</h2>
        <p>
          Puedes solicitar el acceso, la rectificación, la eliminación o la portabilidad de tus datos, así como oponerte a su
          tratamiento o pedir que se limite. Escríbenos a <MailLink /> desde el correo de tu cuenta. También puedes presentar
          una reclamación ante la autoridad de protección de datos competente.
        </p>
      </section>

      <section id="eliminacion">
        <h2>9. Eliminación de tus datos</h2>
        <p>
          Puedes pedir que eliminemos tu cuenta y tus datos en cualquier momento. Te explicamos cómo hacerlo en{' '}
          <Link to="/eliminar-datos" className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2">Eliminación de datos</Link>.
        </p>
      </section>

      <section id="cambios">
        <h2>10. Cambios en esta política</h2>
        <p>Si cambiamos la forma en que tratamos tus datos, actualizaremos esta página y su fecha de actualización.</p>
      </section>
    </LegalLayout>
  );
}
