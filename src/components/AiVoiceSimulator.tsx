import { useState, useEffect, useRef } from 'react';
import {
  Mic, Play, Pause, Volume2, CheckCircle2, XCircle, AlertTriangle,
  Wifi, Smartphone, MapPin, Radio, Sparkles, Bot, Car, Signal,
  BatteryFull, ChevronDown,
} from 'lucide-react';
import { Lock } from 'lucide-react';

// ── Data ────────────────────────────────────────────────────────────────────

const ASSISTANTS = [
  {
    id: 'siri', label: 'Siri',  sublabel: 'Apple',
    neon: '#3b82f6', gradFrom: '#1d4ed8', gradTo: '#3b82f6',
    icon: <Mic size={14} />,
  },
  {
    id: 'gemini', label: 'Gemini Live', sublabel: 'Google',
    neon: '#10b981', gradFrom: '#065f46', gradTo: '#10b981',
    icon: <Sparkles size={14} />,
  },
  {
    id: 'copilot', label: 'Copilot Car', sublabel: 'Microsoft',
    neon: '#38bdf8', gradFrom: '#0369a1', gradTo: '#38bdf8',
    icon: <Bot size={14} />,
  },
  {
    id: 'alexa', label: 'Alexa', sublabel: 'Amazon',
    neon: '#22d3ee', gradFrom: '#155e75', gradTo: '#22d3ee',
    icon: <Radio size={14} />,
  },
] as const;

const SCENARIOS = [
  'Busca un restaurante con terraza tranquilo para una cena de negocios en [Ciudad]',
  '¿Cuál es la peluquería mejor valorada cerca de mí que abra los domingos?',
  'Encuentra un fontanero de urgencias disponible ahora en [Ciudad]',
  'Recomiéndame un hotel con parking gratuito y buenas vistas en [Ciudad]',
  '¿Dónde puedo desayunar algo saludable cerca de [Ciudad] antes de las 8?',
];

const TRANSCRIPTIONS: Record<string, string> = {
  siri:
    'He encontrado varios restaurantes con terraza en tu zona. El mejor valorado es «El Jardín de los Sentidos», con 4.8 estrellas. Tiene terraza tranquila, ideal para reuniones de negocios y menú ejecutivo disponible. ¿Quieres que te lleve allí o prefieres ver más opciones?',
  gemini:
    'Basándome en las reseñas de Google Maps y tu ubicación actual, te recomiendo «Terraza Mediterránea» — puntuación 4.9, ambiente tranquilo confirmado por 312 usuarios, menú ejecutivo disponible a mediodía y por la tarde. ¿Quieres que reserve una mesa para esta noche?',
  copilot:
    'He encontrado tres opciones destacadas con terraza para cenas de negocios cerca de ti. La más valorada tiene parking propio, WiFi de alta velocidad y sala privada disponible. Puedo añadirlo a tu agenda de Outlook directamente. ¿Procedo con la reserva?',
  alexa:
    'Aquí tienes los mejores restaurantes con terraza para negocios cerca de tu ubicación. El número uno en Yelp y TripAdvisor es «La Pérgola». Aceptan reservas por voz, tienen acceso adaptado y su terraza es considerada la más tranquila de la zona. ¿Hago la reserva?',
};

type Status = 'pass' | 'warn' | 'fail';

interface CheckItem {
  label: string;
  detail: string;
  status: Status;
  icon: React.ReactNode;
}

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
    { label: 'Integración con Bing Places',  detail: 'Ficha no reclamada en Bing — Copilot Car no te encuentra en ruta',         status: 'fail', icon: <MapPin size={12} /> },
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

// ── Component ────────────────────────────────────────────────────────────────

export default function AiVoiceSimulator({ previewMode }: { previewMode?: boolean }) {
  const [assistantId, setAssistantId] = useState<'siri' | 'gemini' | 'copilot' | 'alexa'>('gemini');
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [done, setDone] = useState(false);
  const charRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const assistant = ASSISTANTS.find(a => a.id === assistantId)!;
  const fullText = TRANSCRIPTIONS[assistantId];
  const checklist = CHECKLIST[assistantId];

  // Reset when assistant changes
  useEffect(() => {
    setIsPlaying(false);
    setTranscript('');
    setDone(false);
    charRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [assistantId]);

  // Typing loop
  useEffect(() => {
    if (!isPlaying) return;
    const run = () => {
      if (charRef.current >= fullText.length) {
        setDone(true);
        setIsPlaying(false);
        return;
      }
      charRef.current += 1;
      setTranscript(fullText.slice(0, charRef.current));
      timerRef.current = setTimeout(run, 16 + Math.random() * 14);
    };
    timerRef.current = setTimeout(run, 20);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, fullText]);

  const togglePlay = () => {
    if (previewMode) return;
    if (isPlaying) { setIsPlaying(false); return; }
    setTranscript('');
    setDone(false);
    charRef.current = 0;
    setIsPlaying(true);
  };

  const passCount  = checklist.filter(c => c.status === 'pass').length;
  const totalCount = checklist.length;
  const scoreColor = passCount >= 4 ? '#10b981' : passCount >= 2 ? '#f59e0b' : '#ef4444';

  // ── Wave bars ──────────────────────────────────────────────────────────────
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
              width: 3,
              height: base,
              borderRadius: 2,
              background: `linear-gradient(to top, ${assistant.neon}, rgba(16,185,129,0.5))`,
              boxShadow: isPlaying ? `0 0 6px ${assistant.neon}80` : 'none',
              transformOrigin: 'bottom',
              transition: 'box-shadow 0.3s',
              animation: isPlaying
                ? `voiceWave ${dur}s ${del}s ease-in-out infinite`
                : 'none',
            }}
          />
        );
      })}
    </div>
  );

  // ── Status helpers ─────────────────────────────────────────────────────────
  const StatusIcon = ({ s }: { s: Status }) =>
    s === 'pass' ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> :
    s === 'warn' ? <AlertTriangle size={14} className="text-amber-400 shrink-0" /> :
                   <XCircle size={14} className="text-red-400 shrink-0" />;

  const statusBg: Record<Status, string> = {
    pass: 'rgba(16,185,129,0.10)',
    warn: 'rgba(245,158,11,0.10)',
    fail: 'rgba(239,68,68,0.10)',
  };
  const statusBorder: Record<Status, string> = {
    pass: 'rgba(16,185,129,0.22)',
    warn: 'rgba(245,158,11,0.22)',
    fail: 'rgba(239,68,68,0.22)',
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <p className="text-slate-500 text-xs">Simula cómo los asistentes de voz recomiendan tu negocio</p>
        </div>
        {previewMode && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
            <Lock size={11} />
            Plan Pro
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: Scenario Selector ──────────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-widest">
            <Mic size={12} className="text-slate-500" />
            Configurar escenario
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

          {/* Scenario dropdown */}
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
          </div>

          {/* Query preview */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2">Consulta conversacional</p>
            <div
              className="rounded-xl px-3.5 py-3 text-xs text-slate-300 leading-relaxed italic"
              style={{ background: 'rgba(3,8,16,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              "{SCENARIOS[scenarioIdx]}"
            </div>
          </div>

          <p className="text-[10px] text-slate-600 leading-relaxed">
            El simulador genera una respuesta realista de cada asistente basada en los atributos de tu ficha de negocio.
          </p>
        </div>

        {/* ── Center: CarPlay Mockup ────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center">
          {/* Car dashboard frame */}
          <div
            className="w-full max-w-sm rounded-3xl p-3 relative"
            style={{
              background: 'linear-gradient(160deg, #1a1f2e 0%, #0d1018 100%)',
              border: '2px solid rgba(255,255,255,0.08)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* Side vents decoration */}
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 flex flex-col gap-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-1 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 flex flex-col gap-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-1 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>

            {/* Screen */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #060810 0%, #04060c 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Status bar */}
              <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-[10px] font-semibold text-slate-400">9:41</span>
                <div className="flex items-center gap-1.5">
                  <Car size={10} className="text-slate-600" />
                  <span className="text-[9px] text-slate-600 font-medium">CarPlay</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Signal size={10} className="text-slate-400" />
                  <BatteryFull size={10} className="text-slate-400" />
                </div>
              </div>

              {/* Main display */}
              <div className="px-5 py-5 space-y-5">
                {/* Assistant badge */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${assistant.gradFrom}, ${assistant.gradTo})`, boxShadow: `0 4px 14px ${assistant.neon}40` }}
                  >
                    <span className="text-white">{assistant.icon}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-tight">{assistant.label}</p>
                    <p className="text-[9px]" style={{ color: assistant.neon }}>
                      {isPlaying ? '● Escuchando...' : done ? '✓ Listo' : 'En espera'}
                    </p>
                  </div>
                  {isPlaying && (
                    <div className="ml-auto">
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: assistant.neon, boxShadow: `0 0 8px ${assistant.neon}` }} />
                    </div>
                  )}
                </div>

                {/* Wave visualization */}
                <div
                  className="rounded-xl py-4 px-3 flex items-center justify-center"
                  style={{ background: 'rgba(3,8,16,0.70)', border: `1px solid ${isPlaying ? assistant.neon + '30' : 'rgba(255,255,255,0.05)'}`, transition: 'border-color 0.4s' }}
                >
                  <WaveBars />
                </div>

                {/* Play button */}
                <div className="flex justify-center">
                  <button
                    onClick={togglePlay}
                    disabled={previewMode}
                    className="flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 disabled:opacity-40"
                    style={{
                      background: isPlaying
                        ? 'rgba(3,8,16,0.85)'
                        : `linear-gradient(135deg, ${assistant.gradFrom}, ${assistant.gradTo})`,
                      border: isPlaying ? `1.5px solid ${assistant.neon}60` : 'none',
                      color: '#fff',
                      boxShadow: isPlaying ? `0 0 20px ${assistant.neon}20` : `0 6px 22px ${assistant.neon}45`,
                    }}
                  >
                    {isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
                    {isPlaying ? 'Detener' : done ? 'Repetir simulación' : 'Escuchar simulación'}
                  </button>
                </div>

                {/* Transcript */}
                <div
                  className="rounded-xl p-3.5 min-h-[72px]"
                  style={{ background: 'rgba(3,8,16,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: assistant.neon }}>
                    Transcripción en tiempo real
                  </p>
                  {transcript ? (
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {transcript}
                      {isPlaying && <span className="inline-block w-0.5 h-3 ml-0.5 align-middle animate-pulse" style={{ background: assistant.neon }} />}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600 italic">Pulsa reproducir para iniciar la simulación...</p>
                  )}
                </div>
              </div>
            </div>

            {/* Dashboard bottom bar */}
            <div className="flex justify-center gap-2 pt-2.5 pb-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-1 rounded-full" style={{ width: i === 1 ? 24 : 8, background: i === 1 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)' }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Voice SEO Checklist ───────────────────────────────────── */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-widest">
              <CheckCircle2 size={12} className="text-slate-500" />
              Voice SEO Checklist
            </div>
            <div
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}30` }}
            >
              {passCount}/{totalCount}
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2 text-[10px] text-slate-400 leading-relaxed"
            style={{ background: 'rgba(3,8,16,0.70)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            Optimización para <span className="font-semibold" style={{ color: assistant.neon }}>{assistant.label}</span> — factores que determinan si te recomienda
          </div>

          <div className="space-y-2.5">
            {checklist.map((item, i) => (
              <div
                key={i}
                className="rounded-xl p-3 flex gap-3 items-start transition-all duration-200"
                style={{ background: statusBg[item.status], border: `1px solid ${statusBorder[item.status]}` }}
              >
                <StatusIcon s={item.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200 leading-tight mb-0.5">{item.label}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{item.detail}</p>
                </div>
                <div className="shrink-0 mt-0.5 text-slate-600">{item.icon}</div>
              </div>
            ))}
          </div>

          {/* Score bar */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
              <span>Compatibilidad con voz</span>
              <span style={{ color: scoreColor }} className="font-semibold">{Math.round((passCount / totalCount) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(3,8,16,0.80)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(passCount / totalCount) * 100}%`, background: `linear-gradient(to right, ${scoreColor}80, ${scoreColor})` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
