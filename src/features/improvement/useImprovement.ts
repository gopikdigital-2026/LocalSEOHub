import { useCallback, useEffect, useRef, useState } from 'react';
import { ImprovementError, hasDraft, type ImprovementDraft, type ImprovementErrorCode, type ImprovementMode } from './model';
import { loadDraft, loadMonthlyUsage, markCopied, requestGeneration, saveContent, type SaveResult } from './repository';

type Phase = 'loading' | 'ready' | 'load_error';

export function useImprovement(businessId: string, actionId: string, semanticKey: string, lang: 'es' | 'en') {
  const [draft, setDraft] = useState<ImprovementDraft | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<ImprovementErrorCode | null>(null);
  const generatingRef = useRef(false);

  const refresh = useCallback(async () => {
    const [d, u] = await Promise.all([loadDraft(businessId, semanticKey), loadMonthlyUsage()]);
    setDraft(d);
    setUsage(u);
  }, [businessId, semanticKey]);

  const reload = useCallback(async () => {
    setPhase('loading');
    try {
      await refresh();
      setPhase('ready');
    } catch {
      setPhase('load_error');
    }
  }, [refresh]);

  useEffect(() => {
    setDraft(null);
    setGenError(null);
    void reload();
  }, [reload]);

  const generate = useCallback(async (mode: ImprovementMode, sourceText: string, allowOverwrite: boolean) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setGenError(null);
    try {
      await requestGeneration({
        businessId, actionId, lang, mode, sourceText: mode === 'improve' ? sourceText.trim() : undefined,
        expectedGenerations: draft?.generations ?? 0, allowOverwrite,
      });
    } catch (err) {
      setGenError(err instanceof ImprovementError ? err.code : 'unavailable');
    } finally {
      try {
        await refresh();
      } catch {
        /* the previous draft stays on screen; the next visit reloads it */
      }
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [businessId, actionId, lang, draft?.generations, refresh]);

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

  return { draft, usage, phase, generating, genError, clearGenError: () => setGenError(null), reload, generate, save, recordCopy };
}
