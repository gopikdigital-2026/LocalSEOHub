import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n } from '../../lib/i18n';
import { getDraft, listDrafts } from '../publications/repository';
import type { Publication } from '../publications/types';
import { PublicationResumeContext, type PublicationResume } from './context';
import { deriveStage, parsePubParam, PUB_PARAM, type PubParam } from './model';
import { listDraftStates } from './repository';
import { resolveResume, type ResumeState } from './resolve';
import { RESUME } from './copy';

const API = { getDraft: (id: string) => getDraft(id), listDrafts: (b: string) => listDrafts(b), listDraftStates: (ids: string[]) => listDraftStates(ids) };

const paramOf = (key: string): PubParam =>
  key === 'none' ? { kind: 'none' } : key === 'invalid' ? { kind: 'invalid' } : { kind: 'id', id: key };

// Layout route: the hidden harness route renders inside it, so every step reads the same publication identity.
export default function PublicationResumeProvider() {
  const { currentBusiness, loading } = useBusiness();
  const { lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const param = parsePubParam(params.get(PUB_PARAM));
  const key = param.kind === 'id' ? param.id : param.kind;
  const businessId = currentBusiness?.id ?? null;
  const [state, setState] = useState<ResumeState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const unsaved = useRef(false);
  const live = useRef({ key, businessId });
  live.current = { key, businessId };

  useEffect(() => {
    if (loading) return;
    if (!businessId) {
      setState({ status: 'none', candidates: [] });
      return;
    }
    let active = true;
    setState((s) => (s.status === 'ready' && s.publication.id === key ? s : { status: 'loading' }));
    void resolveResume(paramOf(key), businessId, API).then((next) => {
      if (active) setState(next);
    });
    return () => { active = false; };
  }, [loading, businessId, key]);

  const setPub = useCallback((id: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set(PUB_PARAM, id); else next.delete(PUB_PARAM);
      return next;
    });
  }, [setParams]);

  const confirmLeave = useCallback(() => !unsaved.current || window.confirm(RESUME.leaveWarning[lang]), [lang]);

  const value = useMemo<PublicationResume>(() => {
    const publication = state.status === 'ready' ? state.publication : null;
    return {
      state,
      publication,
      stage: state.status === 'ready' ? deriveStage(state.publication, state.draft) : null,
      revision,
      adopt: (pub: Publication) => {
        setState({ status: 'ready', publication: pub, draft: null });
        setPub(pub.id);
      },
      refresh: async () => {
        const at = live.current;
        if (!publication || !at.businessId || at.key !== publication.id) return;
        const next = await resolveResume({ kind: 'id', id: publication.id }, at.businessId, API);
        if (live.current.key !== at.key || live.current.businessId !== at.businessId) return;
        setState(next);
        setRevision((r) => r + 1);
      },
      open: (id: string) => {
        if (id === publication?.id || !confirmLeave()) return;
        unsaved.current = false;
        setPub(id);
      },
      close: (force = false) => {
        if (!force && !confirmLeave()) return;
        unsaved.current = false;
        setPub(null);
      },
      setUnsaved: (u: boolean) => { unsaved.current = u; },
    };
  }, [state, revision, setPub, confirmLeave]);

  return <PublicationResumeContext.Provider value={value}><Outlet /></PublicationResumeContext.Provider>;
}
