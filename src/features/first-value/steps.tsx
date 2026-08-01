import { useState, useEffect, useRef } from 'react';
import type { BusinessSetupData, SourceChoiceType, FirstRecommendationData, ManualContextData, Confidence } from './types';
import type { GoalId } from '../business-memory/types';
import { Button } from '../../components/ui';
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  Building2,
  MapPin,
  Globe,
  Briefcase,
  Phone,
  Target,
  CalendarCheck,
  Shield,
  Eye,
  FileText,
  Database,
  PenTool,
  FlaskConical,
  Check,
  Sparkles,
  Copy,
  Edit3,
  Info,
  AlertTriangle,
} from 'lucide-react';

// ─── Transparency Badge ─────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const config: Record<Confidence, { label: string; style: string }> = {
    high: { label: 'Confianza alta', style: 'bg-v2-success-50 text-v2-success-600 border-v2-success-200' },
    medium: { label: 'Confianza media', style: 'bg-v2-warning-50 text-v2-warning-600 border-v2-warning-200' },
    low: { label: 'Orientacion inicial', style: 'bg-v2-neutral-100 text-v2-neutral-600 border-v2-neutral-200' },
  };
  const c = config[confidence];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-v2-xs font-medium rounded-full border ${c.style}`}>
      <Info size={11} />
      {c.label}
    </span>
  );
}

function DataModeBadge({ dataMode }: { dataMode: string }) {
  const labels: Record<string, { label: string; style: string }> = {
    verified: { label: 'Dato verificado', style: 'bg-v2-success-50 text-v2-success-600 border-v2-success-200' },
    estimated: { label: 'Estimacion', style: 'bg-v2-warning-50 text-v2-warning-600 border-v2-warning-200' },
    manual: { label: 'Dato manual', style: 'bg-blue-50 text-blue-600 border-blue-200' },
    demo: { label: 'Ejemplo demostrativo', style: 'bg-v2-neutral-100 text-v2-neutral-600 border-v2-neutral-200' },
  };
  const c = labels[dataMode] ?? labels.estimated;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-v2-xs font-medium rounded-full border ${c.style}`}>
      <Database size={11} />
      {c.label}
    </span>
  );
}

// ─── WelcomeStep ────────────────────────────────────────────────────────────

interface WelcomeStepProps {
  onContinue: () => void;
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-v2-2xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center mb-6">
        <Sparkles size={24} className="text-v2-primary-600" />
      </div>
      <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight mb-3">
        Vamos a preparar tu primer plan de crecimiento
      </h1>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-8">
        Necesitamos conocer lo esencial de tu negocio para recomendarte una primera accion util.
      </p>
      <div className="w-full rounded-v2-xl border border-v2-border-light bg-v2-neutral-50 p-5 mb-8 text-left space-y-3">
        <div className="flex items-center gap-2 text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider">
          <Clock size={12} /> Menos de 10 minutos
        </div>
        <ul className="space-y-2">
          {['Una recomendacion personalizada', 'Una accion preparada para ejecutar', 'Tu primer plan semanal iniciado'].map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-v2-sm text-v2-text-secondary">
              <Check size={14} className="text-v2-success-500 shrink-0" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <Button size="lg" onClick={onContinue} icon={<ArrowRight size={16} />}>Empezar</Button>
    </div>
  );
}

// ─── BusinessSetupStep ──────────────────────────────────────────────────────

interface BusinessSetupStepProps {
  initial: BusinessSetupData | null;
  onContinue: (data: BusinessSetupData) => void;
  onBack: () => void;
}

export function BusinessSetupStep({ initial, onContinue, onBack }: BusinessSetupStepProps) {
  const [form, setForm] = useState<BusinessSetupData>(initial ?? { name: '', category: '', city: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof BusinessSetupData, string>>>({});

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'El nombre es necesario';
    if (!form.category.trim()) e.category = 'Indica la categoria';
    if (!form.city.trim()) e.city = 'Indica la ciudad';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function update(field: keyof BusinessSetupData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">Tu negocio</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Solo necesitamos lo basico para empezar.</p>
      <div className="space-y-4">
        <FieldInput icon={<Building2 size={15} />} label="Nombre del negocio" value={form.name} placeholder="Ej: Clinica Dental Sonrie" error={errors.name} onChange={(v) => update('name', v)} />
        <FieldInput icon={<Briefcase size={15} />} label="Categoria" value={form.category} placeholder="Ej: Restaurante, Clinica, Peluqueria..." error={errors.category} onChange={(v) => update('category', v)} />
        <FieldInput icon={<MapPin size={15} />} label="Ciudad" value={form.city} placeholder="Ej: Madrid" error={errors.city} onChange={(v) => update('city', v)} />
        <FieldInput icon={<Globe size={15} />} label="Sitio web (opcional)" value={form.website} placeholder="https://..." onChange={(v) => update('website', v)} />
      </div>
      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
        <Button onClick={() => validate() && onContinue(form)} icon={<ArrowRight size={16} />}>Continuar</Button>
      </div>
    </div>
  );
}

// ─── PrimaryGoalStep ────────────────────────────────────────────────────────

const GOAL_OPTIONS: { id: GoalId; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'more_calls', label: 'Conseguir mas llamadas', description: 'Que mas clientes potenciales te contacten directamente.', icon: <Phone size={18} /> },
  { id: 'more_bookings', label: 'Conseguir mas reservas', description: 'Facilitar que reserven o soliciten cita desde tu perfil.', icon: <CalendarCheck size={18} /> },
  { id: 'better_reputation', label: 'Mejorar la reputacion', description: 'Gestionar activamente lo que los clientes dicen de ti.', icon: <Shield size={18} /> },
  { id: 'more_followers', label: 'Publicar con mas constancia', description: 'Mantener una presencia activa y visible para tu audiencia.', icon: <FileText size={18} /> },
  { id: 'better_local_seo', label: 'Aumentar visibilidad local', description: 'Aparecer mas arriba en Google Maps y busquedas de tu zona.', icon: <Eye size={18} /> },
  { id: 'more_web_visits', label: 'Mejorar la pagina web', description: 'Atraer mas visitas y convertirlas en clientes.', icon: <Globe size={18} /> },
];

interface PrimaryGoalStepProps {
  initial: GoalId | null;
  onContinue: (goalId: GoalId) => void;
  onBack: () => void;
}

export function PrimaryGoalStep({ initial, onContinue, onBack }: PrimaryGoalStepProps) {
  const [selected, setSelected] = useState<GoalId | null>(initial);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">Tu objetivo principal</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Selecciona uno. Podras cambiarlo mas adelante.</p>
      <div className="space-y-2.5">
        {GOAL_OPTIONS.map((goal) => (
          <button key={goal.id} onClick={() => setSelected(goal.id)} className={`w-full text-left rounded-v2-xl border p-4 transition-all duration-150 ${selected === goal.id ? 'border-v2-primary-400 bg-v2-primary-50/50 ring-1 ring-v2-primary-200' : 'border-v2-border-light bg-white hover:border-v2-primary-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-v2-lg flex items-center justify-center shrink-0 ${selected === goal.id ? 'bg-v2-primary-100 text-v2-primary-600' : 'bg-v2-neutral-100 text-v2-neutral-500'}`}>{goal.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-v2-sm font-semibold text-v2-text-primary">{goal.label}</p>
                <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{goal.description}</p>
              </div>
              {selected === goal.id && <div className="w-5 h-5 rounded-full bg-v2-primary-500 flex items-center justify-center shrink-0"><Check size={12} className="text-white" /></div>}
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
        <Button onClick={() => selected && onContinue(selected)} disabled={!selected} icon={<ArrowRight size={16} />}>Continuar</Button>
      </div>
    </div>
  );
}

// ─── SourceSetupStep ────────────────────────────────────────────────────────

interface SourceSetupStepProps {
  hasWebsite: boolean;
  onContinue: (choice: SourceChoiceType) => void;
  onBack: () => void;
}

export function SourceSetupStep({ hasWebsite, onContinue, onBack }: SourceSetupStepProps) {
  const options: { type: SourceChoiceType; label: string; description: string; detail: string; icon: React.ReactNode; available: boolean }[] = [
    {
      type: 'website_analysis',
      label: 'Usar mi sitio web como referencia',
      description: 'Usaremos la URL que indicaste como contexto para la primera recomendacion.',
      detail: 'Sitio web proporcionado, no analizado automaticamente',
      icon: <Globe size={18} />,
      available: hasWebsite,
    },
    {
      type: 'manual_entry',
      label: 'Contestar unas preguntas sobre mi negocio',
      description: 'Responde 6 preguntas rapidas para que podamos personalizar mejor.',
      detail: 'Dato proporcionado por ti',
      icon: <PenTool size={18} />,
      available: true,
    },
    {
      type: 'demo',
      label: 'Continuar con datos de ejemplo',
      description: 'Usa datos demostrativos para explorar la herramienta.',
      detail: 'Ejemplo demostrativo — no refleja tu negocio real',
      icon: <FlaskConical size={18} />,
      available: true,
    },
  ];

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">Fuente de informacion</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Elige como obtener los datos iniciales para tu primera recomendacion.</p>
      <div className="space-y-3">
        {options.map((opt) => (
          <button key={opt.type} onClick={() => opt.available && onContinue(opt.type)} disabled={!opt.available} className={`w-full text-left rounded-v2-xl border p-5 transition-all duration-150 ${opt.available ? 'border-v2-border-light bg-white hover:border-v2-primary-200 hover:bg-v2-primary-50/20' : 'border-v2-border-light bg-v2-neutral-50 opacity-50 cursor-not-allowed'}`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-v2-lg bg-v2-neutral-100 text-v2-neutral-500 flex items-center justify-center shrink-0">{opt.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-v2-sm font-semibold text-v2-text-primary mb-0.5">{opt.label}</p>
                <p className="text-v2-xs text-v2-text-tertiary leading-relaxed mb-2">{opt.description}</p>
                <div className="flex items-center gap-1.5">
                  <Database size={11} className="text-v2-neutral-400" />
                  <span className="text-v2-xs text-v2-text-tertiary">{opt.detail}</span>
                </div>
              </div>
              <ArrowRight size={14} className="text-v2-neutral-300 mt-1 shrink-0" />
            </div>
            {!opt.available && <p className="text-v2-xs text-v2-warning-500 mt-2 ml-[52px]">Introduce un sitio web en el paso anterior para habilitar esta opcion.</p>}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
      </div>
    </div>
  );
}

// ─── ManualContextStep ──────────────────────────────────────────────────────

interface ManualContextStepProps {
  initial: ManualContextData | null;
  onContinue: (data: ManualContextData) => void;
  onBack: () => void;
}

const MANUAL_QUESTIONS: { field: keyof ManualContextData; label: string; placeholder: string; required: boolean }[] = [
  { field: 'mainService', label: 'Servicio o producto principal', placeholder: 'Ej: Ortodoncia, Corte de pelo, Tapas...', required: true },
  { field: 'clientType', label: 'Tipo de cliente habitual', placeholder: 'Ej: Familias, Jovenes, Empresas locales...', required: true },
  { field: 'mainChannel', label: 'Canal que mas utilizas', placeholder: 'Ej: Google, Instagram, Boca a boca...', required: false },
  { field: 'publishFrequency', label: 'Frecuencia de publicacion actual', placeholder: 'Ej: Nunca, Una vez al mes, Cada semana...', required: false },
  { field: 'receivesReviews', label: 'Recibes resenas online?', placeholder: 'Ej: Si, algunas / No, nunca / Si, muchas...', required: false },
  { field: 'mainDifficulty', label: 'Principal dificultad', placeholder: 'Ej: No tengo tiempo, No se que publicar...', required: false },
  { field: 'communicationTone', label: 'Tono de comunicacion preferido', placeholder: 'Ej: Profesional, Cercano, Informal...', required: false },
];

const EMPTY_CONTEXT: ManualContextData = {
  mainService: '', clientType: '', mainChannel: '', publishFrequency: '', receivesReviews: '', mainDifficulty: '', communicationTone: '',
};

export function ManualContextStep({ initial, onContinue, onBack }: ManualContextStepProps) {
  const [form, setForm] = useState<ManualContextData>(initial ?? EMPTY_CONTEXT);
  const [errors, setErrors] = useState<Partial<Record<keyof ManualContextData, string>>>({});

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.mainService.trim()) e.mainService = 'Indica tu servicio principal';
    if (!form.clientType.trim()) e.clientType = 'Indica tu tipo de cliente';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function update(field: keyof ManualContextData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">Cuentanos sobre tu negocio</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Responde las que puedas. Solo las dos primeras son obligatorias.</p>
      <div className="space-y-4">
        {MANUAL_QUESTIONS.map((q) => (
          <FieldInput
            key={q.field}
            icon={<PenTool size={15} />}
            label={q.label + (q.required ? '' : ' (opcional)')}
            value={form[q.field]}
            placeholder={q.placeholder}
            error={errors[q.field]}
            onChange={(v) => update(q.field, v)}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
        <Button onClick={() => validate() && onContinue(form)} icon={<ArrowRight size={16} />}>Continuar</Button>
      </div>
    </div>
  );
}

// ─── InitialAnalysisStep ────────────────────────────────────────────────────

interface InitialAnalysisStepProps {
  businessName: string;
  sourceType: SourceChoiceType;
  onComplete: () => void;
}

export function InitialAnalysisStep({ businessName, sourceType, onComplete }: InitialAnalysisStepProps) {
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => setReady(true), 1800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const sourceLabel = sourceType === 'website_analysis'
    ? 'Sitio web como referencia'
    : sourceType === 'manual_entry'
      ? 'Datos proporcionados'
      : 'Datos de ejemplo';

  const phases = [
    { label: 'Perfil del negocio', done: true },
    { label: 'Objetivo principal', done: true },
    { label: sourceLabel, done: true },
    { label: 'Preparando recomendacion inicial', done: ready },
  ];

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-14 h-14 rounded-v2-2xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center mx-auto mb-6">
        <Target size={22} className="text-v2-primary-600" />
      </div>
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">
        Preparando recomendacion para {businessName}
      </h1>
      <p className="text-v2-sm text-v2-text-secondary mb-8">Recopilando la informacion disponible para tu primera recomendacion.</p>
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 text-left space-y-3 mb-4">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center gap-3">
            {phase.done ? (
              <div className="w-6 h-6 rounded-full bg-v2-success-50 border border-v2-success-200 flex items-center justify-center shrink-0">
                <Check size={12} className="text-v2-success-600" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-v2-neutral-50 border border-v2-neutral-200 flex items-center justify-center shrink-0 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-v2-neutral-400" />
              </div>
            )}
            <span className="text-v2-sm text-v2-text-primary">{phase.label}</span>
          </div>
        ))}
      </div>
      {sourceType !== 'demo' && (
        <p className="text-v2-xs text-v2-text-tertiary mb-6 flex items-center justify-center gap-1.5">
          <Info size={11} /> La recomendacion sera orientativa hasta conectar fuentes verificadas.
        </p>
      )}
      <Button size="lg" onClick={onComplete} disabled={!ready} icon={<ArrowRight size={16} />}>
        Ver mi recomendacion
      </Button>
    </div>
  );
}

// ─── FirstRecommendationStep ────────────────────────────────────────────────

interface FirstRecommendationStepProps {
  recommendation: FirstRecommendationData;
  onAccept: () => void;
  onBack: () => void;
}

export function FirstRecommendationStep({ recommendation, onAccept, onBack }: FirstRecommendationStepProps) {
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-6">Tu primera recomendacion</h1>
      <div className="rounded-v2-xl border border-v2-primary-200 bg-white overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-v2-border-light">
          <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">{recommendation.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={recommendation.confidence} />
            <DataModeBadge dataMode={recommendation.dataMode} />
            <span className="text-v2-xs text-v2-text-tertiary flex items-center gap-1"><Clock size={11} /> ~{recommendation.estimatedTimeMinutes} min</span>
          </div>
        </div>
        <div className="p-5 sm:p-6 space-y-5">
          <InfoBlock label="Que te recomendamos" text={recommendation.description} />
          <InfoBlock label="Por que esta recomendacion" text={recommendation.reason} />
          <InfoBlock label="Limitaciones" text={recommendation.limitations} icon={<AlertTriangle size={12} className="text-v2-warning-500" />} />
          <div className="pt-4 border-t border-v2-border-light">
            <p className="text-v2-xs text-v2-text-tertiary mb-2">Evidencia disponible</p>
            <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{recommendation.evidenceSummary}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-v2-xs text-v2-text-tertiary mb-1">Fuente</p>
              <p className="text-v2-sm text-v2-text-primary font-medium">{recommendation.sourceName}</p>
            </div>
            <div>
              <p className="text-v2-xs text-v2-text-tertiary mb-1">Impacto</p>
              <p className={`text-v2-sm font-medium ${recommendation.impact === 'high' ? 'text-v2-error-500' : recommendation.impact === 'medium' ? 'text-v2-warning-500' : 'text-v2-neutral-500'}`}>
                {recommendation.impact === 'high' ? 'Alto' : recommendation.impact === 'medium' ? 'Medio' : 'Bajo'}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-6">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
        <Button size="lg" onClick={onAccept} icon={<ArrowRight size={16} />}>Revisar y ejecutar</Button>
      </div>
    </div>
  );
}

// ─── FirstExecutionInline ───────────────────────────────────────────────────

interface FirstExecutionInlineProps {
  recommendation: FirstRecommendationData;
  onComplete: () => void;
}

export function FirstExecutionInline({ recommendation, onComplete }: FirstExecutionInlineProps) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(recommendation.preparedContent.body);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const pc = recommendation.preparedContent;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">{recommendation.title}</h1>
      <div className="flex items-center gap-2 mb-6">
        <ConfidenceBadge confidence={recommendation.confidence} />
        <DataModeBadge dataMode={recommendation.dataMode} />
      </div>

      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-v2-sm font-semibold text-v2-text-primary">{pc.title}</p>
            {pc.callToAction && <p className="text-v2-xs text-v2-text-tertiary mt-0.5">{pc.callToAction}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEditing(!editing)} className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400"><Edit3 size={14} /></button>
            <button onClick={handleCopy} className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400">
              {copied ? <Check size={14} className="text-v2-success-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        {editing ? (
          <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-3 text-v2-sm text-v2-text-primary leading-relaxed focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 resize-y min-h-[140px] transition-all" />
        ) : (
          <p className="text-v2-sm text-v2-text-secondary leading-relaxed whitespace-pre-wrap bg-v2-neutral-50 rounded-v2-lg px-4 py-3">{content}</p>
        )}
      </div>

      {/* Personalization info */}
      <div className="rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 p-4 mb-4 space-y-2">
        {pc.personalizedWith.length > 0 && (
          <p className="text-v2-xs text-v2-text-tertiary">
            <span className="font-medium">Personalizado con:</span> {pc.personalizedWith.join(', ')}.
          </p>
        )}
        {pc.missingData.length > 0 && (
          <p className="text-v2-xs text-v2-warning-600 flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0" />
            Completa {pc.missingData.join(', ')} para mejorar esta propuesta.
          </p>
        )}
      </div>

      <p className="text-v2-xs text-v2-text-tertiary mb-6">
        Contenido copiado. Marca la accion como completada cuando la hayas utilizado.
      </p>

      <Button size="lg" onClick={onComplete} icon={<Check size={16} />}>Marcar como completada</Button>
    </div>
  );
}

// ─── FirstValueSuccess ──────────────────────────────────────────────────────

interface FirstValueSuccessProps {
  goalLabel: string;
  actionTitle: string;
  timeSeconds: number;
  onGoToPlan: () => void;
  onGoToToday: () => void;
}

export function FirstValueSuccess({ goalLabel, actionTitle, timeSeconds, onGoToPlan, onGoToToday }: FirstValueSuccessProps) {
  const minutes = Math.ceil(timeSeconds / 60);

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-v2-success-50 border border-v2-success-200 flex items-center justify-center mx-auto mb-6">
        <Check size={28} className="text-v2-success-600" />
      </div>
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-3">Tu primera accion esta completada</h1>
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 text-left space-y-3 mb-6">
        <SummaryRow label="Accion realizada" value={actionTitle} />
        <SummaryRow label="Tiempo invertido" value={`${minutes} minuto${minutes !== 1 ? 's' : ''}`} />
        <SummaryRow label="Objetivo que apoya" value={goalLabel} />
        <SummaryRow label="Registrada en" value="Historial y memoria del negocio" />
      </div>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-8">
        LocalSEOHub utilizara esta actividad para personalizar tus proximas recomendaciones.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button size="lg" onClick={onGoToPlan} icon={<Target size={16} />}>Ver mi plan de esta semana</Button>
        <Button variant="secondary" onClick={onGoToToday}>Ir a Hoy</Button>
      </div>
    </div>
  );
}

// ─── Error Recovery ─────────────────────────────────────────────────────────

interface ErrorRecoveryProps {
  title: string;
  message: string;
  onRetry?: () => void;
  onReset?: () => void;
}

export function ErrorRecovery({ title, message, onRetry, onReset }: ErrorRecoveryProps) {
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-14 h-14 rounded-full bg-v2-error-50 border border-v2-error-200 flex items-center justify-center mx-auto mb-6">
        <AlertTriangle size={22} className="text-v2-error-500" />
      </div>
      <h1 className="text-v2-xl font-bold text-v2-text-primary mb-2">{title}</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">{message}</p>
      <div className="flex items-center justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>Reintentar</Button>}
        {onReset && <Button variant="ghost" onClick={onReset}>Empezar de nuevo</Button>}
      </div>
    </div>
  );
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function FieldInput({ icon, label, value, placeholder, error, onChange }: { icon: React.ReactNode; label: string; value: string; placeholder: string; error?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-v2-sm font-medium text-v2-text-primary mb-1.5">
        <span className="text-v2-neutral-400">{icon}</span> {label}
      </label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full rounded-v2-lg border bg-white px-4 py-2.5 text-v2-sm text-v2-text-primary placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all ${error ? 'border-v2-error-400' : 'border-v2-border-light'}`} />
      {error && <p className="text-v2-xs text-v2-error-500 mt-1">{error}</p>}
    </div>
  );
}

function InfoBlock({ label, text, icon }: { label: string; text: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{text}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-v2-xs text-v2-text-tertiary">{label}</span>
      <span className="text-v2-sm font-medium text-v2-text-primary text-right">{value}</span>
    </div>
  );
}
