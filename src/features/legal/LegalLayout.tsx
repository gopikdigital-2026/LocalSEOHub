import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LogoIcon } from '../../components/Logo';
import LegalLinks, { LEGAL_CONTACT_EMAIL } from './LegalLinks';
import { useI18n, type Lang } from '../../lib/i18n';

const CHROME: Record<Lang, { back: string; eyebrow: string; language: string }> = {
  es: { back: 'Volver al inicio', eyebrow: 'Información legal', language: 'Idioma' },
  en: { back: 'Back to home', eyebrow: 'Legal information', language: 'Language' },
};

interface Props {
  title: string;
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}

export default function LegalLayout({ title, updated, intro, children }: Props) {
  const { lang, setLang } = useI18n();
  const chrome = CHROME[lang];

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — LocalSEOHub`;
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoIcon size={24} />
            <span className="text-slate-900 font-bold text-sm">LocalSEOHub.io</span>
          </Link>
          <div className="flex items-center gap-4">
            <div role="group" aria-label={chrome.language} className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {(['es', 'en'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${lang === code ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <Link to="/" aria-label={chrome.back} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{chrome.back}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-12 sm:py-16">
        <article className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-wider uppercase text-emerald-700">{chrome.eyebrow}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">{title}</h1>
          <p className="mt-3 text-sm text-slate-500">{updated}</p>
          {intro && <div className="mt-6 text-base text-slate-700 leading-relaxed">{intro}</div>}
          <div className="mt-10 space-y-10 text-[15px] text-slate-600 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mb-3 [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_p+p]:mt-3 [&_section]:scroll-mt-24">
            {children}
          </div>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 px-5">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-4">
          <LegalLinks />
          <p className="text-xs text-slate-400">
            © 2026 LocalSEOHub.io ·{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="hover:text-slate-600">{LEGAL_CONTACT_EMAIL}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export function MailLink() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2">
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}
