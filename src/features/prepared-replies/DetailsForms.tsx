import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Notice, btnPrimary, btnSecondary } from '../improvement/ImprovementEditor';
import type { RepliesCopy } from './copy';
import { BOOKING_METHODS, MAX_ADDRESS_CHARS, cleanFact, validateAddress, type BookingMethod } from './model';
import type { SaveStatus } from './usePreparedReplies';

type Problem = 'too_long' | Exclude<SaveStatus, 'saved'> | null;

function ProblemNotice({ problem, t, onReload }: { problem: Problem; t: RepliesCopy; onReload: () => void }) {
  if (!problem) return null;
  if (problem === 'conflict') {
    return (
      <Notice tone="error">
        <p>{t.conflict}</p>
        <button onClick={onReload} className="mt-1.5 font-semibold underline underline-offset-2">{t.loadLatest}</button>
      </Notice>
    );
  }
  const text = problem === 'too_long' ? t.address.tooLong : problem === 'locked' ? t.lockedSave : t.saveError;
  return <Notice tone="error">{text}</Notice>;
}

export function AddressForm({ id, initial, t, onSave, onReload, onCancel }: {
  id: string; initial: string; t: RepliesCopy;
  onSave: (address: string | null) => Promise<SaveStatus>;
  onReload: () => void; onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateAddress(value)) { setProblem('too_long'); return; }
    const clean = cleanFact(value, MAX_ADDRESS_CHARS);
    setSaving(true);
    setProblem(null);
    const result = await onSave(clean || null);
    setSaving(false);
    if (result !== 'saved') setProblem(result);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={id} className="block text-v2-xs font-semibold text-v2-text-primary">{t.address.label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => { setValue(e.target.value); setProblem(null); }}
        maxLength={MAX_ADDRESS_CHARS}
        placeholder={t.address.placeholder}
        autoComplete="street-address"
        className="w-full rounded-v2-lg border border-v2-border bg-white px-3 py-2 text-v2-sm text-v2-text-primary placeholder:text-v2-text-tertiary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-500/20"
      />
      <p className="text-v2-xs text-v2-text-tertiary">{t.address.note}</p>
      <ProblemNotice problem={problem} t={t} onReload={onReload} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !value.trim()} className={btnPrimary}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {saving ? t.saving : t.save}
        </button>
        {onCancel && <button type="button" onClick={onCancel} disabled={saving} className={btnSecondary}>{t.cancel}</button>}
      </div>
    </form>
  );
}

export function BookingForm({ name, initial, t, onSave, onReload, onCancel }: {
  name: string; initial: BookingMethod | null; t: RepliesCopy;
  onSave: (method: BookingMethod) => Promise<SaveStatus>;
  onReload: () => void; onCancel?: () => void;
}) {
  const [value, setValue] = useState<BookingMethod | null>(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) return;
    setSaving(true);
    setProblem(null);
    const result = await onSave(value);
    setSaving(false);
    if (result !== 'saved') setProblem(result);
  };

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <fieldset>
        <legend className="text-v2-xs text-v2-text-secondary leading-relaxed mb-2">{t.booking.prompt}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BOOKING_METHODS.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-2 rounded-v2-lg border px-3 py-2 text-v2-xs transition-colors ${
                value === m ? 'border-v2-primary-400 bg-v2-primary-50 text-v2-primary-700 font-medium' : 'border-v2-border-light bg-white text-v2-text-secondary hover:border-v2-primary-200'
              }`}
            >
              <input type="radio" name={name} value={m} checked={value === m} onChange={() => { setValue(m); setProblem(null); }} className="accent-v2-primary-600" />
              {t.booking.options[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <ProblemNotice problem={problem} t={t} onReload={onReload} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !value || value === initial} className={btnPrimary}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {saving ? t.saving : t.save}
        </button>
        {onCancel && <button type="button" onClick={onCancel} disabled={saving} className={btnSecondary}>{t.cancel}</button>}
      </div>
    </form>
  );
}
