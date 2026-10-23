import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import LegalLayout, { MailLink } from './LegalLayout';

export default function DataDeletionPage() {
  return (
    <LegalLayout
      title="Eliminación de datos"
      updated="Última actualización: 21 de octubre de 2026"
      intro={<p>Cómo pedir que eliminemos tu cuenta de LocalSEOHub y los datos asociados.</p>}
    >
      <section id="quien">
        <h2>1. Quién puede solicitarlo</h2>
        <p>
          La persona titular de una cuenta de LocalSEOHub puede solicitar la eliminación de esa cuenta y de los datos
          asociados (perfil, datos del negocio, análisis, planes, contenidos generados y conexiones, como Google Business
          Profile).
        </p>
      </section>

      <section id="como">
        <h2>2. Cómo solicitarlo</h2>
        <ol>
          <li>Escribe a <MailLink /> con el asunto «Eliminar mi cuenta».</li>
          <li>Envía el mensaje desde el correo electrónico con el que te registraste, para que podamos identificar la cuenta.</li>
          <li>Indica, si quieres, el nombre del negocio asociado para ayudarnos a localizarla.</li>
        </ol>
        <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            Nunca te pediremos tu contraseña, códigos de acceso, credenciales de Google o de otras plataformas, ni datos de
            tu tarjeta. No los incluyas en tu mensaje.
          </p>
        </div>
      </section>

      <section id="despues">
        <h2>3. Qué ocurre después</h2>
        <ul>
          <li>Comprobamos que la solicitud procede del correo de la cuenta. Si no podemos verificarlo, te pediremos que nos escribas desde ese correo.</li>
          <li>Revisamos la solicitud manualmente y eliminamos la cuenta y sus datos asociados.</li>
          <li>Si tienes una suscripción activa, la cancelamos para que no se realicen más cobros.</li>
          <li>Si conectaste Google Business Profile, retiramos nuestro acceso a tu ficha.</li>
          <li>Te confirmamos por correo cuando la eliminación se haya completado.</li>
        </ul>
      </section>

      <section id="conservacion">
        <h2>4. Datos que podemos tener que conservar</h2>
        <p>
          Podemos conservar ciertos datos cuando la ley lo exija, por ejemplo, registros de facturación y pagos. Esos datos
          se conservan solo para esa finalidad. Stripe, como procesador de pagos, mantiene sus propios registros conforme a
          sus obligaciones legales.
        </p>
        <p>
          Los datos que tecnologías opcionales como Meta Pixel hayan recibido con tu permiso se rigen por las políticas de
          esos proveedores. Puedes retirar ese permiso en cualquier momento desde «Preferencias de privacidad».
        </p>
      </section>

      <section id="mas">
        <h2>5. Más información</h2>
        <p>
          Consulta nuestra{' '}
          <Link to="/privacidad" className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2">Política de privacidad</Link>{' '}
          o escríbenos a <MailLink /> si tienes dudas.
        </p>
      </section>
    </LegalLayout>
  );
}
