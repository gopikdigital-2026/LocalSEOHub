import React, { useState } from 'react';
import {
  ScanSearch, Globe, AlertCircle, ExternalLink, Hash, Activity,
  TrendingUp, MessageSquare, ShieldAlert, Sparkles, BrainCircuit,
  Check, Copy, Link, Plus, Target, ShieldCheck, Trash2, Swords,
  ChevronLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Shared types ─────────────────────────────────────────────────────────────

type ThreatLevel = 'high' | 'medium' | 'low';

interface Rival {
  id: string;
  name: string;
  category: string;
  threat: ThreatLevel;
  lastMove: string;
  lastMoveTime: string;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ThreatBadge({ level }: { level: ThreatLevel }) {
  const styles = {
    high:   'bg-red-500/15 border-red-500/30 text-red-300',
    medium: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    low:    'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  };
  const labels = { high: 'Amenaza Alta', medium: 'Moderado', low: 'Sin Amenaza' };
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const parseinline = (raw: string): React.ReactNode => {
    const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, idx) => {
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={idx} className="text-slate-100 font-semibold">{p.slice(2,-2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`'))
        return <code key={idx} className="text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded text-xs font-mono">{p.slice(1,-1)}</code>;
      return p;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,3})/)?.[1].length ?? 1;
      const content = trimmed.replace(/^#{1,3}\s+/, '');
      const sizeClass = level === 1 ? 'text-base' : 'text-sm';
      elements.push(
        <h3 key={i} className={`${sizeClass} font-bold text-emerald-400 mt-5 mb-2 flex items-center gap-2`}>
          <span className="w-1 h-4 rounded-full bg-emerald-500/60 shrink-0" />
          {parseinline(content)}
        </h3>
      );
      i++; continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const match = lines[i].trim().match(/^\d+\.\s+(.*)/);
        if (match) items.push(<li key={i} className="text-sm text-slate-300 leading-relaxed">{parseinline(match[1])}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-1.5 pl-1 mb-3">{items}</ol>);
      continue;
    }
    if (/^[-*]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        const match = lines[i].trim().match(/^[-*]\s+(.*)/);
        if (match) items.push(
          <li key={i} className="text-sm text-slate-300 leading-relaxed flex gap-2">
            <span className="text-emerald-500 mt-1 shrink-0">▸</span>
            <span>{parseinline(match[1])}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="space-y-1.5 mb-3">{items}</ul>);
      continue;
    }
    if (trimmed.startsWith('>')) {
      const content = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote key={i} className="border-l-2 border-emerald-500/40 pl-4 py-2 my-2 bg-emerald-500/5 rounded-r-lg text-sm text-slate-300 italic leading-relaxed">
          {parseinline(content)}
        </blockquote>
      );
      i++; continue;
    }
    elements.push(<p key={i} className="text-sm text-slate-300 leading-relaxed mb-2">{parseinline(trimmed)}</p>);
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ─── URL Analysis interfaces ───────────────────────────────────────────────────

interface ActivityIndex {
  score: number;
  seoOptimization: string;
  contentFreshness: string;
  onlinePresence: string;
  callsToAction: string;
  summary: string;
}

interface UrlRival extends Rival {
  url: string;
  analysisContent?: string;
  keywords?: string[];
  activityIndex?: ActivityIndex;
  analysed?: boolean;
}

interface PositioningWeakness {
  title: string;
  description: string;
  opportunity: string;
}

interface ContentRecommendation {
  strategy: string;
  actions: string[];
  samplePost: string;
}

interface QuickScanResult {
  url: string;
  name: string;
  threat: ThreatLevel;
  keywords: string[];
  activityIndex: ActivityIndex;
  contentFocus: string;
  keyReviews: string[];
  positioningWeaknesses: PositioningWeakness[];
  contentRecommendation: ContentRecommendation;
  content: string;
}

// ─── Activity gauge helpers ───────────────────────────────────────────────────

const ACTIVITY_LEVEL_COLOR: Record<string, string> = {
  Alta: 'text-emerald-400',
  Media: 'text-amber-400',
  Baja: 'text-red-400',
  Presente: 'text-emerald-400',
  Ausente: 'text-slate-500',
};

const ACTIVITY_LEVEL_BAR: Record<string, string> = {
  Alta: 'bg-emerald-500',
  Media: 'bg-amber-500',
  Baja: 'bg-red-500',
};

function activityScoreColor(score: number) {
  if (score >= 76) return { ring: 'stroke-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' };
  if (score >= 56) return { ring: 'stroke-blue-500',    text: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/25' };
  if (score >= 36) return { ring: 'stroke-amber-500',   text: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/25' };
  return               { ring: 'stroke-red-500',    text: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/25' };
}

function ActivityGauge({ score, animate }: { score: number; animate: boolean }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = animate ? Math.min(score, 100) / 100 : 0;
  const dash = circ * pct;
  const colors = activityScoreColor(score);
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          className={`${colors.ring} transition-all duration-1000 ease-out`}
          strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="relative text-center">
        <p className={`text-2xl font-black ${colors.text}`}>{score}</p>
        <p className="text-[9px] text-slate-600 uppercase tracking-widest -mt-0.5">/ 100</p>
      </div>
    </div>
  );
}

// ─── Direct URL Scanner ────────────────────────────────────────────────────────

function DirectUrlScanner({ city }: { city: string }) {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickScanResult | null>(null);
  const [gaugeAnimate, setGaugeAnimate] = useState(false);
  const [barAnimate, setBarAnimate] = useState(false);
  const [copied, setCopied] = useState(false);

  const validate = (val: string) => {
    try { new URL(val.startsWith('http') ? val : `https://${val}`); return true; }
    catch { return false; }
  };

  const runScan = async () => {
    const raw = urlInput.trim();
    if (!raw) { setUrlError('Introduce la URL del rival'); return; }
    if (!validate(raw)) { setUrlError('URL no válida. Ej: competidor.com'); return; }
    setUrlError('');
    setLoading(true);
    setResult(null);
    setGaugeAnimate(false);
    setBarAnimate(false);
    try {
      const url = raw.startsWith('http') ? raw : `https://${raw}`;
      const res = await supabase.functions.invoke('analyze-competitor-url', {
        body: { url, city: city || 'tu ciudad' },
      });
      if (res.error) throw new Error(res.error.message);
      const d = res.data ?? {};
      setResult({
        url,
        name: d.detectedName || url.replace(/https?:\/\/(www\.)?/, '').split('/')[0],
        threat: d.detectedThreat ?? 'medium',
        keywords: Array.isArray(d.keywords) ? d.keywords : [],
        activityIndex: d.activityIndex ?? { score: 50, seoOptimization: 'Media', contentFreshness: 'Media', onlinePresence: 'Media', callsToAction: 'Ausente', summary: '' },
        contentFocus: d.contentFocus ?? '',
        keyReviews: Array.isArray(d.keyReviews) ? d.keyReviews : [],
        positioningWeaknesses: Array.isArray(d.positioningWeaknesses) ? d.positioningWeaknesses : [],
        contentRecommendation: d.contentRecommendation ?? { strategy: '', actions: [], samplePost: '' },
        content: d.content ?? '',
      });
      setTimeout(() => { setGaugeAnimate(true); setBarAnimate(true); }, 120);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Error al analizar la URL');
    } finally {
      setLoading(false);
    }
  };

  const score = result?.activityIndex.score ?? 0;
  const colors = activityScoreColor(score);
  const metrics = result ? [
    { label: 'Optimización SEO',      value: result.activityIndex.seoOptimization },
    { label: 'Frescura de contenido', value: result.activityIndex.contentFreshness },
    { label: 'Presencia online',      value: result.activityIndex.onlinePresence },
    { label: 'Llamadas a la acción',  value: result.activityIndex.callsToAction },
  ] : [];
  const metricToNum = (v: string) => ({ Alta: 100, Presente: 100, Media: 55, Baja: 20, Ausente: 12 }[v] ?? 50);

  return (
    <div className="space-y-5">
      {/* Input row */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2 mb-4">
          <ScanSearch size={13} className="text-blue-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Analizar URL del Rival</h3>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/12 border border-blue-500/25 text-blue-400">IA · gpt-4o-mini</span>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
              onKeyDown={e => e.key === 'Enter' && !loading && runScan()}
              placeholder="https://micompetidor.com o micompetidor.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-sm text-slate-100 placeholder-slate-600
                focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all duration-150"
            />
          </div>
          <button
            onClick={runScan}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm
              hover:bg-blue-500 active:scale-95 transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 shrink-0"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />Analizando...</>
              : <><ScanSearch size={14} />Analizar URL del Rival</>
            }
          </button>
        </div>
        {urlError && <p className="mt-2.5 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={11} />{urlError}</p>}
        {!urlError && <p className="mt-2 text-xs text-slate-600">La IA extrae el contenido real del sitio y devuelve keywords detectadas + índice de actividad digital.</p>}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 space-y-3">
              <div className="h-3 w-40 rounded-full bg-slate-800 animate-pulse" />
              <div className="flex flex-wrap gap-2">
                {[...Array(6)].map((_, j) => <div key={j} className="h-6 w-20 rounded-full bg-slate-800 animate-pulse" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Site name + threat pill */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <ExternalLink size={13} className="text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{result.name}</p>
              <p className="text-xs text-slate-600 font-mono truncate">{result.url}</p>
            </div>
            <ThreatBadge level={result.threat} />
          </div>

          {/* Row 1: Keywords + Activity Index */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/50">
                <Hash size={12} className="text-sky-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex-1">Palabras Clave Detectadas en su Web</h4>
                <span className="text-[10px] text-slate-600">{result.keywords.length} kw</span>
              </div>
              <div className="p-5">
                {result.keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {result.keywords.map((kw, i) => (
                      <span key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                          bg-sky-500/10 border border-sky-500/25 text-sky-300 hover:bg-sky-500/18 transition-colors cursor-default">
                        <Hash size={9} className="text-sky-500/60" />{kw}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 italic">No se detectaron keywords en este análisis.</p>
                )}
                <p className="mt-4 text-[11px] text-slate-600 leading-relaxed">
                  Palabras por las que tu rival compite en búsquedas locales.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/50">
                <Activity size={12} className="text-violet-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex-1">Índice de Actividad del Competidor</h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text}`}>
                  {score >= 76 ? 'Amenaza Alta' : score >= 56 ? 'Moderado' : score >= 36 ? 'Débil' : 'Muy Débil'}
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-5">
                  <ActivityGauge score={score} animate={gaugeAnimate} />
                  <div className="flex-1 space-y-1.5">
                    {metrics.map((m, i) => (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">{m.label}</span>
                          <span className={`font-bold ${ACTIVITY_LEVEL_COLOR[m.value] ?? 'text-slate-400'}`}>{m.value}</span>
                        </div>
                        <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${ACTIVITY_LEVEL_BAR[m.value] ?? 'bg-slate-600'}`}
                            style={{ width: barAnimate ? `${metricToNum(m.value)}%` : '0%', transitionDelay: `${i * 100 + 200}ms` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {result.activityIndex.summary && (
                  <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-800/50 pt-3">
                    {result.activityIndex.summary}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Content Focus + Key Reviews */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.contentFocus && (
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/50">
                  <TrendingUp size={12} className="text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Enfoque de Contenidos Local</h4>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-300 leading-relaxed">{result.contentFocus}</p>
                  <p className="mt-3 text-[11px] text-slate-600">Estrategia de contenidos inferida de su presencia web.</p>
                </div>
              </div>
            )}

            {result.keyReviews.length > 0 && (
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/50">
                  <MessageSquare size={12} className="text-amber-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex-1">Reseñas Clave en el Mercado</h4>
                  <span className="text-[10px] text-slate-600">Simuladas por IA</span>
                </div>
                <div className="p-5 space-y-3">
                  {result.keyReviews.map((review, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-black text-amber-400">{i + 1}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{review}</p>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-700 pt-1">Percepciones simuladas basadas en el perfil del negocio.</p>
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Positioning Weaknesses */}
          {result.positioningWeaknesses.length > 0 && (
            <div className="rounded-2xl border border-red-500/20 bg-slate-900/60 overflow-hidden"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-red-500/15 bg-red-500/5">
                <ShieldAlert size={12} className="text-red-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex-1">3 Debilidades de Posicionamiento</h4>
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Puntos de ataque</span>
              </div>
              <div className="divide-y divide-slate-800/40">
                {result.positioningWeaknesses.map((w, i) => (
                  <div key={i} className="flex gap-4 px-5 py-4">
                    <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-black text-red-400">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100 mb-1">{w.title}</p>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{w.description}</p>
                      {w.opportunity && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold
                          bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                          <Sparkles size={9} />
                          {w.opportunity}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Content Recommendation */}
          {result.contentRecommendation?.strategy && (
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 overflow-hidden"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-emerald-500/15 bg-emerald-500/5">
                <BrainCircuit size={12} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex-1">Recomendación Automatizada de Contenidos</h4>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">IA · gpt-4o-mini</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">{result.contentRecommendation.strategy}</p>
                {result.contentRecommendation.actions?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Acciones inmediatas</p>
                    {result.contentRecommendation.actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[9px] font-black text-emerald-400">{i + 1}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{action}</p>
                      </div>
                    ))}
                  </div>
                )}
                {result.contentRecommendation.samplePost && (
                  <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Texto listo para publicar</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(result!.contentRecommendation.samplePost);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border
                          ${copied ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-400' : 'bg-slate-700/60 border-slate-600/60 text-slate-400 hover:text-slate-200'}`}
                      >
                        {copied ? <><Check size={10} />Copiado</> : <><Copy size={10} />Copiar</>}
                      </button>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed italic">"{result.contentRecommendation.samplePost}"</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── URL Analysis Panel (tracking list) ───────────────────────────────────────

export default function UrlAnalysisPanel({ city }: { city: string }) {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [rivals, setRivals] = useState<UrlRival[]>([]);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [selectedRival, setSelectedRival] = useState<UrlRival | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const threatBorder = { high: 'border-red-500/50 text-red-300', medium: 'border-amber-500/50 text-amber-300', low: 'border-emerald-500/50 text-emerald-300' };

  const validateUrl = (val: string) => {
    try { new URL(val.startsWith('http') ? val : `https://${val}`); return true; }
    catch { return false; }
  };

  const normalizeUrl = (val: string) => val.startsWith('http') ? val : `https://${val}`;

  const addUrl = () => {
    const normalized = normalizeUrl(urlInput.trim());
    if (!urlInput.trim()) { setUrlError('Introduce una URL'); return; }
    if (!validateUrl(urlInput.trim())) { setUrlError('URL no válida. Ej: https://negocio.com'); return; }
    if (rivals.find(r => r.url === normalized)) { setUrlError('Esta URL ya está en la lista'); return; }
    setUrlError('');
    const domain = normalized.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
    const newRival: UrlRival = {
      id: `url-${Date.now()}`,
      url: normalized,
      name: domain,
      category: 'Pendiente de análisis',
      threat: 'medium',
      lastMove: 'Sin analizar aún',
      lastMoveTime: 'Ahora',
      analysed: false,
    };
    setRivals(prev => [newRival, ...prev]);
    setUrlInput('');
  };

  const removeRival = (id: string) => setRivals(prev => prev.filter(r => r.id !== id));

  const analyzeRival = async (rival: UrlRival) => {
    setAnalyzing(rival.id);
    try {
      const res = await supabase.functions.invoke('analyze-competitor-url', {
        body: { url: rival.url, city: city || 'tu ciudad' },
      });
      if (res.error) throw new Error(res.error.message);
      const { content, detectedThreat, detectedName, keywords, activityIndex } = res.data ?? {};
      setRivals(prev => prev.map(r => r.id === rival.id ? {
        ...r,
        name: detectedName || r.name,
        threat: detectedThreat || 'medium',
        lastMove: 'Análisis de IA completado',
        lastMoveTime: 'hace un momento',
        analysisContent: content,
        keywords: Array.isArray(keywords) ? keywords : [],
        activityIndex: activityIndex ?? undefined,
        analysed: true,
      } : r));
    } catch (err) {
      setRivals(prev => prev.map(r => r.id === rival.id ? {
        ...r,
        lastMove: 'Error al analizar',
        analysisContent: err instanceof Error ? err.message : 'Error desconocido',
        analysed: true,
      } : r));
    } finally {
      setAnalyzing(null);
    }
  };

  const openDrawer = (rival: UrlRival) => {
    setSelectedRival(rival);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelectedRival(null), 300);
  };

  return (
    <div className="space-y-6">
      {/* Direct quick-scan */}
      <DirectUrlScanner city={city} />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-800/60" />
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2">o añadir a lista de seguimiento</span>
        <div className="flex-1 h-px bg-slate-800/60" />
      </div>

      {/* URL input */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Link size={13} className="text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Añadir URL de Competidor</h3>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
              onKeyDown={e => e.key === 'Enter' && addUrl()}
              placeholder="https://competidor.com o competidor.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-sm text-slate-100 placeholder-slate-600
                focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-150"
            />
          </div>
          <button
            onClick={addUrl}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300
              text-sm font-semibold hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-150 shrink-0"
          >
            <Plus size={14} />
            Añadir
          </button>
        </div>
        {urlError && <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={11} />{urlError}</p>}
        <p className="mt-2.5 text-xs text-slate-600">Puedes añadir hasta 10 URLs. La IA extraerá y analizará el contenido de cada sitio.</p>
      </div>

      {/* Rival list */}
      {rivals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 py-16 flex flex-col items-center gap-3 text-center px-6">
          <ScanSearch size={32} className="text-slate-700" />
          <p className="text-sm font-semibold text-slate-500">No hay URLs añadidas</p>
          <p className="text-xs text-slate-700 max-w-xs">Introduce la URL de un negocio competidor arriba y la IA realizará un análisis táctico completo de su sitio web.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60">
            <Target size={13} className="text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Competidores a Analizar</h3>
            <span className="ml-auto text-xs text-slate-600">{rivals.length} URL{rivals.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-slate-800/40">
            {rivals.map(rival => (
              <div key={rival.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/20 transition-colors duration-150">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                  rival.analysed ? threatBorder[rival.threat] : 'border-slate-700/60 text-slate-500'
                }`} style={{ background: 'rgba(15,23,42,0.8)' }}>
                  {analyzing === rival.id
                    ? <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                    : rival.analysed ? <ShieldCheck size={14} /> : <Globe size={14} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-100 truncate">{rival.name}</p>
                    {rival.analysed && <ThreatBadge level={rival.threat} />}
                  </div>
                  <p className="text-xs text-slate-600 truncate font-mono mt-0.5">{rival.url}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!rival.analysed && (
                    <button
                      onClick={() => analyzeRival(rival)}
                      disabled={analyzing !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300
                        text-xs font-semibold hover:bg-emerald-500/20 transition-all duration-150
                        disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ScanSearch size={11} />
                      {analyzing === rival.id ? 'Analizando...' : 'Analizar'}
                    </button>
                  )}
                  {rival.analysed && rival.analysisContent && (
                    <button
                      onClick={() => openDrawer(rival)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300
                        text-xs font-semibold hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300
                        transition-all duration-150"
                    >
                      <Swords size={11} />
                      Ver Informe
                    </button>
                  )}
                  <button
                    onClick={() => removeRival(rival.id)}
                    className="w-7 h-7 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center
                      text-slate-600 hover:text-red-400 hover:border-red-500/30 transition-all duration-150"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {rivals.some(r => !r.analysed) && (
            <div className="px-6 py-3.5 border-t border-slate-800/50 bg-slate-950/40 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-mono">{rivals.filter(r => !r.analysed).length} pendiente{rivals.filter(r => !r.analysed).length !== 1 ? 's' : ''} de análisis</span>
              <button
                onClick={() => {
                  const pending = rivals.filter(r => !r.analysed && analyzing === null);
                  if (pending.length > 0) analyzeRival(pending[0]);
                }}
                disabled={analyzing !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300
                  text-xs font-bold hover:bg-emerald-500/20 transition-all duration-150
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ScanSearch size={11} />
                Analizar Siguiente
              </button>
            </div>
          )}
        </div>
      )}

      {/* Drawer */}
      {(drawerOpen || selectedRival) && (
        <>
          <div
            className={`fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeDrawer}
          />
          <div className={`fixed right-0 top-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-700/60 z-50 flex flex-col
            shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
            style={{ boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }}>
            {selectedRival && (
              <>
                <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800/60 bg-slate-950/50 shrink-0">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${threatBorder[selectedRival.threat]}`}>
                    <ShieldAlert size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-0.5">Informe de Inteligencia IA</p>
                    <p className="text-sm font-bold text-white truncate">{selectedRival.name}</p>
                  </div>
                  <button onClick={closeDrawer}
                    className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-center
                      text-slate-400 hover:text-white hover:border-slate-600 transition-all duration-150 shrink-0">
                    <ChevronLeft size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <div className="flex items-center gap-3 rounded-xl bg-slate-800/50 border border-slate-700/40 px-4 py-3">
                    <Globe size={13} className="text-slate-500 shrink-0" />
                    <p className="text-xs text-slate-400 font-mono truncate flex-1">{selectedRival.url}</p>
                    <ThreatBadge level={selectedRival.threat} />
                  </div>
                  <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 px-5 py-5">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                      <BrainCircuit size={11} /> Análisis Táctico Completo
                    </p>
                    <SimpleMarkdown text={selectedRival.analysisContent ?? ''} />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-800/60 bg-slate-950/40 shrink-0">
                  <button onClick={closeDrawer}
                    className="w-full py-2.5 rounded-xl bg-slate-800 border border-slate-700/60 text-sm font-semibold text-slate-300
                      hover:bg-slate-700 hover:text-white transition-all duration-150">
                    Cerrar Panel
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
