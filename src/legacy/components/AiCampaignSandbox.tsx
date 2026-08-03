import React, { useState } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Loader2,
  BrainCircuit,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types & Constants ────────────────────────────────────────────────────────

type CanalOption = 'ads' | 'reviews' | 'seo';

interface SimulationResult {
  leadIncrease?: {
    month3: number; month6: number; month12: number;
    yearlyTotal: number; cpl: string; vsBaseline: string;
  };
  agentOptimization?: {
    strategy: string;
    budgetSplit: { channel: string; pct: number; euros: number; reason: string }[];
    optimizedLeads12: number; optimizedROI: number; deltaVsOriginal: string;
  };
  risk?: { level: string; score: number; factors: string[]; mitigation: string };
  projectedROI?: {
    month6: number; month12: number; multiplier: string;
    breakeven: string; annualNetProfit: number;
  };
  verdict?: {
    recommendation: string; title: string; reasoning: string;
    confidence: number; urgency: string;
  };
  keyInsights?: string[];
}

const CANAL_CONFIG: Record<CanalOption, {
  label: string; lineColor: string; rgb: string; desc: string;
  badge: string; icon: string;
}> = {
  ads:     { label: 'Ads Locales',        lineColor: '#3b82f6', rgb: '59,130,246',  desc: 'Retorno inmediato y constante durante la campaña — ideal para máxima visibilidad a corto plazo.',       badge: 'bg-blue-500/15 border-blue-500/30 text-blue-300',    icon: '⚡' },
  reviews: { label: 'Campaña de Reseñas', lineColor: '#f59e0b', rgb: '245,158,11',  desc: 'Crecimiento compuesto — la reputación online se autoamplifica y sigue generando retorno sin coste adicional.', badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300',  icon: '⭐' },
  seo:     { label: 'SEO de Contenidos',  lineColor: '#10b981', rgb: '16,185,129',  desc: 'Efecto retardado pero curva de rentabilidad sostenida — el canal con mayor retorno a 12 meses.',          badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300', icon: '📈' },
};

const ROI_MULTIPLIERS: Record<CanalOption, number[]> = {
  ads:     [0.10, 0.21, 0.33, 0.46, 0.59, 0.73, 0.87, 1.00, 1.12, 1.22, 1.31, 1.40],
  reviews: [0.02, 0.05, 0.11, 0.21, 0.35, 0.54, 0.78, 1.07, 1.42, 1.84, 2.32, 2.85],
  seo:     [0.00, 0.01, 0.04, 0.10, 0.21, 0.38, 0.62, 0.92, 1.28, 1.70, 2.18, 2.70],
};

// ─── Chart ────────────────────────────────────────────────────────────────────

function smoothLinePath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function CampaignChart({ investment, canal }: { investment: number; canal: CanalOption }) {
  const cfg = CANAL_CONFIG[canal];
  const data = ROI_MULTIPLIERS[canal].map(m => Math.round(investment * m));

  const W = 400; const H = 170;
  const mL = 46; const mR = 8; const mT = 12; const mB = 28;
  const pW = W - mL - mR;
  const pH = H - mT - mB;

  const maxVal = Math.max(...data, investment > 0 ? investment * 1.15 : 100);
  const ceiling = Math.ceil(maxVal / 100) * 100 || 200;

  const toX = (i: number) => mL + (i / 11) * pW;
  const toY = (v: number) => mT + pH - Math.min((v / ceiling) * pH, pH);

  const pts: [number, number][] = data.map((v, i) => [toX(i), toY(v)]);
  const linePath = smoothLinePath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)},${(mT + pH).toFixed(1)} L ${mL},${(mT + pH).toFixed(1)} Z`;
  const investY = investment > 0 ? toY(investment) : mT + pH;
  const breakeven = investment > 0 ? data.findIndex(v => v >= investment) : -1;
  const gradId = `csg-${canal}`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xLabels = [0, 2, 5, 8, 11];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '170px', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgba(${cfg.rgb},0.35)`} />
          <stop offset="100%" stopColor={`rgba(${cfg.rgb},0.02)`} />
        </linearGradient>
      </defs>
      {yTicks.map((f, i) => {
        const y = mT + pH * (1 - f);
        const label = Math.round(ceiling * f);
        return (
          <g key={i}>
            <line x1={mL} y1={y} x2={W - mR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={mL - 4} y={y + 3.5} fontSize="9" fill="rgba(100,116,139,0.75)" textAnchor="end">{label}€</text>
          </g>
        );
      })}
      {xLabels.map(i => (
        <text key={i} x={toX(i)} y={H - 6} fontSize="9" fill="rgba(100,116,139,0.75)" textAnchor="middle">
          {i === 11 ? 'M12' : `M${i + 1}`}
        </text>
      ))}
      {investment > 0 && (
        <g>
          <line x1={mL} y1={investY} x2={W - mR} y2={investY}
            stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="5,4" />
          <text x={mL + 6} y={investY - 4} fontSize="8.5" fill="rgba(255,255,255,0.35)">{investment}€ invertido</text>
        </g>
      )}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={cfg.lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {breakeven >= 0 && investment > 0 && (
        <g>
          <circle cx={toX(breakeven)} cy={toY(data[breakeven])} r="5"
            fill={cfg.lineColor} stroke="rgb(15,23,42)" strokeWidth="2.5" />
          <text x={toX(breakeven)} y={toY(data[breakeven]) - 9} fontSize="8.5" fill={cfg.lineColor} textAnchor="middle">
            Break-even
          </text>
        </g>
      )}
      <circle cx={toX(11)} cy={toY(data[11])} r="5"
        fill={cfg.lineColor} stroke="rgb(15,23,42)" strokeWidth="2.5" />
      {data[11] > 0 && (
        <text x={toX(11) - 6} y={toY(data[11]) - 9} fontSize="9" fill={cfg.lineColor} textAnchor="end" fontWeight="700">
          {data[11]}€
        </text>
      )}
    </svg>
  );
}

// ─── AiCampaignSandbox ────────────────────────────────────────────────────────

export default function AiCampaignSandbox() {
  const [investment, setInvestment] = useState(300);
  const [canal, setCanal] = useState<CanalOption>('ads');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState('');

  const cfg = CANAL_CONFIG[canal];
  const data = ROI_MULTIPLIERS[canal].map(m => Math.round(investment * m));
  const roi6 = data[5];
  const roi12 = data[11];
  const mult = investment > 0 ? (roi12 / investment).toFixed(1) : '—';
  const breakeven = investment > 0 ? data.findIndex(v => v >= investment) : -1;
  const beLabel = breakeven >= 0 ? `Mes ${breakeven + 1}` : 'No alcanzado';

  const sliderBg = `linear-gradient(to right, ${cfg.lineColor} ${(investment / 1000) * 100}%, #1e293b ${(investment / 1000) * 100}%)`;

  const runSimulation = async () => {
    if (investment === 0) return;
    setSimulating(true);
    setSimResult(null);
    setSimError('');
    try {
      const res = await supabase.functions.invoke('simulate-campaign', {
        body: { investment, canal, roiMonth6: roi6, roiMonth12: roi12 },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setSimResult(res.data as SimulationResult);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Error al simular');
    } finally {
      setSimulating(false);
    }
  };

  const verdictStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    ejecutar:     { bg: 'bg-emerald-500/8',  border: 'border-emerald-500/30', text: 'text-emerald-300', icon: '✅' },
    revisar:      { bg: 'bg-amber-500/8',    border: 'border-amber-500/30',   text: 'text-amber-300',   icon: '⚠️' },
    no_ejecutar:  { bg: 'bg-red-500/8',      border: 'border-red-500/30',     text: 'text-red-300',     icon: '🚫' },
  };
  const riskColor = (score: number) =>
    score < 35 ? { text: 'text-emerald-400', bar: 'bg-emerald-500', label: 'Bajo' }
    : score < 60 ? { text: 'text-amber-400',   bar: 'bg-amber-500',   label: 'Medio' }
    : { text: 'text-red-400', bar: 'bg-red-500', label: 'Alto' };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 overflow-hidden"
      style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60 bg-slate-950/30">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-base">
          💰
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">AI Campaign Sandbox</h2>
          <p className="text-[11px] text-slate-600 mt-0.5">Simulación predictiva de retorno por canal</p>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/25 text-amber-400 uppercase tracking-wider">
          IA · gpt-4o-mini
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/50">

        {/* LEFT — Controls */}
        <div className="lg:col-span-2 p-6 space-y-6">

          {/* Investment slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Inversión Simulada
              </label>
              <span className="text-sm font-black text-white bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 tabular-nums min-w-[4.5rem] text-center">
                {investment}€<span className="text-slate-500 font-normal text-xs">/mes</span>
              </span>
            </div>
            <input
              type="range" min={0} max={1000} step={10} value={investment}
              onChange={e => { setInvestment(Number(e.target.value)); setSimResult(null); }}
              className="twin-slider w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: sliderBg }}
            />
            <div className="flex justify-between text-[10px] text-slate-700 font-mono">
              <span>0€</span><span>250€</span><span>500€</span><span>750€</span><span>1000€</span>
            </div>
          </div>

          {/* Canal selector */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Canal</label>
            <div className="flex flex-col gap-2">
              {(Object.entries(CANAL_CONFIG) as [CanalOption, typeof CANAL_CONFIG[CanalOption]][]).map(([key, c]) => (
                <button key={key} onClick={() => { setCanal(key); setSimResult(null); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200 ${
                    canal === key ? `${c.badge} ring-1 ring-inset` : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600/60 hover:bg-slate-800/60'
                  }`}>
                  <span className="text-base shrink-0">{c.icon}</span>
                  <span className="text-xs font-bold">{c.label}</span>
                  {canal === key && <span className="ml-auto w-2 h-2 rounded-full shrink-0" style={{ background: c.lineColor }} />}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed px-1">{cfg.desc}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Retorno mes 6',  value: investment > 0 ? `${roi6}€` : '—' },
              { label: 'Retorno mes 12', value: investment > 0 ? `${roi12}€` : '—', accent: true },
              { label: 'Multiplicador',  value: investment > 0 ? `${mult}×` : '—' },
              { label: 'Break-even',     value: beLabel, beColor: breakeven >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map((s, i) => (
              <div key={i} className="rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">{s.label}</p>
                <p className={`text-sm font-black tabular-nums ${'beColor' in s ? s.beColor : 'accent' in s && s.accent ? '' : 'text-slate-100'}`}
                  style={'accent' in s && s.accent ? { color: cfg.lineColor } : {}}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={runSimulation}
            disabled={simulating || investment === 0}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200
              bg-amber-500/15 border border-amber-500/30 text-amber-300
              hover:bg-amber-500/25 hover:border-amber-500/50 hover:text-amber-200
              disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
          >
            {simulating
              ? <><Loader2 size={14} className="animate-spin" />Agente optimizando...</>
              : <><BrainCircuit size={14} />Simular con Agente IA</>
            }
          </button>
          {simError && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={11} />{simError}</p>}
        </div>

        {/* RIGHT — Chart + AI results */}
        <div className="lg:col-span-3 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Curva de Retorno Esperado (12 meses)</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
          </div>

          {investment === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-10 text-center">
              <TrendingUp size={28} className="text-slate-700" />
              <p className="text-xs text-slate-600">Mueve el slider para ver la proyección</p>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl bg-slate-950/50 border border-slate-800/50 p-3 overflow-hidden">
                <CampaignChart investment={investment} canal={canal} />
              </div>
              <div className="flex items-start gap-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: cfg.lineColor }} />
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Con <span className="text-slate-400 font-bold">{investment}€/mes</span> en {cfg.label.toLowerCase()}, el modelo predice un retorno acumulado de{' '}
                  <span style={{ color: cfg.lineColor }} className="font-bold">{roi12}€</span> al mes 12 ({mult}× la inversión mensual).
                  {breakeven >= 0 && ` Break-even estimado en el mes ${breakeven + 1}.`}
                </p>
              </div>
            </>
          )}

          {simulating && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 flex flex-col items-center gap-3 text-center">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-amber-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
                <div className="absolute inset-2 rounded-full border border-transparent border-t-amber-500/40 animate-spin" style={{ animationDuration: '1.4s', animationDirection: 'reverse' }} />
              </div>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Agente optimizando presupuesto</p>
              <p className="text-[11px] text-slate-600">Calculando leads, ROI y veredicto estratégico...</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis Results */}
      {simResult && !simulating && (
        <div className="border-t border-slate-800/60 p-6 space-y-5">

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-800/60" />
            <span className="flex items-center gap-2 text-[10px] font-bold text-amber-400 uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/8 border border-amber-500/20">
              <BrainCircuit size={10} />
              Análisis del Agente Autónomo
            </span>
            <div className="flex-1 h-px bg-slate-800/60" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {simResult.leadIncrease && (
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800/60 bg-slate-900/50">
                  <TrendingUp size={11} className="text-sky-400" />
                  <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Volumen de Leads</h4>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { label: 'Mes 3',  value: simResult.leadIncrease.month3 },
                    { label: 'Mes 6',  value: simResult.leadIncrease.month6 },
                    { label: 'Mes 12', value: simResult.leadIncrease.month12 },
                  ].map((m, i) => {
                    const maxLeads = simResult.leadIncrease!.month12 || 1;
                    const pct = Math.min((m.value / maxLeads) * 100, 100);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500">{m.label}</span>
                          <span className="font-bold text-slate-200">{m.value} leads/mes</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-sky-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-slate-800/50 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Total anual</span>
                      <span className="font-black text-sky-400">{simResult.leadIncrease.yearlyTotal} leads</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">CPL medio</span>
                      <span className="font-bold text-slate-300">{simResult.leadIncrease.cpl}€/lead</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">vs sin inversión</span>
                      <span className="font-bold text-emerald-400">{simResult.leadIncrease.vsBaseline}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {simResult.agentOptimization && (
              <div className="rounded-2xl border border-amber-500/20 bg-slate-900/60 overflow-hidden"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-amber-500/15 bg-amber-500/5">
                  <Sparkles size={11} className="text-amber-400" />
                  <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Optimización del Agente</h4>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-[11px] text-slate-400 leading-relaxed">{simResult.agentOptimization.strategy}</p>
                  <div className="space-y-2">
                    {simResult.agentOptimization.budgetSplit?.map((split, i) => (
                      <div key={i} className="rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-300">{split.channel}</span>
                          <span className="text-[10px] font-black text-amber-400">{split.pct}% · {split.euros}€</span>
                        </div>
                        <p className="text-[10px] text-slate-600 leading-snug">{split.reason}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-800/50 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Leads/mes m12 optimizado</span>
                      <span className="font-black text-amber-400">{simResult.agentOptimization.optimizedLeads12}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">ROI adicional agente</span>
                      <span className="font-black text-emerald-400">+{simResult.agentOptimization.optimizedROI}€</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Delta vs original</span>
                      <span className="font-bold text-emerald-400">{simResult.agentOptimization.deltaVsOriginal}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {simResult.risk && (() => {
                const rc = riskColor(simResult.risk.score);
                return (
                  <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800/60 bg-slate-900/50">
                      <ShieldAlert size={11} className={rc.text} />
                      <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex-1">Riesgo Estimado</h4>
                      <span className={`text-[10px] font-black ${rc.text}`}>{rc.label} · {simResult.risk.score}/100</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${rc.bar}`} style={{ width: `${simResult.risk.score}%` }} />
                      </div>
                      <div className="space-y-1">
                        {simResult.risk.factors?.map((f, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                            <span className={`mt-0.5 shrink-0 ${rc.text}`}>▸</span>{f}
                          </div>
                        ))}
                      </div>
                      {simResult.risk.mitigation && (
                        <div className="rounded-lg bg-slate-800/40 border border-slate-700/30 px-3 py-2">
                          <p className="text-[10px] text-slate-500 leading-snug">{simResult.risk.mitigation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {simResult.projectedROI && (
                <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ROI Proyectado</p>
                  {[
                    { k: 'Mes 6', v: `${simResult.projectedROI.month6}€` },
                    { k: 'Mes 12', v: `${simResult.projectedROI.month12}€` },
                    { k: 'Multiplicador', v: simResult.projectedROI.multiplier },
                    { k: 'Break-even', v: simResult.projectedROI.breakeven },
                    { k: 'Beneficio neto', v: `${simResult.projectedROI.annualNetProfit}€` },
                  ].map((r, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span className="text-slate-600">{r.k}</span>
                      <span className={`font-bold ${i >= 3 ? (simResult.projectedROI!.annualNetProfit > 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-200'}`}>{r.v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {simResult.keyInsights && simResult.keyInsights.length > 0 && (
            <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 px-5 py-4 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Insights Clave del Agente</p>
              {simResult.keyInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-black text-amber-400">{i + 1}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          )}

          {simResult.verdict && (() => {
            const vs = verdictStyles[simResult.verdict.recommendation] ?? verdictStyles.revisar;
            return (
              <div className={`rounded-2xl border p-5 ${vs.border} ${vs.bg}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${vs.border} bg-slate-900/60`}>
                    {vs.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className={`text-base font-black ${vs.text}`}>{simResult.verdict.title}</h3>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider ${vs.border} ${vs.bg} ${vs.text}`}>
                        {simResult.verdict.recommendation.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed mb-3">{simResult.verdict.reasoning}</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 uppercase tracking-widest">Confianza</span>
                        <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${vs.text === 'text-emerald-300' ? 'bg-emerald-500' : vs.text === 'text-amber-300' ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${simResult.verdict.confidence}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold ${vs.text}`}>{simResult.verdict.confidence}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-600 uppercase tracking-widest">Urgencia:</span>
                        <span className={`text-[10px] font-bold ${vs.text}`}>{simResult.verdict.urgency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
