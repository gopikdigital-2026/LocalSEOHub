import { X, Mail } from 'lucide-react';
import { useI18n } from '../lib/i18n';

const CONTACT_EMAIL = 'gopik.digital@gmail.com';

interface ModalProps {
  onClose: () => void;
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 text-sm text-slate-600 leading-relaxed space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ContactModal({ onClose }: ModalProps) {
  const { t } = useI18n();
  return (
    <ModalShell title={t('contact_title')} onClose={onClose}>
      <p className="text-slate-500">{t('contact_desc')}</p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
          <Mail size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">{t('contact_email_label')}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors text-sm"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <p className="text-slate-400 text-xs">
        Intentamos responder en menos de 24 horas en días laborables.
      </p>
    </ModalShell>
  );
}

export type LegalModal = 'contact' | null;
