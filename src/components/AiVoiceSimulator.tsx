import { useState, useEffect, useRef } from 'react';
import {
  Mic, Play, Pause, Volume2, CheckCircle2, XCircle, AlertTriangle,
  Wifi, Smartphone, MapPin, Radio, Sparkles, Bot, Car, Signal,
  BatteryFull, ChevronDown, Loader2, Lock, Building2, Tag, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Static data ───────────────────────────────────────────────────────────────

const ASSISTANTS = [
  { id: 'siri',    label: 'Siri',         sublabel: 'Apple',     neon: '#3b82f6', gradFrom: '#1d4ed8', gradTo: '#3b82f6', icon: <Mic size={14} /> },
  { id: 'gemini',  label: 'Gemini Live',  sublabel: 'Google',    neon: '#10b981', gradFrom: '#065f46', gradTo: '#10b981', icon: <Sparkles size={14} /> },
  { id: 'copilot', label: 'Copilot Car',  sublabel: 'Microsoft', neon: '#38bdf8', gradFrom: '#0369a1', gradTo: '#38bdf8', icon: <Bot size={14} /> },
  { id: 'alexa',   label: 'Alexa',        sublabel: 'Amazon',    neon: '#22d3ee', gradFrom: '#155e75', gradTo: '#22d3ee', icon: <Radio size={14} /> },
] as const;

const SCENARIOS = [
  'Busca un restaurante con terraza tranquilo para una cena de negocios en [Ciudad]',
  '¿Cuál es la peluquería mejor valorada cerca de mí que abra los domingos?',
  'Encuentra un fontanero de urgencias disponible ahora en [Ciudad]',
  'Recomiéndame un hotel con parking gratuito y buenas vistas en [Ciudad]',
  '¿Dónde puedo desayunar algo saludable cerca de [Ciudad] antes de las 8?',
];

type Status = 'pass' | 'warn' | 'fail';
interface CheckItem { label: string; detail: string; status: Status; icon: React.ReactNode; }

const CHECKLIST: Record<string, CheckItem[]> = {
  siri: [
    { label: 'Lenguaje natural indexado',    detail: 'Tu ficha usa frases conversacionales que Siri puede citar directamente',  status: 'pass', icon: <Mic size={12} /> },
    { label: 'Atributos específicos activos', detail: 'Terraza, WiFi y aparcamiento detectados en tu perfil de Google Business', status: 'pass', icon: <Wifi size={12} /> },
    { label: 'Velocidad móvil < 2 s',         detail: 'LCP en 1.4 s — óptimo para respuestas en ruta',                          status: 'pass', icon: <Smartphone size={12} /> },
    { label: 'Reseñas con palabras clave',    detail: 'Solo 4 reseñas mencionan "tranquilo" y "negocios" — necesitas más',       status: 'warn', icon: <CheckCircle2 size={12} /> },
    { label: 'Horario actualizado',           detail: 'Horario verificado en los últimos 30 días en GBP',                        status: 'pass', icon: <MapPin size={12} /> },
  ],
  gemini: [
    { label: 'Presencia en Google Maps',      detail: 'Ficha GBP verificada y completa al 96 %',                                 status: 'pass', icon: <MapPin size={12} /> },
    { label: 'Atributos específicos activos', detail: 'Faltan: menú ejecutivo, parking y opción de reservas online',              status: 'warn', icon: <Wifi size={12} /> },
    { label: 'Velocidad móvil < 2 s',         detail: 'LCP en 1.4 s — excelente para asistentes en ruta',                       status: 'pass', icon: <Smartphone size={12} /> },
    { label: 'Schema Restaurant markup',      detail: 'Structured data no detectado — Gemini no puede citarte con confianza',    status: 'fail', icon: <CheckCircle2 size={12} /> },
    { label: 'Reseñas recientes (30 días)',   detail: '7 reseñas en el último mes — señal suficiente para el algoritmo',         status: 'pass', icon: <CheckCircle2 size={12} /> },
  ],
  copilot: [
    { label: 'Integración con Bing Places',   detail: 'Ficha no reclamada en Bing — Copilot Car no te encuentra en ruta',        status: 'fail', icon: <MapPin size={12} /> },
    { label: 'Atributos específicos activos', detail: 'WiFi y parking confirmados; falta sala privada para negocios',             status: 'warn', icon: <Wifi size={12} /> },
    { label: 'Velocidad móvil < 2 s',         detail: 'TTI en 2.8 s — demasiado lento para respuestas de Copilot en ruta',       status: 'warn', icon: <Smartphone size={12} /> },
    { label: 'Reservas / calendario online',  detail: 'Sin sistema de reservas — Copilot no puede gestionar la agenda del usuario', status: 'fail', icon: <CheckCircle2 size={12} /> },
    { label: 'Lenguaje natural indexado',     detail: 'Descripción demasiado genérica para búsqueda conversacional en Bing',     status: 'warn', icon: <Mic size={12} /> },
  ],
  alexa: [
    { label: 'Presencia en Yelp / TripAdvisor', detail: 'Perfil activo y completo en ambas plataformas — Alexa las prioriza',    status: 'pass', icon: <CheckCircle2 size={12} /> },
    { label: 'Atributos accesibilidad',          detail: 'Acceso PMR no especificado — Alexa lo requiere para recomendar',       status: 'warn', icon: <Wifi size={12} /> },
    { label: 'Velocidad móvil < 2 s',             detail: 'LCP en 1.7 s — óptimo para Echo Auto en conducción',                  status: 'pass', icon: <Smartphone size={12} /> },
    { label: 'Reservas por voz habilitadas',      detail: 'No conectado a OpenTable ni a Alexa Reservations',                    status: 'fail', icon: <CheckCircle2 size={12} /> },
    { label: 'Reseñas con lenguaje conversacional', detail: '"Tranquilo" y "negocios" mencionados en 18 reseñas verificadas',   status: 'pass', icon: <Mic size={12} /> },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AiVoiceSimulator({ previewMode }: { previewMode?: boolean }) {
  const [assistantId, setAssistantId] = useState<'siri' | 'gemini' | 'copilot' | 'alexa'>('gemini');
  const [scenarioIdx, setScenarioIdx]   = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [specialty, setSpecialty]       = useState('');
  const [city, setCity]                 = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [done, setDone]                 = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [voiceScript, setVoiceScript]   = useState<string | null>(null);
  const [genError, setGenError]         = useState('');

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const assistant = ASSISTANTS.find(a => a.id === assistantId)!;
  const checklist  = CHECKLIST[assistantId];
  const passCount  = checklist.filter(c => c.status === 'pass').length;
  const scoreColor = passCount >= 4 ? '#10b981' : passCount >= 2 ? '#f59e0b' : '#ef4444';

  // Stop speech when assistant changes or on unmount
  useEffect(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setDone(false);
    setDisplayedText('');
    setVoiceScript(null);
    setGenError('');
  }, [assistantId]);

  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  // ── Play / pause handler ────────────────────────────────────────────────────
  const handlePlay = async () => {
    if (previewMode || isGenerating) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    setGenError('');
    setDisplayedText('');
    setVoiceScript(null);
    setDone(false);
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-voice-script', {
        body: {
          businessName: businessName.trim() || 'Mi negocio',
          specialty:    specialty.trim()    || 'establecimiento local',
          city:         city.trim()         || 'mi ciudad',
          scenario:     SCENARIOS[scenarioIdx],
          assistant:    assistant.label,
        },
      });

      if (error) throw new Error(error.message);
      const script: string = data?.voice_script ?? '';
      if (!script) throw new Error('Respuesta vacía del servidor');

      setVoiceScript(script);
      setIsGenerating(false);

      // ── Speech synthesis ──────────────────────────────────────────────────
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(script);
      utt.lang  = 'es-ES';
      utt.rate  = 0.92;
      utt.pitch = 1.0;

      // Pick best Spanish voice (prefer local service, non-compact)
      const voices  = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang.startsWith('es') && v.localService && !v.name.toLowerCase().includes('compact'))
                   ?? voices.find(v => v.lang.startsWith('es'));
      if (esVoice) utt.voice = esVoice;

      // Progressive subtitle via word-boundary events
      utt.addEventListener('boundary', (e) => {
        if (e.name !== 'word') return;
        const nextSpace = script.indexOf(' ', e.charIndex + 1);
        setDisplayedText(script.slice(0, nextSpace === -1 ? script.length : nextSpace));
      });

      utt.addEventListener('end', () => {
        setDisplayedText(script);
        setIsPlaying(false);
        setDone(true);
      });

      utt.addEventListener('error', () => setIsPlaying(false));

      utteranceRef.current = utt;
      setIsPlaying(true);
      window.speechSynthesis.speak(utt);

    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error desconocido');
      setIsGenerating(false);
      setIsPlaying(false);
    }
  };

  // ── Wave bars ───────────────────────────────────────────────────────────────
  const WaveBars = () => (
    <div className="flex items-end justify-center gap-[3px]" style={{ height: 40 }}>
      {Array.from({ length: 26 }, (_, i) => {
        const base = 6 + Math.abs(Math.sin(i * 0.55)) * 22;
        const dur  = 0.55 + (i % 7) * 0.09;
        const del  = i * 0.06;
        return (
          <div
            key={i}
            style={{
              width: 3, height: base, borderRadius: 2,
              background: `linear-gradient(to top, ${assistant.neon}, rgba(16,185,129,0.5))`,
              boxShadow: isPlaying ? `0 0 6px ${assistant.neon}80` : 'none',
              transformOrigin: 'bottom',
              transition: 'box-shadow 0.3s',
              animation: isPlaying ? `voiceWave ${dur}s ${del}s ease-in-out infinite` : 'none',
            }}
          />
        );
      })}
    </div>
  );

  const StatusIcon = ({ s }: { s: Status }) =>
    s === 'pass' ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
  : s === 'warn' ? <AlertTriangle size={14} className="text-amber-400 shrink-0" />
  :               <XCircle size={14} className="text-red-400 shrink-0" />;

  const statusBg:     Record<Status, string> = { pass: 'rgba(16,185,129,0.10)', warn: 'rgba(245,158,11,0.10)', fail: 'rgba(239,68,68,0.10)' };
  const statusBorder: Record<Status, string> = { pass: 'rgba(16,185,129,0.22)', warn: 'rgba(245,158,11,0.22)', fail: 'rgba(239,68,68,0.22)' };

  const btnLabel = isGenerating ? 'Generando script...' : isPlaying ? 'Detener' : done ? 'Repetir simulación' : 'Escuchar simulación de voz';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${assistant.gradFrom}, ${assistant.gradTo})`, boxShadow: `0 6px 20px ${assistant.neon}40` }}
        >
          <Volume2 size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">AI Voice Simulator</h2>
          <p className="text-slate-500 text-xs">Escucha en voz real cómo los asistentes recomiendan tu negocio</p>
        </div>
        {previewMode && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
            <Lock size={11} /> Plan Pro
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Scenario Selector ──────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-5 space-y-5">
          <p className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Mic size={11} className="text-slate-600" /> Configurar escenario
          </p>

          {/* Business data */}
          <div className="space-y-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Datos de tu negocio</p>
            {[
              { icon: <Building2 size={11}/>, ph: 'Nombre del negocio (ej. Cafetería Sol)', val: businessName, set: setBusinessName },
              { icon: <Tag size={11}/>,       ph: 'Especialidad (ej. Cafetería, Fontanero)', val: specialty,    set: setSpecialty },
              { icon: <MapPin size={11}/>,    ph: 'Ciudad (ej. Toledo, Madrid)', val: city, set: setCity },
            ].map(({ icon, ph, val, set }, i) => (
              <div key={i} className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">{icon}</span>
                <input
                  type="text"
                  placeholder={ph}
                  value={val}
                  onChange={e => set(e.target.value)}
                  className="w-full rounded-xl pl-7 pr-3 py-2.5 text-xs text-slate-200 outline-none placeholder-slate-600 transition-colors focus:border-emerald-500/40"
                  style={{ background: 'rgba(3,8,16,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            ))}
          </div>

          {/* Assistant picker */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2.5">Asistente de voz</p>
            <div className="grid grid-cols-2 gap-2">
              {ASSISTANTS.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAssistantId(a.id)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200"
                  style={
                    assistantId === a.id
                      ? { background: `linear-gradient(135deg, ${a.gradFrom}cc, ${a.gradTo}cc)`, border: `1px solid ${a.neon}50`, boxShadow: `0 0 16px ${a.neon}30`, color: '#fff' }
                      : { background: 'rgba(3,8,16,0.75)', border: '1px solid rgba(255,255,255,0.07)', color: '#94a3b8' }
                  }
                >
                  <span style={{ color: assistantId === a.id ? '#fff' : a.neon }}>{a.icon}</span>
                  <span className="leading-tight">
                    <span className="block">{a.label}</span>
                    <span className="block text-[9px] opacity-60 font-normal">{a.sublabel}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scenario */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2">Escenario de búsqueda</p>
            <div className="relative">
              <select
                value={scenarioIdx}
                onChange={e => setScenarioIdx(Number(e.target.value))}
                className="w-full appearance-none rounded-xl px-3 py-2.5 text-xs text-slate-200 pr-8 outline-none"
                style={{ background: 'rgba(3,8,16,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}
              >
                {SCENARIOS.map((s, i) => (
                  <option key={i} value={i}>{s.length > 44 ? s.slice(0, 44) + '…' : s}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <div
              className="mt-2 rounded-xl px-3.5 py-2.5 text-xs text-slate-400 leading-relaxed italic"
              style={{ background: 'rgba(3,8,16,0.70)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              "{SCENARIOS[scenarioIdx]}"
            </div>
          </div>
        </div>

        {/* ── Center: CarPlay Mockup ────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center">
          <div
            className="w-full max-w-sm rounded-3xl p-3 relative"
            style={{
              background: 'linear-gradient(160deg, #1a1f2e 0%, #0d1018 100%)',
              border: '2px solid rgba(255,255,255,0.08)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* Side vent decorations */}
            {['-left-1', '-right-1'].map(side => (
              <div key={side} className={`absolute ${side} top-1/2 -translate-y-1/2 flex flex-col gap-1`}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-1 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                ))}
              </div>
            ))}

            {/* Screen */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg,#060810 0%,#04060c 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Status bar */}
              <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[10px] font-semibold text-slate-400">9:41</span>
                <div className="flex items-center gap-1"><Car size={10} className="text-slate-600" /><span className="text-[9px] text-slate-600 font-medium">CarPlay</span></div>
                <div className="flex items-center gap-1.5"><Signal size={10} className="text-slate-400" /><BatteryFull size={10} className="text-slate-400" /></div>
              </div>

              <div className="px-5 py-5 space-y-4">
                {/* Assistant badge */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg,${assistant.gradFrom},${assistant.gradTo})`, boxShadow: `0 4px 14px ${assistant.neon}40` }}>
                    <span className="text-white">{assistant.icon}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-tight">{assistant.label}</p>
                    <p className="text-[9px]" style={{ color: assistant.neon }}>
                      {isGenerating ? '● Generando...' : isPlaying ? '● Hablando...' : done ? '✓ Listo' : 'En espera'}
                    </p>
                  </div>
                  {(isPlaying || isGenerating) && (
                    <div className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ background: assistant.neon, boxShadow: `0 0 8px ${assistant.neon}` }} />
                  )}
                </div>

                {/* Wave */}
                <div
                  className="rounded-xl py-4 px-3 flex items-center justify-center transition-all duration-300"
                  style={{ background: 'rgba(3,8,16,0.70)', border: `1px solid ${isPlaying ? assistant.neon + '35' : 'rgba(255,255,255,0.05)'}` }}
                >
                  <WaveBars />
                </div>

                {/* Play button */}
                <div className="flex justify-center">
                  <button
                    onClick={handlePlay}
                    disabled={previewMode || isGenerating}
                    className="flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 disabled:opacity-50"
                    style={{
                      background: isPlaying
                        ? 'rgba(3,8,16,0.85)'
                        : `linear-gradient(135deg,${assistant.gradFrom},${assistant.gradTo})`,
                      border: isPlaying ? `1.5px solid ${assistant.neon}60` : 'none',
                      color: '#fff',
                      boxShadow: isPlaying ? `0 0 20px ${assistant.neon}20` : `0 6px 22px ${assistant.neon}45`,
                    }}
                  >
                    {isGenerating ? <Loader2 size={15} className="animate-spin" /> : isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
                    {btnLabel}
                  </button>
                </div>

                {/* Error */}
                {genError && (
                  <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] text-red-300" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}>
                    <AlertCircle size={12} className="mt-0.5 shrink-0 text-red-400" />
                    {genError}
                  </div>
                )}

                {/* Transcript */}
                <div className="rounded-xl p-3.5 min-h-[80px]" style={{ background: 'rgba(3,8,16,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: assistant.neon }}>
                    Transcripción en tiempo real
                  </p>
                  {displayedText ? (
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {displayedText}
                      {isPlaying && <span className="inline-block w-0.5 h-3 ml-0.5 align-middle animate-pulse" style={{ background: assistant.neon }} />}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600 italic">
                      {isGenerating ? 'Generando respuesta de IA...' : 'Completa los datos y pulsa reproducir para escuchar la simulación.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex justify-center gap-2 pt-2.5 pb-1">
              {[8, 24, 8].map((w, i) => (
                <div key={i} className="h-1 rounded-full" style={{ width: w, background: i === 1 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)' }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Voice SEO Checklist ───────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <CheckCircle2 size={11} className="text-slate-600" /> Voice SEO Checklist
            </p>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}30` }}>
              {passCount}/{checklist.length}
            </span>
          </div>

          <div className="rounded-xl px-3 py-2 text-[10px] text-slate-400 leading-relaxed" style={{ background: 'rgba(3,8,16,0.70)', border: '1px solid rgba(255,255,255,0.06)' }}>
            Optimización para <span className="font-semibold" style={{ color: assistant.neon }}>{assistant.label}</span> — factores que determinan si te recomienda
          </div>

          <div className="space-y-2.5">
            {checklist.map((item, i) => (
              <div key={i} className="rounded-xl p-3 flex gap-3 items-start" style={{ background: statusBg[item.status], border: `1px solid ${statusBorder[item.status]}` }}>
                <StatusIcon s={item.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 leading-tight mb-0.5">{item.label}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{item.detail}</p>
                </div>
                <div className="shrink-0 mt-0.5 text-slate-600">{item.icon}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
              <span>Compatibilidad con voz</span>
              <span className="font-semibold" style={{ color: scoreColor }}>{Math.round((passCount / checklist.length) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(3,8,16,0.80)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(passCount / checklist.length) * 100}%`, background: `linear-gradient(to right,${scoreColor}80,${scoreColor})` }} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
