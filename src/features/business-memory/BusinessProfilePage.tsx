import { useState } from 'react';
import type { BusinessProfile } from './types';
import { createLocalRepository } from './repository';
import { registerProfileUpdated } from './engine';
import { Button } from '../../components/ui';
import { trackBusinessProfileUpdated } from '../../services/analytics/v2Analytics';
import { Check, Building2, MapPin, Globe, Phone, Clock, Users, Briefcase } from 'lucide-react';

const repo = createLocalRepository();

function getProfile(): BusinessProfile {
  return repo.load().profile;
}

interface FieldBlockProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  field: keyof BusinessProfile;
  onChange: (field: keyof BusinessProfile, value: string) => void;
}

function FieldBlock({ icon, label, value, placeholder, field, onChange }: FieldBlockProps) {
  return (
    <div className="group rounded-v2-xl border border-v2-border-light bg-white p-5 hover:border-v2-primary-200 transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-v2-lg bg-v2-neutral-50 border border-v2-border-light flex items-center justify-center text-v2-neutral-500">
          {icon}
        </div>
        <label className="text-v2-sm font-semibold text-v2-text-primary">{label}</label>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-2.5 text-v2-sm text-v2-text-primary
          placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all"
      />
    </div>
  );
}

function ServicesBlock({ services, onChange }: { services: string[]; onChange: (services: string[]) => void }) {
  const [input, setInput] = useState('');

  function addService() {
    const trimmed = input.trim();
    if (trimmed && !services.includes(trimmed)) {
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
        <label className="text-v2-sm font-semibold text-v2-text-primary">Servicios</label>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addService())}
          placeholder="Anadir servicio..."
          className="flex-1 rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-2.5 text-v2-sm text-v2-text-primary
            placeholder:text-v2-neutral-400 focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 transition-all"
        />
        <Button size="sm" variant="secondary" onClick={addService}>Anadir</Button>
      </div>
      {services.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1 bg-v2-primary-50 text-v2-primary-700 rounded-full text-v2-xs font-medium border border-v2-primary-200">
              {s}
              <button onClick={() => removeService(s)} className="hover:text-v2-error-500 transition-colors">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<BusinessProfile>(getProfile);
  const [saved, setSaved] = useState(false);

  function handleChange(field: keyof BusinessProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleServicesChange(services: string[]) {
    setProfile((prev) => ({ ...prev, services }));
    setSaved(false);
  }

  function handleSave() {
    repo.updateProfile(profile);
    registerProfileUpdated(repo, 'perfil completo');
    trackBusinessProfileUpdated();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          Tu negocio
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-2 leading-relaxed">
          Cuanto mas sepamos de tu negocio, mejores seran las recomendaciones.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock icon={<Building2 size={15} />} label="Nombre" value={profile.name} placeholder="Nombre de tu negocio" field="name" onChange={handleChange} />
        <FieldBlock icon={<Briefcase size={15} />} label="Categoria" value={profile.category} placeholder="Ej: Restaurante, Clinica dental..." field="category" onChange={handleChange} />
        <FieldBlock icon={<MapPin size={15} />} label="Ciudad" value={profile.city} placeholder="Ej: Madrid" field="city" onChange={handleChange} />
        <FieldBlock icon={<Globe size={15} />} label="Pagina web" value={profile.website} placeholder="https://..." field="website" onChange={handleChange} />
        <FieldBlock icon={<Phone size={15} />} label="Telefono" value={profile.phone} placeholder="+34 600 000 000" field="phone" onChange={handleChange} />
        <FieldBlock icon={<Clock size={15} />} label="Horario" value={profile.schedule} placeholder="Ej: L-V 9:00-18:00" field="schedule" onChange={handleChange} />
        <div className="sm:col-span-2">
          <FieldBlock icon={<Users size={15} />} label="Publico objetivo" value={profile.targetAudience} placeholder="Ej: Jovenes 25-40, profesionales..." field="targetAudience" onChange={handleChange} />
        </div>
        <div className="sm:col-span-2">
          <ServicesBlock services={profile.services} onChange={handleServicesChange} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} icon={saved ? <Check size={16} /> : undefined}>
          {saved ? 'Guardado' : 'Guardar cambios'}
        </Button>
        {saved && <span className="text-v2-xs text-v2-success-600 font-medium">Perfil actualizado correctamente</span>}
      </div>
    </div>
  );
}
