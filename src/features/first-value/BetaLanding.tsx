import { useState } from 'react';
import { Button, Input } from '../../components/ui';
import {
  Search,
  Target,
  FileText,
  Play,
  Brain,
  ArrowRight,
  Check,
  Zap,
  Globe,
  Shield,
} from 'lucide-react';

const STEPS = [
  { icon: <Search size={20} />, title: 'Detectar', description: 'Analiza tu presencia digital y detecta oportunidades de mejora.' },
  { icon: <Target size={20} />, title: 'Priorizar', description: 'Ordena las acciones por impacto real segun tus objetivos.' },
  { icon: <FileText size={20} />, title: 'Preparar', description: 'Genera contenido y propuestas listas para publicar.' },
  { icon: <Play size={20} />, title: 'Ejecutar', description: 'Guia paso a paso para completar cada accion.' },
  { icon: <Brain size={20} />, title: 'Aprender', description: 'Recuerda tu negocio y mejora con cada semana.' },
];

export default function BetaLanding() {
  const [form, setForm] = useState({ name: '', email: '', business: '', sector: '', city: '', goal: '' });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.business) return;
    setSending(true);
    // Store locally as proof of interest
    try {
      const existing = JSON.parse(localStorage.getItem('lsh_beta_signups') ?? '[]');
      existing.push({ ...form, submittedAt: new Date().toISOString() });
      localStorage.setItem('lsh_beta_signups', JSON.stringify(existing));
    } catch { /* silent */ }
    setTimeout(() => {
      setSending(false);
      setSubmitted(true);
    }, 600);
  }

  return (
    <div className="min-h-screen bg-white font-v2">
      {/* Header */}
      <header className="border-b border-v2-border-light">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-v2-lg bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center">
              <span className="text-v2-sm font-bold text-v2-primary-600">L</span>
            </div>
            <span className="text-v2-sm font-semibold text-v2-text-primary">LocalSEOHub</span>
          </div>
          <span className="text-v2-xs font-medium text-v2-primary-600 bg-v2-primary-50 border border-v2-primary-200 rounded-full px-3 py-1">
            Beta privada
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <h1 className="text-v2-3xl sm:text-4xl lg:text-5xl font-bold text-v2-text-primary tracking-tight leading-tight mb-6">
          Tu copiloto de crecimiento local
        </h1>
        <p className="text-v2-base sm:text-lg text-v2-text-secondary max-w-xl mx-auto leading-relaxed mb-10">
          Cada semana LocalSEOHub analiza tu presencia digital, prioriza que debes hacer y prepara las acciones necesarias para ayudarte a crecer.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 text-v2-xs text-v2-text-tertiary">
          <span className="flex items-center gap-1.5"><Zap size={13} className="text-v2-warning-500" /> Sin conocimientos tecnicos</span>
          <span className="flex items-center gap-1.5"><Globe size={13} className="text-v2-primary-500" /> Para negocios locales</span>
          <span className="flex items-center gap-1.5"><Shield size={13} className="text-v2-success-500" /> Sin tarjeta de credito</span>
        </div>
      </section>

      {/* Process */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-5">
          {STEPS.map((step, i) => (
            <div key={i} className="text-center p-4">
              <div className="w-12 h-12 rounded-v2-xl bg-v2-primary-50 border border-v2-primary-200 text-v2-primary-600 flex items-center justify-center mx-auto mb-3">
                {step.icon}
              </div>
              <h3 className="text-v2-sm font-semibold text-v2-text-primary mb-1">{step.title}</h3>
              <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="max-w-md mx-auto px-4 sm:px-6 pb-24">
        {submitted ? (
          <div className="text-center rounded-v2-xl border border-v2-success-200 bg-v2-success-50/30 p-8">
            <div className="w-14 h-14 rounded-full bg-v2-success-50 border border-v2-success-200 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-v2-success-600" />
            </div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">Solicitud recibida</h2>
            <p className="text-v2-sm text-v2-text-secondary">Te contactaremos cuando tu acceso este listo. Gracias por tu interes.</p>
          </div>
        ) : (
          <div className="rounded-v2-xl border border-v2-border-light bg-white p-6 sm:p-8">
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-1">Solicitar acceso a la beta</h2>
            <p className="text-v2-xs text-v2-text-tertiary mb-6">Sin compromiso. Sin tarjeta.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Nombre" value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('name', e.target.value)} placeholder="Tu nombre" />
              <Input label="Email" type="email" value={form.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('email', e.target.value)} placeholder="tu@email.com" required />
              <Input label="Nombre del negocio" value={form.business} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('business', e.target.value)} placeholder="Ej: Clinica Dental Sonrie" required />
              <Input label="Sector" value={form.sector} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('sector', e.target.value)} placeholder="Ej: Salud, Restauracion, Servicios..." />
              <Input label="Ciudad" value={form.city} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('city', e.target.value)} placeholder="Ej: Madrid" />
              <Input label="Principal objetivo" value={form.goal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('goal', e.target.value)} placeholder="Ej: Mas resenas, mas visibilidad..." />

              <Button type="submit" size="lg" className="w-full" loading={sending} icon={<ArrowRight size={16} />}>
                Solicitar acceso
              </Button>
            </form>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-v2-border-light py-6">
        <p className="text-center text-v2-xs text-v2-text-tertiary">LocalSEOHub - Beta privada 2026</p>
      </footer>
    </div>
  );
}
