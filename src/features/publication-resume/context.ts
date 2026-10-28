import { createContext, useContext } from 'react';
import type { Publication } from '../publications/types';
import type { ResumeStage } from './model';
import type { ResumeState } from './resolve';

export interface PublicationResume {
  state: ResumeState;
  publication: Publication | null;
  stage: ResumeStage | null;
  revision: number;
  adopt: (publication: Publication) => void;
  refresh: () => Promise<void>;
  open: (id: string) => void;
  close: (force?: boolean) => void;
  setUnsaved: (unsaved: boolean) => void;
}

export const PublicationResumeContext = createContext<PublicationResume | null>(null);

export function usePublicationResume(): PublicationResume {
  const value = useContext(PublicationResumeContext);
  if (!value) throw new Error('usePublicationResume requires PublicationResumeProvider');
  return value;
}
