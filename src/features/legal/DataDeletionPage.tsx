import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import LegalLayout, { MailLink } from './LegalLayout';
import { useI18n } from '../../lib/i18n';

const INLINE_LINK = 'font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2';

function SecretsWarning({ children }: { children: string }) {
  return (
    <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-900">{children}</p>
    </div>
  );
}

export default function DataDeletionPage() {
  const { lang } = useI18n();
  return lang === 'en' ? <DataDeletionEn /> : <DataDeletionEs />;
}

function DataDeletionEs() {
  return (
    <LegalLayout
      title="Eliminación de datos"
      updated="Última actualización: 24 de octubre de 2026"
      intro={
        <p>
          Cómo pedir que eliminemos tu cuenta de LocalSEOHub y los datos asociados, y cómo desconectar Facebook e
          Instagram y eliminar la información obtenida de esas cuentas.
        </p>
      }
    >
      <section id="quien">
        <h2>1. Quién puede solicitarlo</h2>
        <p>
          La persona titular de una cuenta de LocalSEOHub puede solicitar la eliminación de esa cuenta y de los datos
          asociados (perfil, datos del negocio, análisis, planes, contenidos generados y conexiones, como Google Business
          Profile o Facebook e Instagram).
        </p>
      </section>

      <section id="como">
        <h2>2. Cómo solicitarlo</h2>
        <ol>
          <li>Escribe a <MailLink /> con el asunto «Eliminar mi cuenta».</li>
          <li>Envía el mensaje desde el correo electrónico con el que te registraste, para que podamos identificar la cuenta.</li>
          <li>Indica, si quieres, el nombre del negocio asociado para ayudarnos a localizarla.</li>
        </ol>
        <SecretsWarning>
          Nunca te pediremos tu contraseña, códigos de acceso, credenciales de Google o de otras plataformas, ni datos de
          tu tarjeta. No los incluyas en tu mensaje.
        </SecretsWarning>
      </section>

      <section id="despues">
        <h2>3. Qué ocurre después</h2>
        <ul>
          <li>Comprobamos que la solicitud procede del correo de la cuenta. Si no podemos verificarlo, te pediremos que nos escribas desde ese correo.</li>
          <li>Revisamos la solicitud manualmente y eliminamos la cuenta y sus datos asociados.</li>
          <li>Si tienes una suscripción activa, la cancelamos para que no se realicen más cobros.</li>
          <li>Si conectaste Google Business Profile, retiramos nuestro acceso a tu ficha.</li>
          <li>Si conectaste Facebook e Instagram, eliminamos la conexión, la autorización de Meta y toda la información sincronizada de esas cuentas.</li>
          <li>Te confirmamos por correo cuando la eliminación se haya completado.</li>
        </ul>
      </section>

      <section id="facebook-instagram">
        <h2>4. Datos de Facebook e Instagram</h2>
        <p>
          Si conectaste la página de Facebook de tu negocio y, si estaba vinculada, su cuenta profesional de Instagram,
          LocalSEOHub guarda: los datos públicos de la página y de la cuenta (nombre, categoría o biografía, sitio web y
          número de seguidores), sus publicaciones recientes (texto, fecha, tipo, enlace y número de reacciones, «Me gusta»
          y comentarios cuando Meta los facilita), el estado de la conexión y de las sincronizaciones, y una autorización
          de acceso de Meta guardada cifrada. Usamos esta información solo para analizar la presencia en redes de tu
          negocio y mostrarte recomendaciones. El detalle está en la{' '}
          <Link to="/privacidad#facebook-instagram" className={INLINE_LINK}>Política de privacidad</Link>.
        </p>

        <h3>Cómo eliminarlos tú mismo, sin escribirnos</h3>
        <ol>
          <li>Inicia sesión en LocalSEOHub.</li>
          <li>Abre «Fuentes» en el menú.</li>
          <li>Busca la tarjeta «Facebook e Instagram».</li>
          <li>Pulsa el botón «Desconectar» (el icono de enlace roto) y confirma.</li>
        </ol>

        <h3>Qué ocurre al desconectar</h3>
        <ul>
          <li>Borramos la autorización de acceso de Meta que teníamos guardada, así que no podemos volver a leer tus cuentas.</li>
          <li>Pedimos a Meta que retire los permisos que concediste a LocalSEOHub.</li>
          <li>Borramos los datos de la página y de la cuenta de Instagram y todas las publicaciones y datos de sincronización guardados.</li>
          <li>Solo conservamos un registro técnico mínimo (estado y fechas de la conexión), sin contenido de tus redes. Se elimina junto con tu cuenta si nos pides borrarla.</li>
        </ul>
        <p>
          Si más adelante vuelves a conectar, empezamos de cero y solo leemos de nuevo la información que vuelvas a
          autorizar.
        </p>

        <h3>Retirar el acceso desde Facebook</h3>
        <p>
          También puedes retirar el acceso de LocalSEOHub desde la configuración de tu cuenta de Facebook, en el apartado
          de integraciones comerciales. Desde ese momento no podemos sincronizar más información, pero los datos ya
          guardados en LocalSEOHub no se borran hasta que pulses «Desconectar» en «Fuentes» o nos pidas eliminarlos. Por
          eso te recomendamos desconectar también desde LocalSEOHub.
        </p>

        <h3>Si no puedes acceder a tu cuenta</h3>
        <p>
          Escribe a <MailLink /> desde el correo de tu cuenta con el asunto «Eliminar datos de Facebook e Instagram».
          Revisaremos la solicitud y te confirmaremos por correo cuando hayamos eliminado esa información.
        </p>
      </section>

      <section id="conservacion">
        <h2>5. Datos que podemos tener que conservar</h2>
        <p>
          Podemos conservar ciertos datos cuando la ley lo exija, por ejemplo, registros de facturación y pagos. Esos datos
          se conservan solo para esa finalidad. Stripe, como procesador de pagos, mantiene sus propios registros conforme a
          sus obligaciones legales.
        </p>
        <p>
          Los datos que tecnologías opcionales como Meta Pixel hayan recibido con tu permiso se rigen por las políticas de
          esos proveedores. Puedes retirar ese permiso en cualquier momento desde «Preferencias de privacidad». El Meta
          Pixel es independiente de la conexión de Facebook e Instagram descrita en la sección 4.
        </p>
      </section>

      <section id="mas">
        <h2>6. Más información</h2>
        <p>
          Consulta nuestra{' '}
          <Link to="/privacidad" className={INLINE_LINK}>Política de privacidad</Link>{' '}
          o escríbenos a <MailLink /> si tienes dudas.
        </p>
      </section>
    </LegalLayout>
  );
}

function DataDeletionEn() {
  return (
    <LegalLayout
      title="Data deletion"
      updated="Last updated: 24 October 2026"
      intro={
        <p>
          How to ask us to delete your LocalSEOHub account and its associated data, and how to disconnect Facebook and
          Instagram and delete the information obtained from those accounts.
        </p>
      }
    >
      <section id="quien">
        <h2>1. Who can request it</h2>
        <p>
          The holder of a LocalSEOHub account can request deletion of that account and its associated data (profile,
          business data, analyses, plans, generated content and connections, such as Google Business Profile or Facebook
          and Instagram).
        </p>
      </section>

      <section id="como">
        <h2>2. How to request it</h2>
        <ol>
          <li>Write to <MailLink /> with the subject «Delete my account».</li>
          <li>Send the message from the email address you signed up with, so we can identify the account.</li>
          <li>If you wish, include the name of the associated business to help us find it.</li>
        </ol>
        <SecretsWarning>
          We will never ask for your password, access codes, Google or other platform credentials, or card details. Do not
          include them in your message.
        </SecretsWarning>
      </section>

      <section id="despues">
        <h2>3. What happens next</h2>
        <ul>
          <li>We check that the request comes from the account email. If we cannot verify it, we will ask you to write from that email.</li>
          <li>We review the request manually and delete the account and its associated data.</li>
          <li>If you have an active subscription, we cancel it so no further charges are made.</li>
          <li>If you connected Google Business Profile, we remove our access to your profile.</li>
          <li>If you connected Facebook and Instagram, we delete the connection, the Meta authorisation and all information synced from those accounts.</li>
          <li>We confirm by email once the deletion is complete.</li>
        </ul>
      </section>

      <section id="facebook-instagram">
        <h2>4. Facebook and Instagram data</h2>
        <p>
          If you connected your business's Facebook Page and, where linked, its Instagram professional account, LocalSEOHub
          stores: the public details of the Page and account (name, category or biography, website and number of
          followers), their recent posts (text, date, type, link and number of reactions, likes and comments when Meta
          provides them), the status of the connection and syncs, and a Meta access authorisation stored encrypted. We use
          this information only to analyse your business's social media presence and show you recommendations. Details are
          in the{' '}
          <Link to="/privacidad#facebook-instagram" className={INLINE_LINK}>Privacy policy</Link>.
        </p>

        <h3>How to delete it yourself, without writing to us</h3>
        <ol>
          <li>Sign in to LocalSEOHub.</li>
          <li>Open «Fuentes» (Sources) in the menu.</li>
          <li>Find the «Facebook and Instagram» card.</li>
          <li>Press the «Disconnect» button (the broken link icon) and confirm.</li>
        </ol>

        <h3>What happens when you disconnect</h3>
        <ul>
          <li>We delete the Meta access authorisation we had stored, so we can no longer read your accounts.</li>
          <li>We ask Meta to remove the permissions you granted to LocalSEOHub.</li>
          <li>We delete the Page and Instagram account details and all saved posts and sync data.</li>
          <li>We only keep a minimal technical record (connection status and dates), with no content from your social accounts. It is deleted together with your account if you ask us to delete it.</li>
        </ul>
        <p>If you reconnect later, we start from scratch and only read again the information you authorise again.</p>

        <h3>Removing access from Facebook</h3>
        <p>
          You can also remove LocalSEOHub's access from your Facebook account settings, under business integrations. From
          then on we cannot sync any more information, but the data already stored in LocalSEOHub is not deleted until you
          press «Disconnect» in «Fuentes» (Sources) or ask us to delete it. That is why we recommend also disconnecting from
          LocalSEOHub.
        </p>

        <h3>If you cannot access your account</h3>
        <p>
          Write to <MailLink /> from your account email with the subject «Delete Facebook and Instagram data». We will
          review the request and confirm by email once we have deleted that information.
        </p>
      </section>

      <section id="conservacion">
        <h2>5. Data we may need to keep</h2>
        <p>
          We may keep certain data when required by law, for example, billing and payment records. That data is kept only
          for that purpose. Stripe, as payment processor, keeps its own records in line with its legal obligations.
        </p>
        <p>
          Data that optional technologies such as the Meta Pixel received with your permission is governed by those
          providers' policies. You can withdraw that permission at any time from «Privacy preferences». The Meta Pixel is
          separate from the Facebook and Instagram connection described in section 4.
        </p>
      </section>

      <section id="mas">
        <h2>6. More information</h2>
        <p>
          See our{' '}
          <Link to="/privacidad" className={INLINE_LINK}>Privacy policy</Link>{' '}
          or write to <MailLink /> if you have questions.
        </p>
      </section>
    </LegalLayout>
  );
}
