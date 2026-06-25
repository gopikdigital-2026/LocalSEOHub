import { X, Mail } from 'lucide-react';
import { useI18n } from '../lib/i18n';

const CONTACT_EMAIL = 'gopik.digital@gmail.com';

interface ModalProps {
  onClose: () => void;
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 shrink-0">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 text-sm text-slate-300 leading-relaxed space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function PrivacyModal({ onClose }: ModalProps) {
  const { t } = useI18n();
  return (
    <ModalShell title={t('privacy_title')} onClose={onClose}>
      <p className="text-slate-500 text-xs">{t('privacy_updated')}</p>

      <section>
        <h3 className="text-white font-semibold mb-1">1. Datos que recopilamos</h3>
        <p>Recopilamos la información que nos proporcionas al crear una cuenta (correo electrónico) y los datos generados al usar la plataforma (productos, ciudades, resultados SEO guardados). No recopilamos datos de pago directamente; los pagos son procesados de forma segura por Stripe.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">2. Uso de los datos</h3>
        <p>Usamos tus datos exclusivamente para prestarte el servicio: autenticarte, guardar tus resultados y mejorar la plataforma. No vendemos ni compartimos tus datos personales con terceros con fines comerciales.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">3. Almacenamiento y seguridad</h3>
        <p>Tus datos se almacenan en servidores seguros proporcionados por Supabase, con cifrado en tránsito (TLS) y en reposo. El acceso está restringido únicamente a tu cuenta mediante políticas de seguridad a nivel de fila (RLS).</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">4. Cookies</h3>
        <p>Utilizamos cookies de sesión estrictamente necesarias para mantener tu sesión activa. No usamos cookies de seguimiento ni publicidad de terceros.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">5. Tus derechos</h3>
        <p>Tienes derecho a acceder, rectificar o eliminar tus datos en cualquier momento. Para ejercer estos derechos, contáctanos en{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-400 hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">6. Contacto</h3>
        <p>Si tienes cualquier pregunta sobre esta política, escríbenos a{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-400 hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </ModalShell>
  );
}

export function TermsModal({ onClose }: ModalProps) {
  const { t } = useI18n();
  return (
    <ModalShell title={t('terms_title')} onClose={onClose}>
      <p className="text-slate-500 text-xs">{t('terms_updated')}</p>

      <section>
        <h3 className="text-white font-semibold mb-1">1. Aceptación de los términos</h3>
        <p>Al usar LocalSEOHub aceptas estos términos. Si no estás de acuerdo, no debes utilizar el servicio.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">2. Descripción del servicio</h3>
        <p>LocalSEOHub es una plataforma de generación de contenido SEO local mediante inteligencia artificial. Los resultados generados son sugerencias y no garantizamos posicionamiento específico en buscadores.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">3. Cuenta de usuario</h3>
        <p>Eres responsable de mantener la confidencialidad de tus credenciales y de todas las actividades realizadas desde tu cuenta. Debes notificarnos inmediatamente ante cualquier uso no autorizado.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">4. Suscripción y pagos</h3>
        <p>El servicio se ofrece bajo modalidad de suscripción. Los pagos son procesados por Stripe. Puedes cancelar tu suscripción en cualquier momento; el acceso continúa hasta el final del período facturado.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">5. Uso aceptable</h3>
        <p>No está permitido usar LocalSEOHub para generar contenido fraudulento, spam, o actividades contrarias a la ley. Nos reservamos el derecho de suspender cuentas que incumplan estas condiciones.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">6. Limitación de responsabilidad</h3>
        <p>LocalSEOHub se proporciona "tal cual". No nos hacemos responsables de pérdidas de negocio derivadas del uso o imposibilidad de uso del servicio.</p>
      </section>

      <section>
        <h3 className="text-white font-semibold mb-1">7. Contacto</h3>
        <p>Para cualquier consulta sobre estos términos, contáctanos en{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-400 hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </ModalShell>
  );
}

export function ContactModal({ onClose }: ModalProps) {
  const { t } = useI18n();
  return (
    <ModalShell title={t('contact_title')} onClose={onClose}>
      <p className="text-slate-400">{t('contact_desc')}</p>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Mail size={18} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">{t('contact_email_label')}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors text-sm"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <p className="text-slate-500 text-xs">
        Intentamos responder en menos de 24 horas en días laborables.
      </p>
    </ModalShell>
  );
}

export type LegalModal = 'privacy' | 'terms' | 'contact' | null;
