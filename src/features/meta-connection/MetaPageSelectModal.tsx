import { useState } from 'react';
import { Facebook, Loader2, X, Check } from 'lucide-react';
import { META_COPY, type MetaPage } from './metaStatus';

export function MetaPageSelectModal({ pages, lang, onConfirm, onClose }: {
  pages: MetaPage[];
  lang: 'es' | 'en';
  onConfirm: (pageId: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = META_COPY[lang];
  const [selected, setSelected] = useState<string | null>(pages.length === 1 ? pages[0].id : null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onConfirm(selected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="meta-page-title">
      <div className="w-full sm:max-w-md bg-white rounded-t-v2-xl sm:rounded-v2-xl shadow-v2-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-v2-border">
          <div>
            <h2 id="meta-page-title" className="text-v2-base font-semibold text-v2-text-primary">{t.selectPage}</h2>
            <p className="text-v2-xs text-v2-text-tertiary mt-1 leading-relaxed">{t.selectPageHint}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-v2-md text-v2-text-tertiary hover:bg-v2-neutral-100 transition-colors" aria-label={t.cancel}>
            <X size={16} />
          </button>
        </div>

        <ul className="overflow-y-auto p-3 space-y-2">
          {pages.map((page) => {
            const active = selected === page.id;
            return (
              <li key={page.id}>
                <button
                  onClick={() => setSelected(page.id)}
                  disabled={saving}
                  className={`w-full flex items-center gap-3 p-3 rounded-v2-lg border text-left transition-all ${
                    active ? 'border-v2-primary-500 bg-v2-primary-50 ring-1 ring-v2-primary-500' : 'border-v2-border hover:border-v2-primary-200 hover:bg-v2-neutral-50'
                  }`}
                  aria-pressed={active}
                >
                  <span className="w-8 h-8 rounded-v2-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Facebook size={16} /></span>
                  <span className="flex-1 min-w-0 text-v2-sm font-medium text-v2-text-primary truncate">{page.name}</span>
                  {active && <Check size={16} className="text-v2-primary-600 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-v2-border">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 rounded-v2-lg text-v2-xs font-semibold text-v2-text-secondary hover:bg-v2-neutral-50 transition-colors">
            {t.cancel}
          </button>
          <button
            onClick={() => void confirm()}
            disabled={!selected || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-v2-lg text-v2-xs font-semibold bg-v2-primary-600 text-white hover:bg-v2-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
