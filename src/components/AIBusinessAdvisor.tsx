import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart2,
  Loader2,
  AlertCircle,
  TrendingUp,
  ShieldAlert,
  Target,
  Lightbulb,
  Zap,
  ChevronRight,
  Users,
  Package,
  DollarSign,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SwotData {
  fortalezas: string[];
  debilidades: string[];
  oportunidades: string[];
  amenazas: string[];
}

interface Tip {
  title: string;
  description: string;
  roi: string;
}

interface AuditResult {
  swot: SwotData;
  tips: Tip[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHALLENGE_OPTIONS = [
  'Atraer nuevos clientes (Tráfico)',
  'Aumentar el gasto por visita (Ticket Medio)',
  'Fidelizar y hacer que vuelvan (Retención)',
  'Optimizar el inventario o servicios',
];

const PREVIEW_RESULT: AuditResult = {
  swot: {
    fortalezas: [
      'Producto estrella con alta tasa de recompra',
      'Fidelidad consolidada de clientes locales',
      'Margen operativo saludable para reinversión',
    ],
    debilidades: [
      'Baja visibilidad en búsquedas locales online',
      'Sin sistema de captura de leads activo',
      'Dependencia de recomendaciones boca-oreja',
    ],
    oportunidades: [
      'Nicho local poco digitalizado — ventaja competitiva',
      'Potencial de ventas recurrentes por suscripción',
      'Redes sociales sin explotar en el sector',
    ],
    amenazas: [
      'Entrada de competidores con mayor presupuesto digital',
      'Cambio de hábitos hacia el comercio online',
      'Sensibilidad al precio por presión inflacionaria',
    ],
  },
  tips: [
    {
      title: 'Activa Google Business Profile al máximo',
      description:
        'Sube 5 fotos nuevas cada semana, responde cada reseña en menos de 24h y añade un post semanal con tu producto estrella. Los perfiles activos reciben hasta 7× más clics que los abandonados.',
      roi: '+18% tráfico local',
    },
    {
      title: 'Lanza un bono de fidelización digital',
      description:
        'Crea una tarjeta de sellos digital con una app gratuita como Stamp Me o Stocard. Ofrece la 6ª compra a mitad de precio. Fidelizar cuesta 5× menos que captar un cliente nuevo.',
      roi: '+22% retención mensual',
    },
    {
      title: 'Bundle premium de tu producto estrella',
      description:
        'Empaqueta tu producto estrella con 1-2 complementos y véndelo como pack a un precio 20% superior. Aumenta el ticket medio sin elevar costes operativos ni cambiar tu flujo de trabajo.',
      roi: '+15% ticket medio',
    },
  ],
};

// ─── SWOT Quadrant ────────────────────────────────────────────────────────────

const SWOT_CONFIG = {
  fortalezas: {
    label: 'Fortalezas',
    letter: 'F',
    icon: <TrendingUp size={14} />,
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/20',
    header: 'bg-emerald-500/12 border-b border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300',
  },
  debilidades: {
    label: 'Debilidades',
    letter: 'D',
    icon: <ShieldAlert size={14} />,
    bg: 'bg-red-500/8',
    border: 'border-red-500/20',
    header: 'bg-red-500/12 border-b border-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
    badge: 'bg-red-500/15 border-red-500/25 text-red-300',
  },
  oportunidades: {
    label: 'Oportunidades',
    letter: 'O',
    icon: <Target size={14} />,
    bg: 'bg-blue-500/8',
    border: 'border-blue-500/20',
    header: 'bg-blue-500/12 border-b border-blue-500/20',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/15 border-blue-500/25 text-blue-300',
  },
  amenazas: {
    label: 'Amenazas',
    letter: 'A',
    icon: <AlertCircle size={14} />,
    bg: 'bg-orange-500/8',
    border: 'border-orange-500/20',
    header: 'bg-orange-500/12 border-b border-orange-500/20',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
    badge: 'bg-orange-500/15 border-orange-500/25 text-orange-300',
  },
};

function SwotQuadrant({ type, items }: { type: keyof typeof SWOT_CONFIG; items: string[] }) {
  const cfg = SWOT_CONFIG[type];
  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden flex flex-col`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 ${cfg.header}`}>
        <span className={`${cfg.text} font-bold text-xs`}>{cfg.letter}</span>
        <span className={`${cfg.text} font-semibold text-xs uppercase tracking-wider`}>{cfg.label}</span>
        <span className={cfg.text}>{cfg.icon}</span>
      </div>
      <ul className="p-4 space-y-2 flex-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mt-1.5 shrink-0`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Tip Card ─────────────────────────────────────────────────────────────────

function TipCard({ tip, index }: { tip: Tip; index: number }) {
  const icons = [<Zap size={16} />, <Users size={16} />, <DollarSign size={16} />];
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-5 hover:border-slate-700/80 transition-colors group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/15 transition-colors">
            {icons[index] ?? <Lightbulb size={16} />}
          </div>
          <p className="text-sm font-semibold text-white leading-snug">{tip.title}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap">
          <TrendingUp size={10} />
          {tip.roi}
        </span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{tip.description}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIBusinessAdvisor({
  session,
  previewMode,
}: {
  session: Session;
  previewMode?: boolean;
}) {
  const [businessType, setBusinessType] = useState('');
  const [avgTicket, setAvgTicket] = useState('');
  const [starProduct, setStarProduct] = useState('');
  const [mainChallenge, setMainChallenge] = useState(CHALLENGE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);

  const canGenerate = businessType.trim().length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 1600));
        setResult(PREVIEW_RESULT);
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-business-audit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            businessType,
            avgTicket: avgTicket ? Number(avgTicket) : null,
            starProduct,
            mainChallenge,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Error al generar la auditoría');
      setResult(data as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <BarChart2 size={18} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            AI Business <span className="text-emerald-400">Advisor</span>
          </h1>
        </div>
        <p className="text-slate-400 text-sm max-w-xl mt-2">
          Diagnóstico estratégico completo con análisis DAFO y tres consejos de crecimiento inmediato personalizados para tu negocio.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">

        {/* ── LEFT — Form ──────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800/60 p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Target size={15} className="text-emerald-400" />
            <h2 className="font-semibold text-slate-200 text-sm">Diagnóstico de Salud Comercial</h2>
          </div>

          {/* Business Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Package size={11} className="text-slate-500" />
              Tipo de Negocio / Sector <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="Ej: Peluquería, Restaurante, Tienda de ropa..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm
                text-slate-100 placeholder-slate-600 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
            />
          </div>

          {/* Avg Ticket + Star Product */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={11} className="text-slate-500" />
                Ticket Medio (€)
              </label>
              <input
                type="number"
                min={0}
                value={avgTicket}
                onChange={(e) => setAvgTicket(e.target.value)}
                placeholder="Ej: 35"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm
                  text-slate-100 placeholder-slate-600 outline-none transition-all duration-200
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={11} className="text-slate-500" />
                Producto Estrella
              </label>
              <input
                type="text"
                value={starProduct}
                onChange={(e) => setStarProduct(e.target.value)}
                placeholder="Ej: Corte + color"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm
                  text-slate-100 placeholder-slate-600 outline-none transition-all duration-200
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
              />
            </div>
          </div>

          {/* Main Challenge */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={11} className="text-slate-500" />
              Tu Mayor Reto Actual
            </label>
            <div className="relative">
              <select
                value={mainChallenge}
                onChange={(e) => setMainChallenge(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm
                  text-slate-100 outline-none transition-all duration-200 appearance-none cursor-pointer
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
              >
                {CHALLENGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-800 text-slate-100">
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronRight
                size={14}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-400 text-xs leading-relaxed">{error}</p>
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !canGenerate}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm
              transition-all duration-300 bg-gradient-to-r from-emerald-500 to-teal-500
              hover:from-emerald-400 hover:to-teal-400 text-slate-950
              shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35
              disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generando auditoría con IA...
              </>
            ) : (
              <>
                <BarChart2 size={15} />
                Generar Auditoría de Negocio
              </>
            )}
          </button>

          {!result && !loading && (
            <p className="text-center text-xs text-slate-600">
              El análisis tarda aproximadamente 5-10 segundos
            </p>
          )}
        </div>

        {/* ── RIGHT — Results ───────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Empty state */}
          {!result && !loading && (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[420px]">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                <BarChart2 size={24} className="text-slate-600" />
              </div>
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">Diagnóstico Estratégico</p>
                <p className="text-slate-600 text-xs max-w-xs">
                  Rellena el formulario y pulsa "Generar Auditoría" para obtener tu análisis DAFO personalizado y tus 3 consejos de crecimiento.
                </p>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
                <div className="h-4 w-32 bg-slate-800 rounded mb-4" />
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl bg-slate-800/60 h-32" />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
                <div className="h-4 w-48 bg-slate-800 rounded mb-4" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-xl bg-slate-800/60 h-20" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* SWOT Matrix */}
              <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-5 shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                    <BarChart2 size={13} className="text-slate-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Matriz DAFO</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SwotQuadrant type="fortalezas" items={result.swot.fortalezas} />
                  <SwotQuadrant type="debilidades" items={result.swot.debilidades} />
                  <SwotQuadrant type="oportunidades" items={result.swot.oportunidades} />
                  <SwotQuadrant type="amenazas" items={result.swot.amenazas} />
                </div>
              </div>

              {/* Growth Tips */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Lightbulb size={14} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                    3 Consejos de Crecimiento Inmediato
                  </h3>
                </div>
                {result.tips.map((tip, i) => (
                  <TipCard key={i} tip={tip} index={i} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
