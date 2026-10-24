import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import LegalLayout, { MailLink } from './LegalLayout';
import { useConsent } from '../consent/ConsentProvider';
import { useI18n } from '../../lib/i18n';

const INLINE_LINK = 'font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2';

function PreferencesBox({ label, state, action }: { label: string; state: string; action: string }) {
  const { openPreferences } = useConsent();
  return (
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex-1 text-sm text-slate-600">
        {label}{' '}
        <span className="font-semibold text-slate-900">{state}</span>
      </p>
      <button
        type="button"
        onClick={openPreferences}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
      >
        <SlidersHorizontal size={16} />
        {action}
      </button>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  const { lang } = useI18n();
  const { decision } = useConsent();
  const accepted = decision ? decision.advertising : null;
  return lang === 'en' ? <PrivacyEn accepted={accepted} /> : <PrivacyEs accepted={accepted} />;
}

function PrivacyEs({ accepted }: { accepted: boolean | null }) {
  return (
    <LegalLayout
      title="Política de privacidad"
      updated="Última actualización: 24 de octubre de 2026"
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
        <h3>Facebook e Instagram (opcional)</h3>
        <p>
          Si decides conectar la página de Facebook de tu negocio y, si está vinculada, su cuenta profesional de
          Instagram, leemos cierta información de esas cuentas. Lo explicamos en detalle en la{' '}
          <a href="#facebook-instagram" className={INLINE_LINK}>sección 3</a>.
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

      <section id="facebook-instagram">
        <h2>3. Conexión de Facebook e Instagram (opcional)</h2>
        <p>
          Desde la sección «Fuentes» de la aplicación puedes conectar, de forma voluntaria, una página de Facebook que
          administres y, si está vinculada a esa página, la cuenta profesional de Instagram (empresa o creador) de tu
          negocio. La conexión se realiza a través de Meta: tú decides en Meta si concedes los permisos y qué páginas
          compartes, y solo accedemos a las páginas y cuentas que Meta nos autoriza. No accedemos a otras páginas, a
          perfiles personales de otras personas ni a tus mensajes privados.
        </p>
        <h3>Qué información leemos</h3>
        <ul>
          <li>
            <strong className="text-slate-800">De la página de Facebook:</strong> nombre, categoría, descripción, enlace y
            sitio web de la página, y su número de seguidores y de «Me gusta». También sus publicaciones recientes: texto,
            fecha, tipo de publicación, enlace y, cuando Meta los facilita, el número de reacciones y de comentarios.
          </li>
          <li>
            <strong className="text-slate-800">De la cuenta profesional de Instagram:</strong> nombre de usuario, nombre,
            biografía, sitio web y número de seguidores, de cuentas seguidas y de publicaciones. También sus publicaciones
            recientes: texto o pie de foto, fecha, tipo de publicación, enlace y, cuando Meta los facilita, el número de
            «Me gusta» y de comentarios.
          </li>
          <li>
            <strong className="text-slate-800">Sobre la conexión:</strong> un identificador técnico de tu usuario de Meta
            (no tu nombre ni tu correo de Facebook), los permisos concedidos, el estado de la conexión y de cada
            sincronización, la fecha de la última sincronización correcta e información técnica de errores. Si administras
            varias páginas, recibimos temporalmente sus nombres para que elijas la de tu negocio y borramos esa lista al
            terminar la elección.
          </li>
        </ul>
        <p>
          No leemos el texto de los comentarios, los mensajes privados, los datos de anuncios ni la información de las
          personas que siguen o interactúan con tu página o tu cuenta.
        </p>
        <h3>Para qué la usamos</h3>
        <ul>
          <li>Sincronizar la información de tus cuentas cuando lo solicitas desde la aplicación.</li>
          <li>Analizar la presencia en redes sociales de tu negocio y detectar señales objetivas, como la frecuencia o la actividad reciente de tus publicaciones.</li>
          <li>Generar recomendaciones y mostrarte prioridades dentro de LocalSEOHub (por ejemplo, en «Hoy», «Plan» e «Inteligencia Social»).</li>
        </ul>
        <p>
          Este análisis se hace con reglas propias de LocalSEOHub; no enviamos el contenido de tus redes sociales al
          proveedor de inteligencia artificial. No publicamos, programamos ni eliminamos contenido en tus cuentas, no
          respondemos comentarios ni enviamos mensajes y no gestionamos anuncios. No usamos esta información para
          publicidad ni para crear perfiles publicitarios, y no la vendemos.
        </p>
        <h3>Autorización de Meta</h3>
        <p>
          Al conectar, Meta nos entrega una autorización de acceso. Solo la usamos desde nuestros servidores para mantener
          la conexión y leer la información descrita. Se guarda cifrada, no se muestra en tu navegador ni se publica. Nunca
          vemos ni guardamos tu contraseña de Facebook o Instagram. La autorización caduca pasado un tiempo fijado por
          Meta; cuando ocurre, te pedimos que vuelvas a conectar.
        </p>
        <h3>Cuánto tiempo la conservamos</h3>
        <ul>
          <li>Mientras la conexión esté activa, conservamos la información sincronizada para mostrarte el análisis. Cada sincronización la actualiza.</li>
          <li>Si la autorización caduca o la conexión falla, borramos la autorización guardada; la información ya sincronizada se mantiene guardada hasta que vuelvas a conectar o desconectes.</li>
          <li>
            Cuando desconectas, vuelves a conectar o cambias de página, borramos la autorización, los datos de la página y
            de la cuenta de Instagram y todas las publicaciones y datos de sincronización guardados. Solo queda un registro
            técnico mínimo (estado y fechas de la conexión) sin contenido de tus redes.
          </li>
          <li>Si eliminamos tu cuenta a petición tuya, también eliminamos toda esta información.</li>
        </ul>
        <h3>Cómo desconectar</h3>
        <p>
          Puedes desconectar cuando quieras desde «Fuentes», en la tarjeta «Facebook e Instagram», con el botón
          «Desconectar». Al hacerlo también pedimos a Meta que retire los permisos concedidos. Además, puedes retirar el
          acceso desde la configuración de tu cuenta de Facebook, en el apartado de integraciones comerciales. Los pasos
          están en{' '}
          <Link to="/eliminar-datos" className={INLINE_LINK}>Eliminación de datos</Link>.
        </p>
        <h3>Relación con Meta</h3>
        <p>
          Facebook e Instagram son servicios de Meta Platforms. Tu uso de esas plataformas se rige por las condiciones y la
          política de privacidad de Meta. LocalSEOHub es un servicio independiente y no está afiliado, patrocinado ni
          respaldado por Meta.
        </p>
        <h3>Diferencia con el Meta Pixel</h3>
        <p>
          Esta conexión es independiente del Meta Pixel descrito en la sección 6. El Meta Pixel mide el rendimiento de
          nuestras propias campañas publicitarias en nuestra web y solo se activa si lo aceptas. La conexión de Facebook e
          Instagram solo lee la información de tu negocio si tú la conectas. Aceptar o rechazar el Meta Pixel no afecta a
          la conexión, y la información leída de tus cuentas no se envía al Meta Pixel.
        </p>
      </section>

      <section id="finalidades">
        <h2>4. Para qué usamos los datos</h2>
        <ul>
          <li>Crear y gestionar tu cuenta y permitirte iniciar sesión.</li>
          <li>Prestar el servicio: analizar tu negocio, generar recomendaciones y guardar tus resultados.</li>
          <li>Si las conectas, analizar tu ficha de Google y tus cuentas de Facebook e Instagram (sección 3).</li>
          <li>Gestionar tu suscripción y los pagos.</li>
          <li>Enviarte correos necesarios del servicio (verificación de cuenta, recuperación de contraseña).</li>
          <li>Mejorar la aplicación y mantenerla segura.</li>
          <li>Solo si lo aceptas: medir el rendimiento de nuestras campañas publicitarias (ver sección 6).</li>
        </ul>
        <p>No vendemos tus datos personales.</p>
      </section>

      <section id="proveedores">
        <h2>5. Proveedores que intervienen</h2>
        <ul>
          <li><strong className="text-slate-800">Supabase</strong>: alojamiento de la base de datos, autenticación y funciones del servidor.</li>
          <li><strong className="text-slate-800">Stripe</strong>: procesamiento de pagos y suscripciones.</li>
          <li><strong className="text-slate-800">OpenAI</strong>: generación de análisis y textos con inteligencia artificial.</li>
          <li><strong className="text-slate-800">Google</strong>: inicio de sesión con Google y conexión opcional de Google Business Profile. La web también carga tipografías desde Google Fonts.</li>
          <li><strong className="text-slate-800">Resend</strong>: envío de los correos del servicio.</li>
          <li><strong className="text-slate-800">Meta Platforms</strong>: conexión opcional de Facebook e Instagram, solo si la activas (sección 3), y Meta Pixel, solo si aceptas las tecnologías opcionales (sección 6).</li>
          <li><strong className="text-slate-800">Microsoft</strong>: solo si aceptas las tecnologías opcionales (sección 6).</li>
        </ul>
        <p>Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo conforme a sus propias condiciones y garantías.</p>
      </section>

      <section id="cookies">
        <h2>6. Cookies y tecnologías similares</h2>
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
            nuestra web. No tiene relación con la conexión opcional de tus cuentas descrita en la sección 3.
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
        <h2>7. Tu decisión y cómo cambiarla</h2>
        <p>
          Puedes cambiar tu decisión en cualquier momento desde «Preferencias de privacidad», en el pie de página o aquí
          mismo. Si retiras tu permiso, dejamos de enviar datos a partir de ese momento; lo ya enviado no se ve afectado por
          ese cambio.
        </p>
        <PreferencesBox
          label="Tecnologías opcionales:"
          state={accepted === null ? 'sin decidir' : accepted ? 'aceptadas' : 'rechazadas'}
          action="Cambiar preferencias"
        />
      </section>

      <section id="conservacion">
        <h2>8. Cuánto tiempo conservamos los datos</h2>
        <p>
          Conservamos los datos de tu cuenta y de tu negocio mientras tu cuenta esté activa o mientras sean necesarios para
          prestarte el servicio. Cuando solicitas la eliminación de tu cuenta, borramos tus datos, salvo aquellos que debamos
          conservar por obligación legal (por ejemplo, registros de facturación). Los datos que reciben los proveedores
          opcionales se rigen por sus propias políticas de conservación.
        </p>
        <p>La información de Facebook e Instagram sigue las reglas específicas de la sección 3.</p>
      </section>

      <section id="derechos">
        <h2>9. Tus derechos</h2>
        <p>
          Puedes solicitar el acceso, la rectificación, la eliminación o la portabilidad de tus datos, así como oponerte a su
          tratamiento o pedir que se limite. Escríbenos a <MailLink /> desde el correo de tu cuenta. También puedes presentar
          una reclamación ante la autoridad de protección de datos competente.
        </p>
      </section>

      <section id="eliminacion">
        <h2>10. Eliminación de tus datos</h2>
        <p>
          Puedes pedir que eliminemos tu cuenta y tus datos en cualquier momento, y desconectar Facebook e Instagram tú
          mismo desde «Fuentes». Te explicamos cómo hacerlo en{' '}
          <Link to="/eliminar-datos" className={INLINE_LINK}>Eliminación de datos</Link>.
        </p>
      </section>

      <section id="cambios">
        <h2>11. Cambios en esta política</h2>
        <p>Si cambiamos la forma en que tratamos tus datos, actualizaremos esta página y su fecha de actualización.</p>
      </section>
    </LegalLayout>
  );
}

function PrivacyEn({ accepted }: { accepted: boolean | null }) {
  return (
    <LegalLayout
      title="Privacy policy"
      updated="Last updated: 24 October 2026"
      intro={
        <p>
          This policy explains what data LocalSEOHub (localseohub.io) processes, what it is used for, who it is shared with
          and how you can exercise your rights. It describes how the service currently works.
        </p>
      }
    >
      <section id="responsable">
        <h2>1. Who is responsible</h2>
        <p>
          LocalSEOHub is an online service for local businesses, available at localseohub.io. The data controller is the
          owner of the LocalSEOHub service. For any privacy question you can write to <MailLink />.
        </p>
      </section>

      <section id="datos">
        <h2>2. Data we process</h2>
        <h3>Your account data</h3>
        <ul>
          <li>Email address and password (the password is stored encrypted by our authentication provider; we never see it).</li>
          <li>Your name, if you provide it or sign in with Google (in that case Google sends us your name and email).</li>
        </ul>
        <h3>Your business data</h3>
        <ul>
          <li>What you enter in the app: business name, category, city, website, phone, opening hours, services, goals and audience.</li>
          <li>The results we generate and save for you: analyses, plans, tasks, texts and their history.</li>
        </ul>
        <h3>Website and business analysis</h3>
        <p>
          When you give us your website address (or a competitor's), we fetch that public page to analyse it. To generate
          recommendations and texts we send the necessary information about your business to an artificial intelligence
          provider (OpenAI). We do not send it your password or payment details.
        </p>
        <h3>Google Business Profile (optional)</h3>
        <p>
          If you choose to connect your Google Business Profile, Google gives us access to your profile information (for
          example, business details and reviews) so we can show it to you and analyse it. Access credentials are stored
          encrypted on our servers and you can disconnect the profile at any time.
        </p>
        <h3>Facebook and Instagram (optional)</h3>
        <p>
          If you choose to connect your business's Facebook Page and, where linked, its Instagram professional account, we
          read certain information from those accounts. This is explained in detail in{' '}
          <a href="#facebook-instagram" className={INLINE_LINK}>section 3</a>.
        </p>
        <h3>Payments</h3>
        <p>
          Subscriptions are paid through Stripe. You enter your card details directly with Stripe; we neither receive nor
          store them. We only keep your subscription status and technical Stripe references.
        </p>
        <h3>Internal usage statistics</h3>
        <p>
          We record basic usage events in our own database (for example, which screens are visited, device type and
          browser) together with a random session identifier, to improve the product. This data is not shared with third
          parties for advertising purposes.
        </p>
      </section>

      <section id="facebook-instagram">
        <h2>3. Facebook and Instagram connection (optional)</h2>
        <p>
          From the «Fuentes» (Sources) section of the app you can voluntarily connect a Facebook Page you manage and, if it
          is linked to that Page, your business's Instagram professional account (business or creator). The connection is
          made through Meta: you decide in Meta whether to grant the permissions and which Pages to share, and we only
          access the Pages and accounts Meta authorises us to. We do not access other Pages, other people's personal
          profiles or your private messages.
        </p>
        <h3>What information we read</h3>
        <ul>
          <li>
            <strong className="text-slate-800">From the Facebook Page:</strong> the Page's name, category, description, link
            and website, and its number of followers and likes. Also its recent posts: text, date, post type, link and,
            when Meta provides them, the number of reactions and comments.
          </li>
          <li>
            <strong className="text-slate-800">From the Instagram professional account:</strong> username, name, biography,
            website and number of followers, accounts followed and posts. Also its recent posts: text or caption, date,
            post type, link and, when Meta provides them, the number of likes and comments.
          </li>
          <li>
            <strong className="text-slate-800">About the connection:</strong> a technical identifier of your Meta user (not
            your Facebook name or email), the permissions granted, the status of the connection and of each sync, the date
            of the last successful sync and technical error information. If you manage several Pages, we temporarily receive
            their names so you can choose your business's Page, and we delete that list once you have chosen.
          </li>
        </ul>
        <p>
          We do not read the text of comments, private messages, ad data or information about the people who follow or
          interact with your Page or account.
        </p>
        <h3>What we use it for</h3>
        <ul>
          <li>Syncing your accounts' information when you request it in the app.</li>
          <li>Analysing your business's social media presence and detecting factual signals, such as how often or how recently you post.</li>
          <li>Generating recommendations and showing you priorities inside LocalSEOHub (for example, in «Hoy», «Plan» and «Social Intelligence»).</li>
        </ul>
        <p>
          This analysis uses LocalSEOHub's own rules; we do not send your social media content to the artificial
          intelligence provider. We do not publish, schedule or delete content on your accounts, we do not reply to
          comments or send messages, and we do not manage ads. We do not use this information for advertising or to build
          advertising profiles, and we do not sell it.
        </p>
        <h3>Meta authorisation</h3>
        <p>
          When you connect, Meta gives us an access authorisation. We only use it from our servers to maintain the
          connection and read the information described above. It is stored encrypted, it is not shown in your browser and
          it is not published. We never see or store your Facebook or Instagram password. The authorisation expires after a
          period set by Meta; when that happens, we ask you to reconnect.
        </p>
        <h3>How long we keep it</h3>
        <ul>
          <li>While the connection is active, we keep the synced information to show you the analysis. Each sync updates it.</li>
          <li>If the authorisation expires or the connection fails, we delete the saved authorisation; the information already synced remains stored until you reconnect or disconnect.</li>
          <li>
            When you disconnect, reconnect or switch Page, we delete the authorisation, the Page and Instagram account
            details and all saved posts and sync data. Only a minimal technical record (connection status and dates)
            remains, with no content from your social accounts.
          </li>
          <li>If we delete your account at your request, we also delete all of this information.</li>
        </ul>
        <h3>How to disconnect</h3>
        <p>
          You can disconnect at any time from «Fuentes» (Sources), on the «Facebook and Instagram» card, using the
          «Disconnect» button. When you do, we also ask Meta to remove the permissions granted. You can also
          remove access from your Facebook account settings, under business integrations. The steps are described in{' '}
          <Link to="/eliminar-datos" className={INLINE_LINK}>Data deletion</Link>.
        </p>
        <h3>Relationship with Meta</h3>
        <p>
          Facebook and Instagram are services provided by Meta Platforms. Your use of those platforms is governed by Meta's
          terms and privacy policy. LocalSEOHub is an independent service and is not affiliated with, sponsored or endorsed
          by Meta.
        </p>
        <h3>Difference from the Meta Pixel</h3>
        <p>
          This connection is separate from the Meta Pixel described in section 6. The Meta Pixel measures the performance
          of our own advertising campaigns on our website and is only enabled if you accept it. The Facebook and Instagram
          connection only reads your business's information if you connect it. Accepting or rejecting the Meta Pixel does
          not affect the connection, and the information read from your accounts is not sent to the Meta Pixel.
        </p>
      </section>

      <section id="finalidades">
        <h2>4. What we use data for</h2>
        <ul>
          <li>Creating and managing your account and letting you sign in.</li>
          <li>Providing the service: analysing your business, generating recommendations and saving your results.</li>
          <li>If you connect them, analysing your Google profile and your Facebook and Instagram accounts (section 3).</li>
          <li>Managing your subscription and payments.</li>
          <li>Sending you necessary service emails (account verification, password recovery).</li>
          <li>Improving the app and keeping it secure.</li>
          <li>Only if you accept: measuring the performance of our advertising campaigns (see section 6).</li>
        </ul>
        <p>We do not sell your personal data.</p>
      </section>

      <section id="proveedores">
        <h2>5. Providers involved</h2>
        <ul>
          <li><strong className="text-slate-800">Supabase</strong>: database hosting, authentication and server functions.</li>
          <li><strong className="text-slate-800">Stripe</strong>: payment and subscription processing.</li>
          <li><strong className="text-slate-800">OpenAI</strong>: generating analyses and texts with artificial intelligence.</li>
          <li><strong className="text-slate-800">Google</strong>: sign-in with Google and the optional Google Business Profile connection. The website also loads fonts from Google Fonts.</li>
          <li><strong className="text-slate-800">Resend</strong>: sending service emails.</li>
          <li><strong className="text-slate-800">Meta Platforms</strong>: the optional Facebook and Instagram connection, only if you enable it (section 3), and the Meta Pixel, only if you accept optional technologies (section 6).</li>
          <li><strong className="text-slate-800">Microsoft</strong>: only if you accept optional technologies (section 6).</li>
        </ul>
        <p>Some of these providers may process data outside the European Economic Area under their own terms and safeguards.</p>
      </section>

      <section id="cookies">
        <h2>6. Cookies and similar technologies</h2>
        <h3>Essential (always on)</h3>
        <p>
          Browser storage the app needs to work: keeping you signed in, remembering your language, remembering your privacy
          choice and keeping temporary data while you complete a process.
        </p>
        <h3>Optional advertising and measurement (only with your permission)</h3>
        <ul>
          <li>
            <strong className="text-slate-800">Meta Pixel</strong> (Meta Platforms): lets us measure the performance of our
            campaigns on Facebook and Instagram, for example, whether a visit from an ad ends in a sign-up or a subscription.
            Meta may use cookies and receive technical data from your browser and the pages you visit on our website. It is
            unrelated to the optional connection of your accounts described in section 3.
          </li>
          <li>
            <strong className="text-slate-800">Microsoft Clarity</strong> (Microsoft): helps us understand how the website is
            used (for example, clicks and scrolling) so we can improve it.
          </li>
        </ul>
        <p>
          These technologies do not load or send anything until you press «Accept». If you press «Reject», they never load
          and the app works exactly the same.
        </p>
      </section>

      <section id="preferencias">
        <h2>7. Your choice and how to change it</h2>
        <p>
          You can change your choice at any time from «Privacy preferences», in the footer or right here. If you withdraw
          your permission, we stop sending data from that moment; anything already sent is not affected by that change.
        </p>
        <PreferencesBox
          label="Optional technologies:"
          state={accepted === null ? 'not decided' : accepted ? 'accepted' : 'rejected'}
          action="Change preferences"
        />
      </section>

      <section id="conservacion">
        <h2>8. How long we keep data</h2>
        <p>
          We keep your account and business data while your account is active or while it is needed to provide the service.
          When you request deletion of your account, we delete your data, except data we must keep by law (for example,
          billing records). Data received by optional providers is governed by their own retention policies.
        </p>
        <p>Facebook and Instagram information follows the specific rules in section 3.</p>
      </section>

      <section id="derechos">
        <h2>9. Your rights</h2>
        <p>
          You can request access to, rectification, deletion or portability of your data, and you can object to or ask us to
          restrict its processing. Write to <MailLink /> from your account email. You can also file a complaint with the
          competent data protection authority.
        </p>
      </section>

      <section id="eliminacion">
        <h2>10. Deleting your data</h2>
        <p>
          You can ask us to delete your account and your data at any time, and you can disconnect Facebook and Instagram
          yourself from «Fuentes» (Sources). We explain how in{' '}
          <Link to="/eliminar-datos" className={INLINE_LINK}>Data deletion</Link>.
        </p>
      </section>

      <section id="cambios">
        <h2>11. Changes to this policy</h2>
        <p>If we change how we process your data, we will update this page and its update date.</p>
      </section>
    </LegalLayout>
  );
}
