import LegalLayout, { MailLink } from './LegalLayout';
import { useI18n } from '../../lib/i18n';

export default function TermsPage() {
  const { lang } = useI18n();
  return lang === 'en' ? <TermsEn /> : <TermsEs />;
}

function TermsEs() {
  return (
    <LegalLayout title="Términos de Servicio" updated="Última actualización: 24 de octubre de 2026">
      <section>
        <h2>1. Aceptación de los términos</h2>
        <p>Al usar LocalSEOHub aceptas estos términos. Si no estás de acuerdo, no debes utilizar el servicio.</p>
      </section>
      <section>
        <h2>2. Descripción del servicio</h2>
        <p>LocalSEOHub es una plataforma de generación de contenido SEO local mediante inteligencia artificial. Los resultados generados son sugerencias y no garantizamos posicionamiento específico en buscadores.</p>
      </section>
      <section>
        <h2>3. Cuenta de usuario</h2>
        <p>Eres responsable de mantener la confidencialidad de tus credenciales y de todas las actividades realizadas desde tu cuenta. Debes notificarnos inmediatamente ante cualquier uso no autorizado.</p>
      </section>
      <section>
        <h2>4. Suscripción y pagos</h2>
        <p>El servicio se ofrece bajo modalidad de suscripción. Los pagos son procesados por Stripe. Puedes cancelar tu suscripción en cualquier momento; el acceso continúa hasta el final del período facturado.</p>
      </section>
      <section>
        <h2>5. Uso aceptable</h2>
        <p>No está permitido usar LocalSEOHub para generar contenido fraudulento, spam, o actividades contrarias a la ley. Nos reservamos el derecho de suspender cuentas que incumplan estas condiciones.</p>
      </section>
      <section>
        <h2>6. Limitación de responsabilidad</h2>
        <p>LocalSEOHub se proporciona "tal cual". No nos hacemos responsables de pérdidas de negocio derivadas del uso o imposibilidad de uso del servicio.</p>
      </section>
      <section id="integraciones">
        <h2>7. Integraciones con servicios de terceros</h2>
        <p>Solo debes conectar cuentas de negocio, como una página de Facebook, una cuenta de Instagram o una ficha de Google Business Profile, que administres o que estés autorizado a gestionar. Estas integraciones dependen de la disponibilidad y de la autorización de cada plataforma, que se rige por sus propias condiciones, por lo que algunas funciones pueden verse limitadas o interrumpidas si la plataforma cambia o retira el acceso.</p>
      </section>
      <section>
        <h2>8. Contacto</h2>
        <p>Para cualquier consulta sobre estos términos, contáctanos en <MailLink />.</p>
      </section>
    </LegalLayout>
  );
}

function TermsEn() {
  return (
    <LegalLayout title="Terms of Service" updated="Last updated: 24 October 2026">
      <section>
        <h2>1. Acceptance of the terms</h2>
        <p>By using LocalSEOHub you accept these terms. If you do not agree, you must not use the service.</p>
      </section>
      <section>
        <h2>2. Description of the service</h2>
        <p>LocalSEOHub is a platform for generating local SEO content using artificial intelligence. The generated results are suggestions and we do not guarantee any specific search engine ranking.</p>
      </section>
      <section>
        <h2>3. User account</h2>
        <p>You are responsible for keeping your credentials confidential and for all activity carried out from your account. You must notify us immediately of any unauthorised use.</p>
      </section>
      <section>
        <h2>4. Subscription and payments</h2>
        <p>The service is offered on a subscription basis. Payments are processed by Stripe. You can cancel your subscription at any time; access continues until the end of the billed period.</p>
      </section>
      <section>
        <h2>5. Acceptable use</h2>
        <p>You may not use LocalSEOHub to generate fraudulent content, spam or unlawful activity. We reserve the right to suspend accounts that breach these conditions.</p>
      </section>
      <section>
        <h2>6. Limitation of liability</h2>
        <p>LocalSEOHub is provided "as is". We are not liable for business losses arising from the use of, or inability to use, the service.</p>
      </section>
      <section id="integraciones">
        <h2>7. Third-party integrations</h2>
        <p>You must only connect business accounts, such as a Facebook Page, an Instagram account or a Google Business Profile, that you manage or are authorised to manage. These integrations depend on each platform's availability and authorisation, which are governed by that platform's own terms, so some features may be limited or interrupted if the platform changes or withdraws access.</p>
      </section>
      <section>
        <h2>8. Contact</h2>
        <p>For any question about these terms, contact us at <MailLink />.</p>
      </section>
    </LegalLayout>
  );
}
