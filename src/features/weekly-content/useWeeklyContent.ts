import { useCallback, useEffect, useRef, useState } from 'react';
import { WeeklyContentError, hasDraft, weekKey, type WeeklyContentErrorCode, type WeeklyDraft } from './model';
import { loadDraft, markCopied, requestGeneration, saveContent, type SaveResult } from './repository';

type Phase = 'loading' | 'ready' | 'load_error';

export function useWeeklyContent(businessId: string | null, lang: 'es' | 'en') {
  const [week, setWeek] = useState(() => weekKey());
  const [draft, setDraft] = useState<WeeklyDraft | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<WeeklyContentErrorCode | null>(null);
  const generatingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!businessId) return;
    setPhase('loading');
    try {
      setDraft(await loadDraft(businessId, week));
      setPhase('ready');
    } catch {
      setPhase('load_error');
    }
  }, [businessId, week]);

  useEffect(() => {
    setDraft(null);
    setGenError(null);
    void reload();
  }, [reload]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setWeek(weekKey()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const generate = useCallback(async () => {
    if (!businessId || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setGenError(null);
    try {
      await requestGeneration({ businessId, weekStart: week, lang, expectedGenerations: draft?.generations ?? 0 });
    } catch (err) {
      setGenError(err instanceof WeeklyContentError ? err.code : 'unavailable');
    } finally {
      try {
        setDraft(await loadDraft(businessId, week));
      } catch {
        /* the previous draft stays on screen; the next visit reloads it */
      }
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [businessId, week, lang, draft?.generations]);

  const save = useCallback(async (content: string): Promise<SaveResult | 'error'> => {
    if (!hasDraft(draft)) return 'error';
    try {
      const result = await saveContent(draft, content);
      if (result.status === 'saved') setDraft(result.draft);
      return result;
    } catch {
      return 'error';
    }
  }, [draft]);

  const recordCopy = useCallback(async () => {
    if (!hasDraft(draft)) return;
    const updated = await markCopied(draft);
    if (updated) setDraft(updated);
  }, [draft]);

  return { week, draft, phase, generating, genError, clearGenError: () => setGenError(null), reload, generate, save, recordCopy };
}
