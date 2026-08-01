import { useState } from 'react';
import type { BusinessSetupData, SourceChoiceType, FirstRecommendationData } from './types';
import type { GoalId } from '../business-memory/types';
import { DataStatusBadge } from '../../components/data-status';
import { Button } from '../../components/ui';
import {
  ArrowRight,
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
  ArrowLeft,
} from 'lucide-react';

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
          <li className="flex items-center gap-2.5 text-v2-sm text-v2-text-secondary">
            <Check size={14} className="text-v2-success-500 shrink-0" /> Una recomendacion personalizada
          </li>
          <li className="flex items-center gap-2.5 text-v2-sm text-v2-text-secondary">
            <Check size={14} className="text-v2-success-500 shrink-0" /> Una accion preparada para ejecutar
          </li>
          <li className="flex items-center gap-2.5 text-v2-sm text-v2-text-secondary">
            <Check size={14} className="text-v2-success-500 shrink-0" /> Tu primer plan semanal iniciado
          </li>
        </ul>
      </div>

      <Button size="lg" onClick={onContinue} icon={<ArrowRight size={16} />}>
        Empezar
      </Button>
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

  function handleSubmit() {
    if (validate()) onContinue(form);
  }

  function update(field: keyof BusinessSetupData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">
        Tu negocio
      </h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Solo necesitamos lo basico para empezar.</p>

      <div className="space-y-4">
        <FieldInput icon={<Building2 size={15} />} label="Nombre del negocio" value={form.name} placeholder="Ej: Clinica Dental Sonrie" error={errors.name} onChange={(v) => update('name', v)} />
        <FieldInput icon={<Briefcase size={15} />} label="Categoria" value={form.category} placeholder="Ej: Restaurante, Clinica, Peluqueria..." error={errors.category} onChange={(v) => update('category', v)} />
        <FieldInput icon={<MapPin size={15} />} label="Ciudad" value={form.city} placeholder="Ej: Madrid" error={errors.city} onChange={(v) => update('city', v)} />
        <FieldInput icon={<Globe size={15} />} label="Sitio web (opcional)" value={form.website} placeholder="https://..." onChange={(v) => update('website', v)} />
      </div>

      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
        <Button onClick={handleSubmit} icon={<ArrowRight size={16} />}>Continuar</Button>
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
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">
        Tu objetivo principal
      </h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Selecciona uno. Podras cambiarlo mas adelante.</p>

      <div className="space-y-2.5">
        {GOAL_OPTIONS.map((goal) => (
          <button
            key={goal.id}
            onClick={() => setSelected(goal.id)}
            className={`w-full text-left rounded-v2-xl border p-4 transition-all duration-150
              ${selected === goal.id
                ? 'border-v2-primary-400 bg-v2-primary-50/50 ring-1 ring-v2-primary-200'
                : 'border-v2-border-light bg-white hover:border-v2-primary-200'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-v2-lg flex items-center justify-center shrink-0 ${selected === goal.id ? 'bg-v2-primary-100 text-v2-primary-600' : 'bg-v2-neutral-100 text-v2-neutral-500'}`}>
                {goal.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-v2-sm font-semibold text-v2-text-primary">{goal.label}</p>
                <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{goal.description}</p>
              </div>
              {selected === goal.id && (
                <div className="w-5 h-5 rounded-full bg-v2-primary-500 flex items-center justify-center shrink-0">
                  <Check size={12} className="text-white" />
                </div>
              )}
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
  const options: { type: SourceChoiceType; label: string; description: string; confidence: string; icon: React.ReactNode; available: boolean }[] = [
    { type: 'website_analysis', label: 'Analizar mi sitio web', description: 'Extraemos informacion publica de tu pagina para generar recomendaciones.', confidence: 'Estimacion basada en datos publicos', icon: <Globe size={18} />, available: hasWebsite },
    { type: 'manual_entry', label: 'Introducir datos manualmente', description: 'Responde algunas preguntas sobre tu situacion actual.', confidence: 'Dato verificado por ti', icon: <PenTool size={18} />, available: true },
    { type: 'demo', label: 'Continuar con datos de ejemplo', description: 'Usa datos demostrativos para explorar la herramienta.', confidence: 'Ejemplo demostrativo', icon: <FlaskConical size={18} />, available: true },
  ];

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">
        Fuente de informacion
      </h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">Elige como obtener los datos iniciales para tu primera recomendacion.</p>

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.type}
            onClick={() => onContinue(opt.type)}
            disabled={!opt.available}
            className={`w-full text-left rounded-v2-xl border p-5 transition-all duration-150
              ${opt.available ? 'border-v2-border-light bg-white hover:border-v2-primary-200 hover:bg-v2-primary-50/20' : 'border-v2-border-light bg-v2-neutral-50 opacity-50 cursor-not-allowed'}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-v2-lg bg-v2-neutral-100 text-v2-neutral-500 flex items-center justify-center shrink-0">
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-v2-sm font-semibold text-v2-text-primary mb-0.5">{opt.label}</p>
                <p className="text-v2-xs text-v2-text-tertiary leading-relaxed mb-2">{opt.description}</p>
                <div className="flex items-center gap-1.5">
                  <Database size={11} className="text-v2-neutral-400" />
                  <span className="text-v2-xs text-v2-text-tertiary">{opt.confidence}</span>
                </div>
              </div>
              <ArrowRight size={14} className="text-v2-neutral-300 mt-1 shrink-0" />
            </div>
            {!opt.available && (
              <p className="text-v2-xs text-v2-warning-500 mt-2 ml-[52px]">Introduce un sitio web en el paso anterior para habilitar esta opcion.</p>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>Atras</Button>
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
  const phases = [
    { label: 'Perfil del negocio', done: true },
    { label: 'Objetivo principal', done: true },
    { label: sourceType === 'website_analysis' ? 'Analisis del sitio web' : sourceType === 'manual_entry' ? 'Datos manuales' : 'Datos de ejemplo', done: true },
    { label: 'Generando recomendacion', done: true },
  ];

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-14 h-14 rounded-v2-2xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center mx-auto mb-6">
        <Target size={22} className="text-v2-primary-600" />
      </div>

      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">
        Analizando {businessName}
      </h1>
      <p className="text-v2-sm text-v2-text-secondary mb-8">Hemos recopilado lo necesario para tu primera recomendacion.</p>

      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 text-left space-y-3 mb-8">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-v2-success-50 border border-v2-success-200 flex items-center justify-center shrink-0">
              <Check size={12} className="text-v2-success-600" />
            </div>
            <span className="text-v2-sm text-v2-text-primary">{phase.label}</span>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onComplete} icon={<ArrowRight size={16} />}>
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
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-6">
        Tu primera recomendacion
      </h1>

      <div className="rounded-v2-xl border border-v2-primary-200 bg-white overflow-hidden">
        {/* Title */}
        <div className="p-5 sm:p-6 border-b border-v2-border-light">
          <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">{recommendation.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <DataStatusBadge confidence={recommendation.confidence} />
            <span className="text-v2-xs text-v2-text-tertiary flex items-center gap-1">
              <Clock size={11} /> ~{recommendation.estimatedMinutes} min
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5">
          <InfoBlock label="Que ocurre" text={recommendation.whatHappens} />
          <InfoBlock label="Por que importa" text={recommendation.whyItMatters} />
          <InfoBlock label="Que hemos preparado" text={recommendation.whatWePrepared} />

          <div className="pt-4 border-t border-v2-border-light grid grid-cols-2 gap-4">
            <div>
              <p className="text-v2-xs text-v2-text-tertiary mb-1">Fuente</p>
              <p className="text-v2-sm text-v2-text-primary font-medium">{recommendation.source}</p>
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

// ─── FirstValueSuccess ──────────────────────────────────────────────────────

interface FirstValueSuccessProps {
  goalLabel: string;
  actionTitle: string;
  timeSeconds: number;
  onGoToWeeklyPlan: () => void;
  onGoToToday: () => void;
}

export function FirstValueSuccess({ goalLabel, actionTitle, timeSeconds, onGoToWeeklyPlan, onGoToToday }: FirstValueSuccessProps) {
  const minutes = Math.ceil(timeSeconds / 60);

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-v2-success-50 border border-v2-success-200 flex items-center justify-center mx-auto mb-6">
        <Check size={28} className="text-v2-success-600" />
      </div>

      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-3">
        Tu primera accion esta completada
      </h1>

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
        <Button size="lg" onClick={onGoToWeeklyPlan} icon={<Target size={16} />}>
          Ver mi plan de esta semana
        </Button>
        <Button variant="secondary" onClick={onGoToToday}>
          Ir a Hoy
        </Button>
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
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-v2-lg border bg-white px-4 py-2.5 text-v2-sm text-v2-text-primary
          placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all
          ${error ? 'border-v2-error-400' : 'border-v2-border-light'}`}
      />
      {error && <p className="text-v2-xs text-v2-error-500 mt-1">{error}</p>}
    </div>
  );
}

function InfoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-1">{label}</p>
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
