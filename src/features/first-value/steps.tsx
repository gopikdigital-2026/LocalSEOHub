import { useState } from 'react';
import type { BusinessSetupData } from './types';
import type { GoalId } from '../business-memory/types';
import { Button } from '../../components/ui';
import {
  ArrowRight, ArrowLeft, Clock, Building2, MapPin, Globe, Briefcase, Phone, CalendarCheck, Shield, Eye,
  FileText, Check, Sparkles, AlertTriangle, Info,
} from 'lucide-react';

import { onboardingCopy, type Lang } from './onboardingCopy';

// ─── Progress ───────────────────────────────────────────────────────────────

export function StepProgress({ step, total, lang }: { step: number; total: number; lang: Lang }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8" data-testid="onboarding-progress">
      <span className="text-v2-xs text-v2-text-tertiary font-medium">{onboardingCopy(lang).step(step, total)}</span>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`w-8 h-1 rounded-full transition-colors duration-300 ${i < step ? 'bg-v2-primary-500' : 'bg-v2-neutral-100'}`} />
        ))}
      </div>
    </div>
  );
}

// ─── WelcomeStep ────────────────────────────────────────────────────────────

export function WelcomeStep({ lang, onContinue }: { lang: Lang; onContinue: () => void }) {
  const c = onboardingCopy(lang);
  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto v2-fade-in">
      <div className="w-16 h-16 rounded-v2-2xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center mb-6">
        <Sparkles size={24} className="text-v2-primary-600" />
      </div>
      <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight mb-3">{c.welcomeTitle}</h1>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-8">{c.welcomeText}</p>
      <div className="w-full rounded-v2-xl border border-v2-border-light bg-v2-neutral-50 p-5 mb-8 text-left space-y-3">
        <div className="flex items-center gap-2 text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider">
          <Clock size={12} /> {c.welcomeTime}
        </div>
        <ul className="space-y-2">
          {c.welcomeItems.map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-v2-sm text-v2-text-secondary">
              <Check size={14} className="text-v2-success-500 shrink-0" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <Button size="lg" onClick={onContinue} icon={<ArrowRight size={16} />}>{c.start}</Button>
    </div>
  );
}

// ─── BusinessSetupStep ──────────────────────────────────────────────────────

interface StepActionProps {
  lang: Lang;
  busy: boolean;
  error: string | null;
  onBack: () => void;
}

export function BusinessSetupStep({ initial, onContinue, onBack, lang, busy, error }: StepActionProps & {
  initial: BusinessSetupData | null;
  onContinue: (data: BusinessSetupData) => void;
}) {
  const c = onboardingCopy(lang);
  const [form, setForm] = useState<BusinessSetupData>(initial ?? { name: '', category: '', city: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof BusinessSetupData, string>>>({});

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = c.nameErr;
    if (!form.category.trim()) e.category = c.categoryErr;
    if (!form.city.trim()) e.city = c.cityErr;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function update(field: keyof BusinessSetupData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  return (
    <form className="max-w-md w-full mx-auto v2-fade-in" onSubmit={(e) => { e.preventDefault(); if (!busy && validate()) onContinue(form); }}>
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">{c.bizTitle}</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">{c.bizHelper}</p>
      <div className="space-y-4">
        <FieldInput icon={<Building2 size={15} />} label={c.name} value={form.name} placeholder={c.namePh} error={errors.name} onChange={(v) => update('name', v)} />
        <FieldInput icon={<Briefcase size={15} />} label={c.category} value={form.category} placeholder={c.categoryPh} error={errors.category} onChange={(v) => update('category', v)} />
        <FieldInput icon={<MapPin size={15} />} label={c.city} value={form.city} placeholder={c.cityPh} error={errors.city} onChange={(v) => update('city', v)} />
        <FieldInput icon={<Globe size={15} />} label={c.website} value={form.website} placeholder="https://..." helper={c.websiteHelper} onChange={(v) => update('website', v)} />
      </div>
      <StepError message={error} />
      <div className="flex items-center gap-3 mt-8">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy} icon={<ArrowLeft size={14} />}>{c.back}</Button>
        <Button type="submit" disabled={busy} icon={<ArrowRight size={16} />}>{busy ? c.saving : c.next}</Button>
      </div>
    </form>
  );
}

// ─── PrimaryGoalStep ────────────────────────────────────────────────────────

const GOAL_OPTIONS: { id: GoalId; icon: React.ReactNode; es: [string, string]; en: [string, string] }[] = [
  { id: 'more_calls', icon: <Phone size={18} />, es: ['Conseguir más llamadas', 'Que más clientes te contacten directamente.'], en: ['Get more calls', 'More potential customers contacting you directly.'] },
  { id: 'more_bookings', icon: <CalendarCheck size={18} />, es: ['Conseguir más reservas', 'Facilitar que reserven o pidan cita.'], en: ['Get more bookings', 'Make it easier to book or request an appointment.'] },
  { id: 'better_reputation', icon: <Shield size={18} />, es: ['Mejorar la reputación', 'Cuidar lo que los clientes dicen de ti.'], en: ['Improve reputation', 'Look after what customers say about you.'] },
  { id: 'more_followers', icon: <FileText size={18} />, es: ['Publicar con más constancia', 'Mantener una presencia activa.'], en: ['Post more consistently', 'Keep an active presence.'] },
  { id: 'better_local_seo', icon: <Eye size={18} />, es: ['Aumentar la visibilidad local', 'Que te encuentren en las búsquedas de tu zona.'], en: ['Increase local visibility', 'Be found in searches in your area.'] },
  { id: 'more_web_visits', icon: <Globe size={18} />, es: ['Mejorar la página web', 'Atraer más visitas y convertirlas en clientes.'], en: ['Improve the website', 'Attract more visits and turn them into customers.'] },
];

export function PrimaryGoalStep({ initial, onContinue, onBack, lang, busy, error }: StepActionProps & {
  initial: GoalId | null;
  onContinue: (goalId: GoalId) => void;
}) {
  const c = onboardingCopy(lang);
  const [selected, setSelected] = useState<GoalId | null>(initial);

  return (
    <div className="max-w-md w-full mx-auto v2-fade-in">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">{c.goalTitle}</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">{c.goalHelper}</p>
      <div className="space-y-2.5" role="radiogroup" aria-label={c.goalTitle}>
        {GOAL_OPTIONS.map((goal) => {
          const [label, description] = goal[lang];
          const active = selected === goal.id;
          return (
            <button key={goal.id} type="button" role="radio" aria-checked={active} onClick={() => setSelected(goal.id)}
              className={`w-full text-left rounded-v2-xl border p-4 transition-all duration-150 ${active ? 'border-v2-primary-400 bg-v2-primary-50/50 ring-1 ring-v2-primary-200' : 'border-v2-border-light bg-white hover:border-v2-primary-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-v2-lg flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-v2-primary-100 text-v2-primary-600' : 'bg-v2-neutral-100 text-v2-neutral-500'}`}>{goal.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-v2-sm font-semibold text-v2-text-primary">{label}</p>
                  <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{description}</p>
                </div>
                {active && <div className="w-5 h-5 rounded-full bg-v2-primary-500 flex items-center justify-center shrink-0"><Check size={12} className="text-white" /></div>}
              </div>
            </button>
          );
        })}
      </div>
      <StepError message={error} />
      <div className="flex items-center gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} disabled={busy} icon={<ArrowLeft size={14} />}>{c.back}</Button>
        <Button onClick={() => selected && !busy && onContinue(selected)} disabled={!selected || busy} icon={<ArrowRight size={16} />}>
          {busy ? c.saving : c.finish}
        </Button>
      </div>
    </div>
  );
}

// ─── FinishingStep ──────────────────────────────────────────────────────────

export function FinishingStep({ lang, error, onRetry }: { lang: Lang; error: string | null; onRetry: () => void }) {
  const c = onboardingCopy(lang);
  if (error) {
    return <ErrorRecovery lang={lang} title={c.finishingTitle} message={error} onRetry={onRetry} />;
  }
  return (
    <div className="max-w-md mx-auto text-center v2-fade-in" role="status">
      <div className="w-14 h-14 rounded-v2-2xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center mx-auto mb-6">
        <span className="w-5 h-5 rounded-full border-2 border-v2-primary-500 border-t-transparent animate-spin" />
      </div>
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">{c.finishingTitle}</h1>
      <p className="text-v2-sm text-v2-text-secondary">{c.finishingText}</p>
    </div>
  );
}

// ─── Error Recovery ─────────────────────────────────────────────────────────

export function ErrorRecovery({ lang, title, message, onRetry, onReset }: {
  lang: Lang;
  title: string;
  message: string;
  onRetry?: () => void;
  onReset?: () => void;
}) {
  const c = onboardingCopy(lang);
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="w-14 h-14 rounded-full bg-v2-error-50 border border-v2-error-200 flex items-center justify-center mx-auto mb-6">
        <AlertTriangle size={22} className="text-v2-error-500" />
      </div>
      <h1 className="text-v2-xl font-bold text-v2-text-primary mb-2">{title}</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">{message}</p>
      <div className="flex items-center justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>{c.retry}</Button>}
        {onReset && <Button variant="ghost" onClick={onReset}>{c.reset}</Button>}
      </div>
    </div>
  );
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function StepError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
      <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
      <p className="text-v2-xs text-v2-error-600 leading-relaxed">{message}</p>
    </div>
  );
}

function FieldInput({ icon, label, value, placeholder, error, helper, onChange }: {
  icon: React.ReactNode; label: string; value: string; placeholder: string; error?: string; helper?: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-v2-sm font-medium text-v2-text-primary mb-1.5">
        <span className="text-v2-neutral-400">{icon}</span> {label}
      </label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} aria-invalid={Boolean(error)}
        className={`w-full rounded-v2-lg border bg-white px-4 py-2.5 text-v2-sm text-v2-text-primary placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all ${error ? 'border-v2-error-400' : 'border-v2-border-light'}`} />
      {error && <p className="text-v2-xs text-v2-error-500 mt-1">{error}</p>}
      {!error && helper && <p className="text-v2-xs text-v2-text-tertiary mt-1 flex items-start gap-1"><Info size={11} className="mt-0.5 shrink-0" />{helper}</p>}
    </div>
  );
}
