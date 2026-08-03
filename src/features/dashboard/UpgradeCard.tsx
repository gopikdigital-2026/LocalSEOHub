import { Rocket, Check } from 'lucide-react';

interface UpgradeCardProps {
  currentPlan: 'free' | 'starter' | 'pro';
  onUpgrade: () => void;
}

const planDetails: Record<string, { next: string; features: string[] }> = {
  free: {
    next: 'Starter',
    features: [
      'Hasta 5 fuentes de datos',
      'Recomendaciones ilimitadas',
      'Informes semanales',
    ],
  },
  starter: {
    next: 'Pro',
    features: [
      'Analisis de competidores',
      'IA avanzada personalizada',
      'Automatizaciones completas',
    ],
  },
  pro: {
    next: '',
    features: [],
  },
};

export default function UpgradeCard({ currentPlan, onUpgrade }: UpgradeCardProps) {
  if (currentPlan === 'pro') return null;

  const { next, features } = planDetails[currentPlan];

  return (
    <section
      className="relative overflow-hidden rounded-v2-2xl border border-v2-primary-200 bg-gradient-to-br from-v2-primary-50 via-white to-v2-primary-50/50 p-5"
      aria-label="Mejorar plan"
    >
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-v2-primary-100/40 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Rocket size={16} className="text-v2-primary-600" />
          <h2 className="text-v2-sm font-semibold text-v2-primary-700">Pasa a {next}</h2>
        </div>

        <p className="text-v2-xs text-v2-text-secondary mb-4">
          Desbloquea funciones avanzadas para tu negocio:
        </p>

        <ul className="space-y-2 mb-5">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-v2-xs text-v2-text-secondary">
              <Check size={13} className="shrink-0 text-v2-primary-500" />
              {feature}
            </li>
          ))}
        </ul>

        <button
          onClick={onUpgrade}
          className="w-full v2-btn-primary text-v2-xs py-2.5"
        >
          Mejorar plan
        </button>
      </div>
    </section>
  );
}
