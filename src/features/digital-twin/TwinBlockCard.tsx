import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Minus, CircleDashed } from 'lucide-react';
import { goalLabel } from '../activation/milestones';
import type { TwinCopy } from './copy';
import type { BlockState, DigitalTwin, Provenance, TwinBlock, TwinFieldId } from './engine';

const STATE_STYLE: Record<BlockState, { icon: ReactNode; chip: string; ring: string }> = {
  complete: { icon: <CheckCircle2 size={14} />, chip: 'bg-v2-success-50 text-v2-success-700', ring: 'border-v2-success-200' },
  partial: { icon: <AlertTriangle size={14} />, chip: 'bg-v2-warning-50 text-v2-warning-700', ring: 'border-v2-warning-200' },
  empty: { icon: <Minus size={14} />, chip: 'bg-v2-neutral-100 text-v2-text-secondary', ring: 'border-v2-border-light' },
  unchecked: { icon: <CircleDashed size={14} />, chip: 'bg-v2-neutral-100 text-v2-text-tertiary', ring: 'border-dashed border-v2-border-light' },
};

const PROV_STYLE: Record<Provenance, string> = {
  declared: 'bg-v2-primary-50 text-v2-primary-700',
  detected: 'bg-v2-neutral-100 text-v2-text-secondary',
  verified: 'bg-v2-success-50 text-v2-success-700',
  unchecked: 'bg-v2-neutral-100 text-v2-text-tertiary',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ label, value, empty, prov, note, t }: {
  label: string; value?: ReactNode; empty: string; prov: Provenance; note?: string | null; t: TwinCopy;
}) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">{label}</p>
        <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${PROV_STYLE[prov]}`}>{t.provenance[prov]}</span>
      </div>
      <div className={`mt-0.5 text-v2-sm break-words ${value ? 'text-v2-text-primary font-medium' : 'text-v2-text-tertiary'}`}>{value || empty}</div>
      {note && <p className="mt-0.5 text-v2-xs text-v2-warning-700">{note}</p>}
    </div>
  );
}

export function TwinBlockCard({ block, twin, t, lang, syncDate }: {
  block: TwinBlock; twin: DigitalTwin; t: TwinCopy; lang: 'es' | 'en'; syncDate: string | null;
}) {
  const v = twin.values;
  const prov = (id: TwinFieldId) => twin.fields.find((f) => f.id === id)!.provenance;
  const state = (id: TwinFieldId) => twin.fields.find((f) => f.id === id)!.state;
  const s = STATE_STYLE[block.state];
  const verifiedOr = (val: string | null): Provenance => (val ? 'verified' : 'unchecked');
  const g = twin.sourceSummary.gbpState;

  let body: ReactNode;
  switch (block.id) {
    case 'identity':
      body = (
        <>
          <Row t={t} label={t.fields.name} value={v.name} empty={t.notDefined} prov={prov('name')} />
          <Row t={t} label={t.fields.activity} value={v.activity} empty={t.notDefined} prov={prov('activity')} />
          {v.gbpCategory && <Row t={t} label={t.gbpCategory} value={v.gbpCategory} empty={t.notChecked} prov="verified" />}
          <Row t={t} label={t.description} empty={t.notAvailable} prov="unchecked" />
        </>
      );
      break;
    case 'location':
      body = (
        <>
          <Row t={t} label={t.fields.city} value={v.city} empty={t.notDefined} prov={prov('city')} />
          <Row t={t} label={t.gbpAddress} value={v.gbpAddress} empty={t.notChecked} prov={verifiedOr(v.gbpAddress)} />
        </>
      );
      break;
    case 'offer':
      body = (
        <Row
          t={t} label={t.fields.services} empty={t.servicesEmpty} prov={prov('services')}
          note={state('services') === 'partial' ? t.partialServices(v.services.length) : null}
          value={v.services.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {v.services.map((x) => <li key={x} className="rounded-full border border-v2-border-light bg-v2-neutral-50 px-2 py-0.5 text-v2-xs font-medium">{x}</li>)}
            </ul>
          )}
        />
      );
      break;
    case 'customer':
      body = (
        <Row t={t} label={t.fields.audience} value={v.audience} empty={t.audienceEmpty} prov={prov('audience')}
          note={state('audience') === 'partial' ? t.shortAudience : null} />
      );
      break;
    case 'contact':
      body = (
        <>
          <Row t={t} label={t.fields.website} value={v.website} empty={t.notDefined} prov={prov('website')}
            note={v.website && !v.websiteValid ? t.invalidWebsite : null} />
          <Row t={t} label={t.fields.phone} value={v.phone} empty={t.notDefined} prov={prov('phone')}
            note={v.phone && state('phone') !== 'known' ? t.invalidPhone : null} />
          <Row t={t} label={t.fields.hours} value={v.hours} empty={t.notDefined} prov={prov('hours')} />
        </>
      );
      break;
    case 'goals':
      body = (
        <>
          <Row t={t} label={t.fields.primary_goal} value={v.primaryGoal && cap(goalLabel(v.primaryGoal, lang)!)} empty={t.goalEmpty} prov={prov('primary_goal')} />
          {v.secondaryGoals.length > 0 && (
            <Row t={t} label={t.secondaryGoals} value={v.secondaryGoals.map((x) => cap(goalLabel(x, lang)!)).join(' · ')} empty="" prov="declared" />
          )}
        </>
      );
      break;
    case 'local':
      body = (
        <Row
          t={t} label={t.fields.gbp} empty={t.gbpNotConnected} prov={prov('gbp')}
          value={g === 'error' ? null : g === 'connected' ? (state('gbp') === 'known' ? t.gbpConnected : t.gbpConnectedNoData) : null}
          note={g === 'error' ? t.gbpError : syncDate ? t.gbpLastSync(syncDate) : null}
        />
      );
      break;
    case 'web':
      body = (
        <>
          <Row t={t} label={t.webUrl} value={v.websiteValid ? v.website : null} empty={t.notDefined} prov={v.websiteValid ? 'declared' : 'unchecked'}
            note={null} />
          {v.websiteValid && <p className="-mt-1 pb-1 text-v2-xs text-v2-text-secondary">{t.webUrlAvailable}</p>}
          <Row t={t} label={t.webAnalysis} empty={t.notChecked} prov="unchecked" note={null} />
          <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{t.webAnalysisNote}</p>
        </>
      );
      break;
  }

  return (
    <article data-testid="twin-block" data-block={block.id} data-state={block.state}
      className={`relative rounded-v2-xl border bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${s.ring}`}>
      <span aria-hidden className="hidden lg:block absolute -top-4 left-1/2 h-4 w-px bg-v2-border-light" />
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-v2-sm font-semibold text-v2-text-primary">{t.blocks[block.id]}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>{s.icon} {t.blockState[block.state]}</span>
      </div>
      <div className="divide-y divide-v2-border-light">{body}</div>
    </article>
  );
}
