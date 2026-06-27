import { useState, useRef, useEffect } from 'react';
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
  ChevronDown,
  Users,
  Package,
  DollarSign,
  Sparkles,
  PlayCircle,
  CheckCircle2,
  ClipboardCopy,
  Check,
  Mail,
  Image,
  MessageSquare,
  Copy,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DafoData {
  f: string[];
  d: string[];
  o: string[];
  a: string[];
}

interface Tip {
  title: string;
  description: string;
  impact_roi_percentage: number;
}

interface AuditResult {
  dafo: DafoData;
  tips: Tip[];
}

interface TipContent {
  email: { subject: string; body: string };
  caption: string;
  sms: string;
}

interface BusinessContext {
  businessType: string;
  avgTicket: string;
  starProduct: string;
  mainChallenge: string;
  accessToken: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHALLENGE_OPTIONS = [
  'Atraer nuevos clientes (Tráfico)',
  'Aumentar el gasto por visita (Ticket Medio)',
  'Fidelizar y hacer que vuelvan (Retención)',
  'Optimizar el inventario o servicios',
];

const PREVIEW_RESULT: AuditResult = {
  dafo: {
    f: [
      'Producto estrella con alta tasa de recompra demostrada',
      'Fidelidad consolidada de clientes locales recurrentes',
      'Margen operativo saludable que permite reinversión táctica',
    ],
    d: [
      'Baja visibilidad en búsquedas locales de Google y Maps',
      'Sin sistema activo de captura y nurturing de leads',
      'Dependencia excesiva de recomendaciones boca-oreja',
    ],
    o: [
      'Nicho local con competencia escasamente digitalizada',
      'Potencial de monetización por suscripción o membresía',
      'Comunidad en redes sociales sin activar en el sector',
    ],
    a: [
      'Grandes plataformas con presupuestos publicitarios ilimitados',
      'Desplazamiento del consumo hacia el canal online',
      'Presión sobre márgenes por inflación de costes',
    ],
  },
  tips: [
    {
      title: 'Activa Google Business al máximo',
      description:
        'Sube 5 fotos nuevas cada semana, responde cada reseña en menos de 24h y publica un post semanal con tu producto estrella. Los perfiles activos reciben hasta 7× más clics. Activa las preguntas y respuestas frecuentes para aparecer en más búsquedas de intención local.',
      impact_roi_percentage: 18,
    },
    {
      title: 'Tarjeta de fidelización digital',
      description:
        'Implementa una tarjeta de sellos digital con Stamp Me o Stocard — es gratuito y se configura en 20 minutos. Ofrece la 6ª compra a mitad de precio. Fidelizar cuesta 5× menos que captar un cliente nuevo. Añade un incentivo de reactivación automático a los 30 días de inactividad.',
      impact_roi_percentage: 22,
    },
    {
      title: 'Bundle premium de producto estrella',
      description:
        'Combina tu producto estrella con 1-2 complementos de alto margen y véndelo como pack exclusivo a un precio 20-25% superior. Aumenta el ticket sin elevar costes operativos. Preséntalo como edición limitada mensual para generar urgencia de compra y anticipación.',
      impact_roi_percentage: 15,
    },
  ],
};

// ─── DAFO Quadrant config ─────────────────────────────────────────────────────

const DAFO_CONFIG = {
  f: {
    label: 'Fortalezas',
    letter: 'F',
    icon: <TrendingUp size={13} />,
    headerBg: 'bg-emerald-500/10',
    headerBorder: 'border-b border-emerald-500/20',
    cardBg: 'bg-emerald-500/5',
    cardBorder: 'border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  d: {
    label: 'Debilidades',
    letter: 'D',
    icon: <ShieldAlert size={13} />,
    headerBg: 'bg-red-500/10',
    headerBorder: 'border-b border-red-500/20',
    cardBg: 'bg-red-500/5',
    cardBorder: 'border-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
  },
  o: {
    label: 'Oportunidades',
    letter: 'O',
    icon: <Target size={13} />,
    headerBg: 'bg-blue-500/10',
    headerBorder: 'border-b border-blue-500/20',
    cardBg: 'bg-blue-500/5',
    cardBorder: 'border-blue-500/20',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
  },
  a: {
    label: 'Amenazas',
    letter: 'A',
    icon: <AlertCircle size={13} />,
    headerBg: 'bg-orange-500/10',
    headerBorder: 'border-b border-orange-500/20',
    cardBg: 'bg-orange-500/5',
    cardBorder: 'border-orange-500/20',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
  },
} as const;

// ─── DAFO Quadrant ────────────────────────────────────────────────────────────

function DafoQuadrant({ type, items, visible }: { type: keyof typeof DAFO_CONFIG; items: string[]; visible: boolean }) {
  const cfg = DAFO_CONFIG[type];
  return (
    <div
      className={`rounded-xl border ${cfg.cardBorder} ${cfg.cardBg} overflow-hidden flex flex-col
        transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
    >
      <div className={`flex items-center gap-2 px-3.5 py-2 ${cfg.headerBg} ${cfg.headerBorder}`}>
        <span
          className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${cfg.text} border border-current/20`}
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <span className={cfg.text}>{cfg.letter}</span>
        </span>
        <span className={`${cfg.text} font-bold text-xs uppercase tracking-wider`}>{cfg.label}</span>
        <span className={`${cfg.text} ml-auto opacity-70`}>{cfg.icon}</span>
      </div>
      <ul className="p-3.5 space-y-2 flex-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mt-[5px] shrink-0`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── ROI Bar ──────────────────────────────────────────────────────────────────

function RoiBar({ pct, visible }: { pct: number; visible: boolean }) {
  const capped = Math.min(pct, 100);
  const color =
    pct >= 20 ? 'from-emerald-500 to-teal-400' :
    pct >= 12 ? 'from-teal-500 to-cyan-400' :
    'from-sky-500 to-blue-400';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500 font-medium">ROI estimado</span>
        <span className="font-bold text-white">+{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-1000 ease-out`}
          style={{ width: visible ? `${capped}%` : '0%' }}
        />
      </div>
    </div>
  );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
        transition-all duration-200 border
        ${copied
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          : 'bg-slate-800/60 border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600'
        }`}
    >
      {copied ? <Check size={10} /> : <ClipboardCopy size={10} />}
      {label && <span>{copied ? 'Copiado' : label}</span>}
    </button>
  );
}

// ─── Loading Steps ────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  'El agente de IA está preparando tu contenido promocional...',
  'Redactando correo persuasivo para tus clientes...',
  'Optimizando pie de foto para redes sociales...',
  'Creando plantilla SMS/WhatsApp de alta conversión...',
];

// ─── Agent Execution Panel ────────────────────────────────────────────────────

type AgentState = 'idle' | 'loading' | 'done' | 'error';

function AgentPanel({
  visible,
  tip,
  ctx,
}: {
  visible: boolean;
  tip: Tip;
  ctx: BusinessContext;
}) {
  const [state, setState] = useState<AgentState>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [content, setContent] = useState<TipContent | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = async () => {
    if (state === 'loading') return;
    setState('loading');
    setContent(null);
    setRevealed(false);
    setErrMsg('');
    setStepIdx(0);

    // Advance loading text steps for UX
    let step = 0;
    intervalRef.current = setInterval(() => {
      step += 1;
      if (step < LOADING_STEPS.length) setStepIdx(step);
    }, 1100);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-tip-content`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ctx.accessToken}`,
          },
          body: JSON.stringify({
            businessType: ctx.businessType,
            avgTicket: ctx.avgTicket ? Number(ctx.avgTicket) : null,
            starProduct: ctx.starProduct,
            mainChallenge: ctx.mainChallenge,
            tipTitle: tip.title,
            tipDescription: tip.description,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Error al generar contenido');
      setContent(data as TipContent);
      setState('done');
      setTimeout(() => setRevealed(true), 100);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Error desconocido');
      setState('error');
    } finally {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const copyAll = () => {
    if (!content) return;
    const text = [
      `📧 CORREO — Asunto: ${content.email.subject}`,
      content.email.body,
      '',
      `📸 PIE DE FOTO`,
      content.caption,
      '',
      `💬 SMS / WHATSAPP`,
      content.sms,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2500);
    });
  };

  return (
    <div className={`transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>

      {/* Trigger */}
      {state === 'idle' && (
        <button
          onClick={run}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
            border border-slate-700/60 bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/40
            text-slate-400 hover:text-emerald-300 text-xs font-semibold
            transition-all duration-200 group"
        >
          <PlayCircle size={13} className="group-hover:scale-110 transition-transform text-emerald-400" />
          Ejecutar Consejo con IA
        </button>
      )}

      {/* Loading */}
      {state === 'loading' && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative w-7 h-7 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <Zap size={12} className="text-emerald-400" />
              </div>
              <div className="absolute -inset-1 rounded-full border border-emerald-400/30 border-t-emerald-400 animate-spin" />
            </div>
            <p className="text-xs text-emerald-300 font-medium transition-all duration-500 leading-snug">
              {LOADING_STEPS[stepIdx]}
            </p>
          </div>
          <div className="flex gap-1 pl-10">
            {LOADING_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i <= stepIdx ? 'bg-emerald-400' : 'bg-slate-700'
                } ${i === stepIdx ? 'w-5' : 'w-1.5'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/8 p-4">
          <div className="flex items-start gap-2.5 mb-3">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400 leading-relaxed">{errMsg}</p>
          </div>
          <button
            onClick={() => setState('idle')}
            className="text-xs text-slate-500 hover:text-slate-400 underline transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Result */}
      {state === 'done' && content && (
        <div
          className={`mt-3 rounded-xl border border-slate-700/60 bg-slate-900/80 overflow-hidden
            transition-all duration-500 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/50">
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest flex-1">
              Contenido listo para usar
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={run}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                Regenerar
              </button>
              <button
                onClick={copyAll}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
                  transition-all duration-200 border
                  ${allCopied
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-700/60 border-slate-600/60 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
                  }`}
              >
                {allCopied ? <Check size={10} /> : <Copy size={10} />}
                {allCopied ? 'Copiado todo' : 'Copiar todo'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-800/60">

            {/* Email */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Mail size={11} className="text-blue-400" />
                </div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex-1">Correo Promocional</span>
                <CopyBtn text={`Asunto: ${content.email.subject}\n\n${content.email.body}`} label="Copiar" />
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mt-0.5 w-12">Asunto</span>
                  <p className="text-xs text-white font-semibold leading-snug">{content.email.subject}</p>
                </div>
                <div className="border-t border-slate-700/40 pt-2 flex items-start gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mt-0.5 w-12">Cuerpo</span>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{content.email.body}</p>
                </div>
              </div>
            </div>

            {/* Caption */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center shrink-0">
                  <Image size={11} className="text-pink-400" />
                </div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex-1">Pie de Foto (Redes)</span>
                <CopyBtn text={content.caption} label="Copiar" />
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 p-3">
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{content.caption}</p>
              </div>
            </div>

            {/* SMS */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <MessageSquare size={11} className="text-emerald-400" />
                </div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex-1">SMS / WhatsApp</span>
                <CopyBtn text={content.sms} label="Copiar" />
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/40 p-3">
                <p className="text-xs text-slate-300 leading-relaxed font-mono">{content.sms}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/40">
                  <span className="text-[10px] text-slate-600">Longitud</span>
                  <span className={`text-[10px] font-mono font-bold ${content.sms.length > 160 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {content.sms.length} / 160 caracteres
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tip Card ─────────────────────────────────────────────────────────────────

function TipCard({ tip, index, visible, ctx }: { tip: Tip; index: number; visible: boolean; ctx: BusinessContext }) {
  const icons = [<Zap size={15} />, <Users size={15} />, <DollarSign size={15} />];
  const delays = ['delay-100', 'delay-200', 'delay-300'];
  return (
    <div
      className={`rounded-2xl bg-slate-900/60 border border-slate-800/60 p-5 hover:border-slate-700/80
        transition-all duration-500 ${delays[index]} group
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/15 transition-colors mt-0.5">
          {icons[index] ?? <Lightbulb size={15} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-bold text-white leading-snug">{tip.title}</p>
            <span className="shrink-0 inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap">
              <TrendingUp size={9} />
              +{tip.impact_roi_percentage}%
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{tip.description}</p>
        </div>
      </div>

      <RoiBar pct={tip.impact_roi_percentage} visible={visible} />
      <AgentPanel visible={visible} tip={tip} ctx={ctx} />
    </div>
  );
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

function AuditSpinner() {
  const steps = [
    'Analizando el sector y la competencia...',
    'Elaborando análisis DAFO estratégico...',
    'Generando growth hacks personalizados...',
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setStep((s) => (s + 1) % steps.length), 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 min-h-[420px] flex flex-col items-center justify-center gap-6 p-10">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <BarChart2 size={28} className="text-emerald-400" />
        </div>
        <div className="absolute -inset-2">
          <div className="w-full h-full rounded-3xl border-2 border-emerald-500/30 border-t-emerald-400 animate-spin rounded-full" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="text-slate-200 text-sm font-semibold">Generando auditoría de negocio</p>
        <p className="text-slate-500 text-xs transition-all duration-500">{steps[step]}</p>
      </div>
      <div className="flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-500 ${i === step ? 'w-6 bg-emerald-400' : 'w-1.5 bg-slate-700'}`}
          />
        ))}
      </div>
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
  const [resultsVisible, setResultsVisible] = useState(false);

  const canGenerate = businessType.trim().length > 0;

  const ctx: BusinessContext = {
    businessType,
    avgTicket,
    starProduct,
    mainChallenge,
    accessToken: session?.access_token ?? '',
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError('');
    setResult(null);
    setResultsVisible(false);

    try {
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 2200));
        setResult(PREVIEW_RESULT);
        setTimeout(() => setResultsVisible(true), 80);
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
      setTimeout(() => setResultsVisible(true), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="border-b border-slate-800/50 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <BarChart2 size={18} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            AI Business <span className="text-emerald-400">Advisor</span>
          </h1>
        </div>
        <p className="text-slate-400 text-sm max-w-xl">
          Auditoría estratégica con análisis DAFO hiper-localizado y tres growth hacks ultra-específicos para resolver tu mayor cuello de botella.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">

        {/* ── LEFT — Form ── */}
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800/60 p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Target size={15} className="text-emerald-400" />
            <h2 className="font-semibold text-slate-200 text-sm">Diagnóstico de Salud Comercial</h2>
          </div>

          {/* Sector */}
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

          {/* Ticket + Star Product */}
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

          {/* Challenge */}
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
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-400 text-xs leading-relaxed">{error}</p>
            </div>
          )}

          {/* CTA */}
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
                Generando auditoría...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generar Auditoría de Negocio
              </>
            )}
          </button>

          {!result && !loading && (
            <p className="text-center text-xs text-slate-600">Análisis generado en 5-10 segundos con GPT-4o mini</p>
          )}

          {(result || loading) && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 rounded-xl px-3.5 py-2.5 border border-slate-700/50">
              <AlertCircle size={11} className="text-amber-400 shrink-0" />
              <span>Optimizado para: <span className="text-slate-300 font-medium">{mainChallenge}</span></span>
            </div>
          )}
        </div>

        {/* ── RIGHT — Results ── */}
        <div className="space-y-5">

          {!result && !loading && (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 min-h-[420px] flex flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                <BarChart2 size={24} className="text-slate-600" />
              </div>
              <div>
                <p className="text-slate-400 text-sm font-semibold mb-1">Panel de Diagnóstico Estratégico</p>
                <p className="text-slate-600 text-xs max-w-xs leading-relaxed">
                  Completa el formulario con los datos de tu negocio y pulsa "Generar Auditoría" para obtener tu DAFO personalizado y tus 3 growth hacks.
                </p>
              </div>
            </div>
          )}

          {loading && <AuditSpinner />}

          {result && !loading && (
            <>
              {/* DAFO Matrix */}
              <div className={`rounded-2xl bg-slate-900/50 border border-slate-800/60 p-5 shadow-xl transition-all duration-500 ${resultsVisible ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                    <BarChart2 size={12} className="text-slate-400" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Matriz DAFO</h3>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <DafoQuadrant type="f" items={result.dafo.f} visible={resultsVisible} />
                  <DafoQuadrant type="d" items={result.dafo.d} visible={resultsVisible} />
                  <DafoQuadrant type="o" items={result.dafo.o} visible={resultsVisible} />
                  <DafoQuadrant type="a" items={result.dafo.a} visible={resultsVisible} />
                </div>
              </div>

              {/* Tips */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Lightbulb size={13} className="text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                    3 Consejos de Crecimiento Inmediato
                  </h3>
                </div>
                {result.tips.map((tip, i) => (
                  <TipCard key={i} tip={tip} index={i} visible={resultsVisible} ctx={ctx} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
