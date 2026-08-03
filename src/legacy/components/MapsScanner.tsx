import React, { useState, useEffect } from 'react';
import {
  Search,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  Globe,
  Lightbulb,
  Sparkles,
  MapPinned,
  Building2,
  Tag,
  FileText,
  Clock,
  CheckSquare,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../lib/i18n';

// ─── Types & Interfaces ────────────────────────────────────────────────────────

type ScanStatus = 'idle' | 'searching' | 'done';

interface AuditRec {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  optimized_text: string;
}

interface CheckItem {
  id: string;
  label: string;
  category: 'critical' | 'improvable' | 'optimized';
  checked: boolean;
}

interface ReviewAuditResult {
  businessName?: string;
  totalReviewsEstimate?: number;
  avgRating?: string;
  sentiment?: {
    positive: number;
    negative: number;
    label: string;
    summary: string;
  };
  praised?: { concept: string; frequency: string; score: number; examplePhrase: string }[];
  criticized?: { concept: string; frequency: string; severity: number; examplePhrase: string; improvement: string }[];
  competitiveAlert?: string;
}

interface GbpDescriptionResult {
  description?: string;
  correctedConcepts?: { criticism: string; corrector: string; phrase: string }[];
  seoKeywords?: string[];
}

interface ReviewAuditTabProps {
  reviewUrl: string;
  setReviewUrl: (v: string) => void;
  reviewStatus: 'idle' | 'scanning' | 'done';
  reviewResult: ReviewAuditResult | null;
  reviewError: string;
  onScan: () => void;
  gbpStatus: 'idle' | 'generating' | 'done';
  gbpResult: GbpDescriptionResult | null;
  gbpError: string;
  onGenerateGbp: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS: CheckItem[] = [
  { id: 'name',       label: 'Nombre del negocio correcto',         category: 'critical',   checked: false },
  { id: 'address',    label: 'Dirección verificada y completa',      category: 'critical',   checked: false },
  { id: 'phone',      label: 'Teléfono principal actualizado',       category: 'critical',   checked: false },
  { id: 'hours',      label: 'Horario de apertura configurado',      category: 'critical',   checked: false },
  { id: 'category',   label: 'Categoría principal bien definida',    category: 'critical',   checked: false },
  { id: 'website',    label: 'Web enlazada al perfil',               category: 'improvable', checked: false },
  { id: 'desc',       label: 'Descripción del negocio completa',     category: 'improvable', checked: false },
  { id: 'photos',     label: 'Más de 10 fotos publicadas',           category: 'improvable', checked: false },
  { id: 'reviews',    label: 'Al menos 5 reseñas respondidas',       category: 'improvable', checked: false },
  { id: 'posts',      label: 'Post publicado en los últimos 30 días',category: 'improvable', checked: false },
  { id: 'keywords',   label: 'Palabras clave en la descripción',     category: 'optimized',  checked: false },
  { id: 'qa',         label: 'Preguntas y respuestas activas',       category: 'optimized',  checked: false },
  { id: 'services',   label: 'Servicios/productos añadidos',         category: 'optimized',  checked: false },
  { id: 'attributes', label: 'Atributos del negocio configurados',   category: 'optimized',  checked: false },
];

// ─── Inline Helpers ────────────────────────────────────────────────────────────

async function callAuditMapsProfile(
  businessName: string,
  category: string,
  description: string,
  hours: string,
  accessToken: string
): Promise<{ score: number; recommendations: AuditRec[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-maps-profile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ businessName, category, description, hours }),
        signal: controller.signal,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Error del servidor');
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new Error('La solicitud tardó demasiado. Inténtalo de nuevo.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
        bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500"
    >
      {state === 'copied' ? (
        <>
          <Check size={12} className="text-emerald-400" />
          <span className="text-emerald-400">¡Copiado!</span>
        </>
      ) : state === 'error' ? (
        <>
          <AlertCircle size={12} className="text-red-400" />
          <span className="text-red-400">Error al copiar</span>
        </>
      ) : (
        <>
          <Copy size={12} />
          Copiar
        </>
      )}
    </button>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Speedometer({ score }: { score: number }) {
  const R = 90;
  const cx = 110;
  const cy = 110;
  const startAngle = 210;
  const endAngle = 330;
  const totalArc = 360 - startAngle + endAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (angle: number) => ({
    x: cx + R * Math.cos(toRad(angle)),
    y: cy + R * Math.sin(toRad(angle)),
  });

  const describeArc = (start: number, end: number) => {
    const s = arcPoint(start);
    const e = arcPoint(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const scoreAngle = startAngle + (score / 100) * totalArc;

  const color =
    score < 40 ? '#ef4444' :
    score < 70 ? '#f59e0b' :
    '#10b981';

  const needleRad = toRad(scoreAngle);
  const needleTip = { x: cx + (R - 12) * Math.cos(needleRad), y: cy + (R - 12) * Math.sin(needleRad) };
  const needleBase1 = { x: cx + 8 * Math.cos(needleRad + Math.PI / 2), y: cy + 8 * Math.sin(needleRad + Math.PI / 2) };
  const needleBase2 = { x: cx + 8 * Math.cos(needleRad - Math.PI / 2), y: cy + 8 * Math.sin(needleRad - Math.PI / 2) };

  return (
    <svg viewBox="0 0 220 160" className="w-full max-w-[280px]">
      <path d={describeArc(startAngle, startAngle + totalArc)} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
      {score > 0 && (
        <path d={describeArc(startAngle, scoreAngle)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      {[0, 25, 50, 75, 100].map((v) => {
        const a = toRad(startAngle + (v / 100) * totalArc);
        const inner = { x: cx + (R - 20) * Math.cos(a), y: cy + (R - 20) * Math.sin(a) };
        const outer = { x: cx + (R - 8)  * Math.cos(a), y: cy + (R - 8)  * Math.sin(a) };
        return <line key={v} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#334155" strokeWidth="1.5" />;
      })}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={score > 0 ? color : '#475569'}
        opacity={0.9}
      />
      <circle cx={cx} cy={cy} r={6} fill={score > 0 ? color : '#475569'} />
      <text x={cx} y={cy + 28} textAnchor="middle" fill={score > 0 ? color : '#64748b'} fontSize="28" fontWeight="700" fontFamily="sans-serif">{score}</text>
      <text x={cx} y={cy + 43} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="sans-serif">SALUD DE FICHA</text>
      <text x={arcPoint(startAngle).x - 2} y={arcPoint(startAngle).y + 14} textAnchor="middle" fill="#475569" fontSize="8" fontFamily="sans-serif">0</text>
      <text x={arcPoint(startAngle + totalArc).x + 2} y={arcPoint(startAngle + totalArc).y + 14} textAnchor="middle" fill="#475569" fontSize="8" fontFamily="sans-serif">100</text>
    </svg>
  );
}

function RecGroup({
  label, color, recs, copiedId, onCopy,
}: {
  label: string;
  color: 'red' | 'amber' | 'emerald';
  recs: AuditRec[];
  copiedId: string | null;
  onCopy: (rec: AuditRec) => void;
}) {
  const palette = {
    red:     { bg: 'bg-red-500/5',     header: 'text-red-400',     icon: 'text-red-500/60',     dot: 'bg-red-500' },
    amber:   { bg: 'bg-amber-500/5',   header: 'text-amber-400',   icon: 'text-amber-500/60',   dot: 'bg-amber-500' },
    emerald: { bg: 'bg-emerald-500/5', header: 'text-emerald-400', icon: 'text-emerald-500/60', dot: 'bg-emerald-500' },
  }[color];

  return (
    <div className={`px-5 py-4 ${palette.bg}`}>
      <p className={`text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5 ${palette.header}`}>
        <AlertCircle size={11} /> {label}
        <span className="ml-auto normal-case font-normal opacity-60">{recs.length} {recs.length === 1 ? 'tarea' : 'tareas'}</span>
      </p>
      <ul className="space-y-3">
        {recs.map((rec) => (
          <li key={rec.id} className="rounded-xl bg-slate-800/50 border border-slate-700/40 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-slate-700/30">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${palette.dot}`} />
                <span className="text-slate-200 text-xs font-semibold">{rec.title}</span>
              </div>
              <button
                onClick={() => onCopy(rec)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 shrink-0 ${
                  copiedId === rec.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-transparent'
                }`}
              >
                {copiedId === rec.id ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
              </button>
            </div>
            <p className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed">{rec.optimized_text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewAuditTab({ reviewUrl, setReviewUrl, reviewStatus, reviewResult, reviewError, onScan, gbpStatus, gbpResult, gbpError, onGenerateGbp }: ReviewAuditTabProps) {
  const [gbpCopied, setGbpCopied] = useState(false);
  const positivePct = reviewResult?.sentiment?.positive ?? 0;
  const negativePct = reviewResult?.sentiment?.negative ?? 0;

  const copyGbp = () => {
    if (!gbpResult?.description) return;
    navigator.clipboard.writeText(gbpResult.description).then(() => {
      setGbpCopied(true);
      setTimeout(() => setGbpCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <div className="glass-card rounded-2xl p-6 shadow-xl space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base leading-none">💬</span>
          <h2 className="font-semibold text-slate-200 text-sm">AI Review Audit</h2>
        </div>
        <p className="text-xs text-slate-500">Pega el enlace de Google Maps de cualquier negocio para obtener un análisis de sentimiento basado en sus reseñas.</p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="url"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onScan()}
              placeholder="https://maps.google.com/maps/place/..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100
                placeholder-slate-600 outline-none transition-all duration-200
                focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/10 focus:bg-slate-800"
            />
          </div>
          <button
            onClick={onScan}
            disabled={reviewStatus === 'scanning' || !reviewUrl.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-500 hover:bg-violet-400
              text-white text-sm font-bold transition-all duration-200 shadow-md shadow-violet-500/25
              disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {reviewStatus === 'scanning' ? (
              <><Loader2 size={14} className="animate-spin" /> Escaneando...</>
            ) : (
              <><Search size={14} /> Escanear</>
            )}
          </button>
        </div>
        {reviewError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={13} className="shrink-0" />
            {reviewError}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {reviewStatus === 'scanning' && (
        <div className="space-y-4 animate-pulse">
          <div className="glass-card rounded-2xl p-6 h-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-2xl p-6 h-48" />
            <div className="glass-card rounded-2xl p-6 h-48" />
          </div>
        </div>
      )}

      {/* Results */}
      {reviewStatus === 'done' && reviewResult && (
        <div className="space-y-5">
          {/* Header row */}
          <div className="glass-card rounded-2xl p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Negocio analizado</p>
              <p className="text-white font-bold text-lg truncate">{reviewResult.businessName ?? 'Negocio'}</p>
            </div>
            {reviewResult.avgRating && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-center">
                <p className="text-2xl font-black text-amber-400">{reviewResult.avgRating}</p>
                <p className="text-xs text-amber-500/70 mt-0.5">valoración media</p>
              </div>
            )}
            {reviewResult.totalReviewsEstimate && (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/40 px-4 py-2 text-center">
                <p className="text-2xl font-black text-slate-200">{reviewResult.totalReviewsEstimate}</p>
                <p className="text-xs text-slate-500 mt-0.5">reseñas est.</p>
              </div>
            )}
          </div>

          {/* Sentiment gauge */}
          {reviewResult.sentiment && (
            <div className="rounded-2xl glass-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">😊</span>
                <h3 className="text-sm font-semibold text-slate-200">Sentimiento General</h3>
                <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full border ${
                  reviewResult.sentiment.label.includes('Positivo')
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                    : reviewResult.sentiment.label.includes('Negativo')
                    ? 'bg-red-500/15 border-red-500/25 text-red-300'
                    : 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                }`}>
                  {reviewResult.sentiment.label}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-emerald-400">Positivo {positivePct}%</span>
                  <span className="text-red-400">Negativo {negativePct}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700" style={{ width: `${positivePct}%` }} />
                  <div className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-700" style={{ width: `${negativePct}%` }} />
                </div>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">{reviewResult.sentiment.summary}</p>
            </div>
          )}

          {/* Praised + Criticized grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {reviewResult.praised && reviewResult.praised.length > 0 && (
              <div className="rounded-2xl glass-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center gap-2">
                  <ThumbsUp size={14} className="text-emerald-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Lo más elogiado</h3>
                </div>
                <div className="divide-y divide-slate-800/40">
                  {reviewResult.praised.map((item, i) => (
                    <div key={i} className="px-5 py-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">{item.concept}</p>
                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${
                          item.frequency === 'muy frecuente'
                            ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                            : item.frequency === 'frecuente'
                            ? 'bg-sky-500/15 border-sky-500/25 text-sky-300'
                            : 'bg-slate-700/40 border-slate-600/40 text-slate-400'
                        }`}>
                          {item.frequency}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 italic">{item.examplePhrase}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewResult.criticized && reviewResult.criticized.length > 0 && (
              <div className="rounded-2xl glass-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800/60 flex items-center gap-2">
                  <ThumbsDown size={14} className="text-red-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Lo más criticado</h3>
                </div>
                <div className="divide-y divide-slate-800/40">
                  {reviewResult.criticized.map((item, i) => (
                    <div key={i} className="px-5 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">{item.concept}</p>
                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${
                          item.severity >= 7
                            ? 'bg-red-500/15 border-red-500/25 text-red-300'
                            : item.severity >= 4
                            ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                            : 'bg-slate-700/40 border-slate-600/40 text-slate-400'
                        }`}>
                          severidad {item.severity}/10
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 italic">{item.examplePhrase}</p>
                      <div className="flex items-start gap-1.5 text-xs text-sky-400 bg-sky-500/5 border border-sky-500/15 rounded-lg px-3 py-2">
                        <Lightbulb size={11} className="shrink-0 mt-0.5" />
                        {item.improvement}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Competitive alert */}
          {reviewResult.competitiveAlert && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-5 py-3.5 flex items-start gap-3">
              <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-0.5">Alerta Competitiva</p>
                <p className="text-xs text-amber-400/80">{reviewResult.competitiveAlert}</p>
              </div>
            </div>
          )}

          {/* GBP Description Generator */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-900/40 border border-emerald-500/20 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Sparkles size={13} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Descripción GBP Optimizada</p>
                  <p className="text-xs text-slate-500">Texto listo para copiar en Google Business Profile</p>
                </div>
              </div>
              <button
                onClick={onGenerateGbp}
                disabled={gbpStatus === 'generating'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400
                  text-slate-950 text-xs font-bold transition-all duration-200 shadow-md shadow-emerald-500/20
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gbpStatus === 'generating' ? (
                  <><Loader2 size={12} className="animate-spin" /> Generando...</>
                ) : gbpStatus === 'done' ? (
                  <><RefreshCw size={12} /> Regenerar</>
                ) : (
                  <><Zap size={12} /> Generar descripción</>
                )}
              </button>
            </div>

            {gbpError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={13} className="shrink-0" />
                {gbpError}
              </div>
            )}

            {gbpStatus === 'generating' && (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-full" />
                <div className="h-4 bg-slate-800 rounded w-5/6" />
                <div className="h-4 bg-slate-800 rounded w-4/5" />
                <div className="h-4 bg-slate-800 rounded w-full" />
                <div className="h-4 bg-slate-800 rounded w-3/4" />
              </div>
            )}

            {gbpStatus === 'done' && gbpResult?.description && (
              <div className="space-y-4">
                <div className="relative rounded-xl bg-slate-800/60 border border-slate-700/50 p-4">
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap pr-10">{gbpResult.description}</p>
                  <button
                    onClick={copyGbp}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/80
                      text-slate-400 hover:text-white transition-all duration-200"
                    title="Copiar descripción"
                  >
                    {gbpCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>

                {gbpResult.correctedConcepts && gbpResult.correctedConcepts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Correcciones aplicadas</p>
                    <div className="space-y-1.5">
                      {gbpResult.correctedConcepts.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-red-400/70 line-through shrink-0 mt-0.5">{c.criticism}</span>
                          <ChevronRight size={11} className="text-slate-600 shrink-0 mt-0.5" />
                          <span className="text-emerald-400 font-semibold shrink-0">{c.corrector}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {gbpResult.seoKeywords && gbpResult.seoKeywords.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Keywords SEO incluidas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gbpResult.seoKeywords.map((kw, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 font-medium">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gbpStatus === 'idle' && !gbpError && (
              <p className="text-xs text-slate-600 text-center py-2">
                La IA creará un texto que convierte tus críticas en fortalezas
              </p>
            )}
          </div>
        </div>
      )}

      {/* Idle state */}
      {reviewStatus === 'idle' && !reviewError && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-16 flex flex-col items-center justify-center text-center gap-4 bg-slate-900/20">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
            <span className="text-2xl leading-none">💬</span>
          </div>
          <div>
            <p className="text-slate-400 font-medium text-sm">Pega un enlace de Google Maps para comenzar</p>
            <p className="text-slate-600 text-xs mt-1">La IA generará un análisis de sentimiento detallado basado en las reseñas del negocio</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MapsScanner({ previewMode }: { previewMode: boolean }) {
  const { session } = useAuth();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'audit' | 'reviews'>('audit');

  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [score, setScore] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [recommendations, setRecommendations] = useState<AuditRec[]>([]);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [reviewUrl, setReviewUrl] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [reviewResult, setReviewResult] = useState<ReviewAuditResult | null>(null);
  const [reviewError, setReviewError] = useState('');

  const [gbpStatus, setGbpStatus] = useState<'idle' | 'generating' | 'done'>('idle');
  const [gbpResult, setGbpResult] = useState<GbpDescriptionResult | null>(null);
  const [gbpError, setGbpError] = useState('');

  const PREVIEW_RECS: AuditRec[] = [
    { id: 'r1', priority: 'high', title: 'Optimizar descripción con palabras clave', optimized_text: 'Peluquería López es tu salón de confianza en el corazón de Barcelona. Especializados en cortes modernos, coloración y tratamientos capilares para hombre y mujer. Más de 15 años cuidando el cabello de los barceloneses. Reserva tu cita hoy y descubre por qué somos la peluquería mejor valorada del Eixample. ¡Te esperamos en C/ Provença, 142!' },
    { id: 'r2', priority: 'high', title: 'Completar categorías secundarias', optimized_text: 'Categorías sugeridas: Peluquería, Salón de belleza, Barbería, Tratamiento capilar' },
    { id: 'r3', priority: 'medium', title: 'Añadir horario completo y festivos', optimized_text: 'Lunes a viernes: 9:00–20:00 · Sábado: 9:00–18:00 · Domingo: Cerrado · Festivos: Cerrado' },
    { id: 'r4', priority: 'medium', title: 'Incorporar servicios al perfil', optimized_text: 'Corte de cabello · Coloración · Balayage · Mechas · Tratamiento de queratina · Peinado para bodas · Alisado permanente · Corte masculino' },
    { id: 'r5', priority: 'low', title: 'Responder preguntas frecuentes', optimized_text: '¿Es necesario pedir cita? Sí, recomendamos reservar con antelación llamando al teléfono o por WhatsApp para garantizar tu horario preferido.' },
  ];

  const handleScan = async () => {
    if (!businessName.trim()) return;
    setStatus('searching');
    setScore(0);
    setDisplayScore(0);
    setRecommendations([]);
    setError('');

    try {
      let result: { score: number; recommendations: AuditRec[] };
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 2000));
        result = { score: 62, recommendations: PREVIEW_RECS };
      } else {
        result = await callAuditMapsProfile(
          businessName, category, description, hours, session!.access_token
        );
      }
      setScore(result.score);
      setRecommendations(result.recommendations);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar la ficha');
      setStatus('idle');
    }
  };

  useEffect(() => {
    if (status !== 'done') return;
    let current = 0;
    const step = Math.ceil(score / 50);
    const timer = setInterval(() => {
      current = Math.min(current + step, score);
      setDisplayScore(current);
      if (current >= score) clearInterval(timer);
    }, 25);
    return () => clearInterval(timer);
  }, [status, score]);

  const copyText = (rec: AuditRec) => {
    navigator.clipboard.writeText(rec.optimized_text).then(() => {
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const highRecs   = recommendations.filter((r) => r.priority === 'high');
  const mediumRecs = recommendations.filter((r) => r.priority === 'medium');
  const lowRecs    = recommendations.filter((r) => r.priority === 'low');

  const handleReviewScan = async () => {
    if (!reviewUrl.trim()) return;
    setReviewStatus('scanning');
    setReviewResult(null);
    setReviewError('');
    setGbpStatus('idle');
    setGbpResult(null);
    setGbpError('');
    try {
      const res = await supabase.functions.invoke('audit-reviews', {
        body: { mapsUrl: reviewUrl.trim() },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setReviewResult(res.data as ReviewAuditResult);
      setReviewStatus('done');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Error al escanear reseñas');
      setReviewStatus('idle');
    }
  };

  const handleGenerateGbp = async () => {
    if (!reviewResult) return;
    setGbpStatus('generating');
    setGbpResult(null);
    setGbpError('');
    try {
      const res = await supabase.functions.invoke('generate-gbp-description', {
        body: {
          businessName: reviewResult.businessName,
          avgRating: reviewResult.avgRating,
          praised: reviewResult.praised,
          criticized: reviewResult.criticized,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setGbpResult(res.data as GbpDescriptionResult);
      setGbpStatus('done');
    } catch (err) {
      setGbpError(err instanceof Error ? err.message : 'Error al generar la descripción');
      setGbpStatus('idle');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Escáner de Ficha <span className="text-emerald-400">Google Maps</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-xl">
          {t('maps_desc')}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-800/40 border border-slate-700/40 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
            activeTab === 'audit'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
          }`}
        >
          <MapPinned size={12} />
          Auditoría de Ficha
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
            activeTab === 'reviews'
              ? 'bg-violet-500/15 border border-violet-500/30 text-violet-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
          }`}
        >
          <span className="text-sm leading-none">💬</span>
          AI Review Audit
        </button>
      </div>

      {/* Tab 1: Auditoría de Ficha */}
      {activeTab === 'audit' && (
        <>
          <div className="rounded-2xl glass-card p-6 shadow-xl space-y-5 max-w-3xl">
            <div className="flex items-center gap-2 mb-1">
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ea4335"/>
                <circle cx="12" cy="9" r="2.5" fill="white"/>
              </svg>
              <h2 className="font-semibold text-slate-200 text-sm">{t('maps_section_data')}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={11} className="text-slate-500" />
                  Nombre del negocio <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder='Ej: Peluquería López Barcelona'
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                    placeholder-slate-600 outline-none transition-all duration-200
                    focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag size={11} className="text-slate-500" />
                  Categoría principal
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder='Ej: Peluquería, Restaurante, Fontanero...'
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                    placeholder-slate-600 outline-none transition-all duration-200
                    focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={11} className="text-slate-500" />
                Descripción actual
                <span className="ml-1 text-slate-600 normal-case font-normal">(déjalo vacío si no tienes)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder='Copia aquí tu descripción actual de Google Business Profile...'
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                  placeholder-slate-600 outline-none resize-none transition-all duration-200
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={11} className="text-slate-500" />
                Horario de apertura
                <span className="ml-1 text-slate-600 normal-case font-normal">(déjalo vacío si no está configurado)</span>
              </label>
              <input
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder='Ej: Lun-Vie 9:00-20:00, Sáb 10:00-14:00, Dom cerrado'
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                  placeholder-slate-600 outline-none transition-all duration-200
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={13} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={status === 'searching' || !businessName.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400
                text-slate-950 text-sm font-bold transition-all duration-200 shadow-md shadow-emerald-500/25
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'searching' ? (
                <><Loader2 size={14} className="animate-spin" /> Analizando con IA...</>
              ) : (
                <><Search size={14} /> Auditar Ficha con IA</>
              )}
            </button>
          </div>

          {status !== 'idle' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 rounded-2xl glass-card p-6 flex flex-col items-center justify-center gap-4 shadow-xl">
                {status === 'searching' ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <svg className="animate-spin w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <p className="text-slate-400 text-sm font-medium">La IA está auditando tu ficha...</p>
                  </div>
                ) : (
                  <>
                    <Speedometer score={displayScore} />
                    <div className="text-center">
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mb-2">Estado de la ficha</p>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                        displayScore < 40
                          ? 'bg-red-500/15 border-red-500/25 text-red-300'
                          : displayScore < 70
                          ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                          : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                      }`}>
                        {displayScore < 40 ? 'Ficha Deficiente' : displayScore < 70 ? 'Ficha Mejorable' : 'Ficha Optimizada'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-500 mb-0.5">Mejoras detectadas</p>
                      <p className="text-white font-bold text-lg">{recommendations.length} <span className="text-slate-500 font-normal text-sm">recomendaciones</span></p>
                    </div>
                  </>
                )}
              </div>

              <div className="lg:col-span-3 rounded-2xl glass-card shadow-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/60 flex items-center gap-2">
                  <CheckSquare size={15} className="text-emerald-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Recomendaciones con texto optimizado</h3>
                </div>
                <div className="divide-y divide-slate-800/40 max-h-[560px] overflow-y-auto">
                  {status === 'searching' ? (
                    <div className="p-5 space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="space-y-2 animate-pulse">
                          <div className="h-4 bg-slate-800 rounded w-2/3" />
                          <div className="h-16 bg-slate-800/60 rounded-lg" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {highRecs.length > 0 && (
                        <RecGroup label="Crítico" color="red" recs={highRecs} copiedId={copiedId} onCopy={copyText} />
                      )}
                      {mediumRecs.length > 0 && (
                        <RecGroup label="Mejorable" color="amber" recs={mediumRecs} copiedId={copiedId} onCopy={copyText} />
                      )}
                      {lowRecs.length > 0 && (
                        <RecGroup label="Optimizado" color="emerald" recs={lowRecs} copiedId={copiedId} onCopy={copyText} />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {status === 'idle' && (
            <div className="rounded-2xl border border-dashed border-slate-800 p-16 flex flex-col items-center justify-center text-center gap-4 bg-slate-900/20">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                <MapPinned size={24} className="text-slate-500" />
              </div>
              <div>
                <p className="text-slate-400 font-medium text-sm">Rellena los datos de tu ficha para comenzar</p>
                <p className="text-slate-600 text-xs mt-1">La IA analizará tu perfil y generará textos optimizados listos para copiar</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab 2: AI Review Audit */}
      {activeTab === 'reviews' && (
        <ReviewAuditTab
          reviewUrl={reviewUrl}
          setReviewUrl={setReviewUrl}
          reviewStatus={reviewStatus}
          reviewResult={reviewResult}
          reviewError={reviewError}
          onScan={handleReviewScan}
          gbpStatus={gbpStatus}
          gbpResult={gbpResult}
          gbpError={gbpError}
          onGenerateGbp={handleGenerateGbp}
        />
      )}
    </div>
  );
}
