import { AnimatePresence, motion } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ConsentDecision } from '../../lib/consent';

interface Props {
  open: boolean;
  current: ConsentDecision | null;
  onAccept: () => void;
  onReject: () => void;
  onClose?: () => void;
}

const CHOICE_BUTTON =
  'flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-900 bg-slate-900 text-white ' +
  'hover:bg-slate-800 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ConsentBanner({ open, current, onAccept, onReject, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-title"
          aria-describedby="consent-desc"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed z-[70] inset-x-0 bottom-0 sm:inset-x-auto sm:left-6 sm:bottom-6 sm:max-w-md"
        >
          <div className="m-3 sm:m-0 rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/10 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="consent-title" className="text-slate-900 font-semibold text-base leading-tight">Tu privacidad</h2>
                <p id="consent-desc" className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  Usamos tecnologías esenciales para que la aplicación funcione, como mantener tu sesión. Si lo aceptas,
                  también usaremos tecnologías opcionales (Meta Pixel y Microsoft Clarity) para medir el rendimiento de
                  nuestras campañas y entender cómo se usa la web. La aplicación funciona igual si las rechazas.
                </p>
                <Link to="/privacidad" className="inline-block mt-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2">
                  Política de privacidad
                </Link>
                {current && (
                  <p className="mt-2 text-xs text-slate-500">
                    Tu elección actual: <span className="font-semibold text-slate-700">{current.advertising ? 'aceptadas' : 'rechazadas'}</span>
                    {formatDate(current.decidedAt) && ` (${formatDate(current.decidedAt)})`}
                  </p>
                )}
              </div>
              {onClose && (
                <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 transition-colors -mt-1 -mr-1 p-1">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={onReject} className={CHOICE_BUTTON}>Rechazar</button>
              <button type="button" onClick={onAccept} className={CHOICE_BUTTON}>Aceptar</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
