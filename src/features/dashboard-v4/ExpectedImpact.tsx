import { MapPin, Star, TrendingUp, CheckCircle2 } from 'lucide-react';

export default function ExpectedImpact() {
  return (
    <section className="v2-card" aria-label="Impacto esperado">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-v2-sm font-semibold text-v2-text-primary">Impacto esperado</h2>
        <span className="v2-badge-neutral">Estimacion</span>
      </div>
      <p className="text-v2-sm text-v2-text-secondary mb-4">Si completas el plan de hoy:</p>
      <div className="space-y-2.5">
        {[
          { label: 'Mayor visibilidad en busquedas locales', icon: <MapPin size={14} /> },
          { label: 'Mejor reputacion por responder resenas', icon: <Star size={14} /> },
          { label: 'Perfil mas activo ante Google', icon: <TrendingUp size={14} /> },
          { label: 'Mayor consistencia en publicaciones', icon: <CheckCircle2 size={14} /> },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 text-v2-sm text-v2-text-secondary">
            <span className="text-v2-success-500 shrink-0">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </section>
  );
}
