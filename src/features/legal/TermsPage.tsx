import LegalLayout from './LegalLayout';

// Approved terms text, unchanged from the former landing modal (including its contact address).
const TERMS_CONTACT_EMAIL = 'gopik.digital@gmail.com';

export default function TermsPage() {
  return (
    <LegalLayout title="Términos de Servicio" updated="Última actualización: junio 2026">
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
      <section>
        <h2>7. Contacto</h2>
        <p>Para cualquier consulta sobre estos términos, contáctanos en{' '}
          <a href={`mailto:${TERMS_CONTACT_EMAIL}`} className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2">{TERMS_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
