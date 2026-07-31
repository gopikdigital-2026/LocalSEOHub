import { BusinessTimeline, BusinessInsights, BusinessPreferencesView } from './BusinessTimeline';

export default function BusinessMemoryPage() {
  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          Memoria del negocio
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-2 leading-relaxed">
          Todo lo que sabemos sobre tu negocio y como lo usamos para ayudarte.
        </p>
      </div>

      <BusinessInsights />
      <BusinessPreferencesView />
      <BusinessTimeline />
    </div>
  );
}
