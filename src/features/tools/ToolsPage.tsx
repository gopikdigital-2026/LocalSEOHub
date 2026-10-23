import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, FileText, MapPin, Layers, Radar, Globe, MessageSquare, Mic, Clock, Info,
  Sparkles, Database, BarChart3, UserCheck, Gauge, FlaskConical, Star, Share2,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { TOOLS, type ToolDataKind, type ToolId } from './catalog';

const L = {
  es: {
    title: 'Herramientas',
    subtitle: 'Analiza, crea y descubre oportunidades para mejorar la presencia online de tu negocio.',
    notice: 'Las herramientas utilizan la información disponible de tu negocio. Cuando un resultado sea una estimación o una simulación, te lo indicaremos claramente.',
    status: 'Aún no disponible',
    cta: 'En preparación',
    availableStatus: 'Disponible',
    premiumBadge: 'Premium',
    premiumNote: 'Todas las herramientas están incluidas en Premium y en el periodo de prueba.',
    openCta: 'Abrir herramienta',
    listLabel: 'Herramientas',
  },
  en: {
    title: 'Tools',
    subtitle: 'Analyse, create and discover opportunities to improve your business’s online presence.',
    notice: 'Tools use the information available about your business. When a result is an estimate or a simulation, we will tell you clearly.',
    status: 'Not available yet',
    cta: 'In preparation',
    availableStatus: 'Available',
    premiumBadge: 'Premium',
    premiumNote: 'All tools are included in Premium and in the trial period.',
    openCta: 'Open tool',
    listLabel: 'Tools',
  },
} as const;

const TOOL_ICONS: Record<ToolId, ReactNode> = {
  seo: <FileText size={20} />,
  maps: <MapPin size={20} />,
  twin: <Layers size={20} />,
  radar: <Radar size={20} />,
  geo: <Globe size={20} />,
  advisor: <MessageSquare size={20} />,
  voice: <Mic size={20} />,
  reviews: <Star size={20} />,
  social: <Share2 size={20} />,
};

const KIND_ICONS: Record<ToolDataKind, ReactNode> = {
  business_ai: <Sparkles size={12} />,
  sources: <Database size={12} />,
  available_data: <BarChart3 size={12} />,
  user_input: <UserCheck size={12} />,
  estimate: <Gauge size={12} />,
  simulation: <FlaskConical size={12} />,
};

export default function ToolsPage() {
  const { lang } = useI18n();
  const l = lang === 'en' ? L.en : L.es;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{l.title}</h1>
        <p className="text-v2-sm text-v2-text-secondary mt-1">{l.subtitle}</p>
      </div>

      <div className="flex items-start gap-2.5 rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/60 px-4 py-3">
        <Info size={14} className="text-v2-primary-600 mt-0.5 shrink-0" />
        <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{l.notice} {l.premiumNote}</p>
      </div>

      <ul aria-label={l.listLabel} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {TOOLS.map((tool) => {
          const copy = lang === 'en' ? tool.copy.en : tool.copy.es;
          return (
            <li
              key={tool.id}
              data-testid="tool-card"
              data-tool={tool.id}
              className="group flex flex-col rounded-v2-xl border border-v2-border-light bg-white p-5 transition-all duration-200 hover:border-v2-primary-200 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-v2-lg bg-v2-primary-50 text-v2-primary-600 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                  {TOOL_ICONS[tool.id]}
                </div>
                {tool.enabled ? (
                  <div className="flex items-center gap-1.5">
                    <span data-testid="tool-premium" className="inline-flex items-center rounded-full bg-v2-primary-50 px-2 py-0.5 text-[11px] font-medium text-v2-primary-700">
                      {l.premiumBadge}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-v2-success-50 px-2 py-0.5 text-[11px] font-medium text-v2-success-700">
                      <CheckCircle2 size={11} />
                      {l.availableStatus}
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-v2-neutral-100 px-2 py-0.5 text-[11px] font-medium text-v2-text-secondary">
                    <Clock size={11} />
                    {l.status}
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-v2-base font-semibold text-v2-text-primary">{copy.name}</h2>
              <p className="mt-1 flex-1 text-v2-sm text-v2-text-secondary leading-relaxed">{copy.description}</p>

              <p className="mt-4 inline-flex items-center gap-1.5 self-start rounded-v2-md border border-v2-border-light bg-v2-neutral-50 px-2 py-1 text-[11px] font-medium text-v2-text-secondary">
                {KIND_ICONS[tool.dataKind]}
                {copy.indicator}
              </p>

              {tool.enabled ? (
                <Link
                  to={tool.path}
                  data-testid="tool-open"
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white transition-colors hover:bg-v2-primary-700"
                >
                  {copy.cta ?? l.openCta}
                  <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="mt-4 w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-2.5 text-v2-sm font-medium text-v2-text-tertiary cursor-not-allowed"
                >
                  {l.cta}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
