import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReplyCategory, ReplyDetails, ReplyLang, SavedReply } from './model';
import { loadDetails, loadReplies, saveDetails, saveReply, type DetailsPatch, type ReplyDraft } from './repository';

type Phase = 'loading' | 'ready' | 'load_error';
export type SaveStatus = 'saved' | 'conflict' | 'locked' | 'error';

export function usePreparedReplies(businessId: string | null, lang: ReplyLang) {
  const [replies, setReplies] = useState<Partial<Record<ReplyCategory, SavedReply>>>({});
  const [details, setDetails] = useState<ReplyDetails | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const request = useRef(0);

  const reload = useCallback(async () => {
    if (!businessId) return;
    const ticket = ++request.current;
    setPhase('loading');
    try {
      const [rows, extra] = await Promise.all([loadReplies(businessId, lang), loadDetails(businessId)]);
      if (ticket !== request.current) return;
      setReplies(Object.fromEntries(rows.map((r) => [r.category, r])));
      setDetails(extra);
      setPhase('ready');
    } catch {
      if (ticket === request.current) setPhase('load_error');
    }
  }, [businessId, lang]);

  useEffect(() => {
    setReplies({});
    setDetails(null);
    void reload();
  }, [reload]);

  const save = useCallback(async (draft: Omit<ReplyDraft, 'businessId' | 'lang'>): Promise<SaveStatus> => {
    if (!businessId) return 'error';
    try {
      const result = await saveReply({ ...draft, businessId, lang }, replies[draft.category] ?? null);
      if (result.status === 'saved') setReplies((prev) => ({ ...prev, [draft.category]: result.row }));
      return result.status;
    } catch {
      return 'error';
    }
  }, [businessId, lang, replies]);

  const updateDetails = useCallback(async (patch: DetailsPatch): Promise<SaveStatus> => {
    if (!businessId) return 'error';
    try {
      const result = await saveDetails(businessId, patch, details);
      if (result.status === 'saved') setDetails(result.row);
      return result.status;
    } catch {
      return 'error';
    }
  }, [businessId, details]);

  return { replies, details, phase, reload, save, updateDetails };
}
