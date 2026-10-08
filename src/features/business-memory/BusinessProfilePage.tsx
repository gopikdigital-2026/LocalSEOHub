import { useEffect, useMemo, useState } from 'react';
import type { BusinessProfile } from './types';
import { createMemoryRepository } from './repository';
import { registerProfileUpdated } from './engine';
import { useBusiness } from './BusinessContext';
import { profileToPatch, toProfile } from './businessRecord';
import { Button, LoadingState } from '../../components/ui';
import { trackBusinessProfileUpdated } from '../../services/analytics/v2Analytics';
import { useI18n } from '../../lib/i18n';
import { PROFILE_LIMITS, normalizeWebsite, validateProfile, type ProfileErrors } from './profileValidation';
import { Check, Building2, MapPin, Globe, Phone, Clock, Users, Briefcase } from 'lucide-react';

const COPY = {
  es: {
    title: 'Tu negocio',
    intro: 'Cuanto más completos estén tus datos, mejor adaptadas estarán tus recomendaciones. Todos los campos son opcionales salvo el nombre, la actividad y la ciudad.',
    name: 'Nombre', namePh: 'Nombre de tu negocio', category: 'Actividad', categoryPh: 'Ej: Restaurante, Clínica dental...',
    city: 'Ciudad', cityPh: 'Ej: Madrid', website: 'Página web', phone: 'Teléfono', schedule: 'Horario', schedulePh: 'Ej: L-V 9:00-18:00',
    audience: 'Público objetivo', audiencePh: 'Ej: Familias del barrio, profesionales...',
    services: 'Servicios', servicePh: 'Añadir servicio...', add: 'Añadir', remove: (s: string) => `Quitar ${s}`,
    save: 'Guardar cambios', saving: 'Guardando...', savedBtn: 'Guardado',
    saved: 'Datos guardados. Tus recomendaciones se actualizan con esta información.',
    invalid: 'Revisa los campos marcados antes de guardar.',
    failed: 'No se pudieron guardar los cambios. Comprueba tu conexión e inténtalo de nuevo.',
    loading: 'Cargando tu negocio...', loadFailed: 'No se pudo cargar tu negocio.', retry: 'Reintentar',
  },
  en: {
    title: 'Your business',
    intro: 'The more complete your details, the better tailored your recommendations. Every field is optional except name, activity and city.',
    name: 'Name', namePh: 'Your business name', category: 'Activity', categoryPh: 'E.g. Restaurant, Dental clinic...',
    city: 'City', cityPh: 'E.g. Madrid', website: 'Website', phone: 'Phone', schedule: 'Opening hours', schedulePh: 'E.g. Mon-Fri 9:00-18:00',
    audience: 'Target audience', audiencePh: 'E.g. Local families, professionals...',
    services: 'Services', servicePh: 'Add a service...', add: 'Add', remove: (s: string) => `Remove ${s}`,
    save: 'Save changes', saving: 'Saving...', savedBtn: 'Saved',
    saved: 'Details saved. Your recommendations are updated with this information.',
    invalid: 'Check the highlighted fields before saving.',
    failed: 'Your changes could not be saved. Check your connection and try again.',
    loading: 'Loading your business...', loadFailed: 'Your business could not be loaded.', retry: 'Retry',
  },
};
type Copy = typeof COPY.es;

interface FieldBlockProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  field: keyof BusinessProfile;
  error?: string;
  maxLength: number;
  onChange: (field: keyof BusinessProfile, value: string) => void;
}

function FieldBlock({ icon, label, value, placeholder, field, error, maxLength, onChange }: FieldBlockProps) {
  const id = `profile-${field}`;
  return (
    <div className={`group rounded-v2-xl border bg-white p-5 transition-all ${error ? 'border-v2-error-200' : 'border-v2-border-light hover:border-v2-primary-200'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-v2-lg bg-v2-neutral-50 border border-v2-border-light flex items-center justify-center text-v2-neutral-500">
          {icon}
        </div>
        <label htmlFor={id} className="text-v2-sm font-semibold text-v2-text-primary">{label}</label>
      </div>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-2.5 text-v2-sm text-v2-text-primary
          placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all"
      />
      {error && <p id={`${id}-error`} className="mt-2 text-v2-xs text-v2-error-600">{error}</p>}
    </div>
  );
}

function ServicesBlock({ services, error, t, onChange }: { services: string[]; error?: string; t: Copy; onChange: (services: string[]) => void }) {
  const [input, setInput] = useState('');

  function addService() {
    const trimmed = input.trim();
    if (trimmed && !services.includes(trimmed) && services.length < PROFILE_LIMITS.services) {
      onChange([...services, trimmed]);
      setInput('');
    }
  }

  function removeService(service: string) {
    onChange(services.filter((s) => s !== service));
  }

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 hover:border-v2-primary-200 transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-v2-lg bg-v2-neutral-50 border border-v2-border-light flex items-center justify-center text-v2-neutral-500">
          <Briefcase size={15} />
        </div>
        <label htmlFor="profile-service-input" className="text-v2-sm font-semibold text-v2-text-primary">{t.services}</label>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          id="profile-service-input"
          type="text"
          value={input}
          maxLength={PROFILE_LIMITS.service}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addService())}
          placeholder={t.servicePh}
          className="flex-1 rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-2.5 text-v2-sm text-v2-text-primary
            placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all"
        />
        <Button size="sm" variant="secondary" onClick={addService}>{t.add}</Button>
      </div>
      {services.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1 bg-v2-primary-50 text-v2-primary-700 rounded-full text-v2-xs font-medium border border-v2-primary-200">
              {s}
              <button onClick={() => removeService(s)} aria-label={t.remove(s)} className="hover:text-v2-error-500 transition-colors">&times;</button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-v2-xs text-v2-error-600">{error}</p>}
    </div>
  );
}

export default function BusinessProfilePage() {
  const { currentBusiness, loading, error: loadError, updateBusiness, refresh } = useBusiness();
  const { lang } = useI18n();
  const t = COPY[lang];
  const [fieldErrors, setFieldErrors] = useState<ProfileErrors>({});
  const repo = useMemo(() => createMemoryRepository(currentBusiness), [currentBusiness]);
  const [profile, setProfile] = useState<BusinessProfile | null>(currentBusiness ? toProfile(currentBusiness) : null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadedId = currentBusiness?.id;
  useEffect(() => {
    if (currentBusiness && !profile) setProfile(toProfile(currentBusiness));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  function handleChange(field: keyof BusinessProfile, value: string) {
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
  }

  function handleServicesChange(services: string[]) {
    setProfile((prev) => (prev ? { ...prev, services } : prev));
    setFieldErrors((prev) => ({ ...prev, services: undefined }));
    setSaved(false);
  }

  async function handleSave() {
    if (!profile) return;
    setSaveError(null);
    const errors = validateProfile(profile, lang);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveError(t.invalid);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateBusiness(profileToPatch({ ...profile, website: normalizeWebsite(profile.website) }));
      setProfile(toProfile(updated));
      registerProfileUpdated(repo, 'perfil completo');
      trackBusinessProfileUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch {
      setSaveError(t.failed);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) return <LoadingState message={t.loading} />;

  if (!profile) {
    return (
      <div className="rounded-v2-xl border border-v2-error-200 bg-v2-error-50 p-6">
        <p className="text-v2-sm text-v2-error-600 mb-4">{loadError ?? t.loadFailed}</p>
        <Button variant="secondary" onClick={() => refresh()}>{t.retry}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          {t.title}
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-2 leading-relaxed">{t.intro}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock icon={<Building2 size={15} />} label={`${t.name} *`} value={profile.name} placeholder={t.namePh} field="name" error={fieldErrors.name} maxLength={PROFILE_LIMITS.name} onChange={handleChange} />
        <FieldBlock icon={<Briefcase size={15} />} label={`${t.category} *`} value={profile.category} placeholder={t.categoryPh} field="category" error={fieldErrors.category} maxLength={PROFILE_LIMITS.category} onChange={handleChange} />
        <FieldBlock icon={<MapPin size={15} />} label={`${t.city} *`} value={profile.city} placeholder={t.cityPh} field="city" error={fieldErrors.city} maxLength={PROFILE_LIMITS.city} onChange={handleChange} />
        <FieldBlock icon={<Globe size={15} />} label={t.website} value={profile.website} placeholder="https://..." field="website" error={fieldErrors.website} maxLength={PROFILE_LIMITS.website} onChange={handleChange} />
        <FieldBlock icon={<Phone size={15} />} label={t.phone} value={profile.phone} placeholder="+34 600 000 000" field="phone" error={fieldErrors.phone} maxLength={PROFILE_LIMITS.phone} onChange={handleChange} />
        <FieldBlock icon={<Clock size={15} />} label={t.schedule} value={profile.schedule} placeholder={t.schedulePh} field="schedule" error={fieldErrors.schedule} maxLength={PROFILE_LIMITS.schedule} onChange={handleChange} />
        <div className="sm:col-span-2">
          <FieldBlock icon={<Users size={15} />} label={t.audience} value={profile.targetAudience} placeholder={t.audiencePh} field="targetAudience" error={fieldErrors.targetAudience} maxLength={PROFILE_LIMITS.targetAudience} onChange={handleChange} />
        </div>
        <div className="sm:col-span-2">
          <ServicesBlock services={profile.services} error={fieldErrors.services} t={t} onChange={handleServicesChange} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={handleSave} disabled={saving} icon={saved ? <Check size={16} /> : undefined}>
          {saving ? t.saving : saved ? t.savedBtn : t.save}
        </Button>
        {saved && <span role="status" className="text-v2-xs text-v2-success-600 font-medium">{t.saved}</span>}
        {saveError && <span role="alert" className="text-v2-xs text-v2-error-600 font-medium">{saveError}</span>}
      </div>
    </div>
  );
}
