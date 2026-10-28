import type { PublishingCapabilities, PublishingResult } from '../meta-connection/metaPublishingRepository';

export type PublishingAccessView = 'hidden' | 'checking' | 'unavailable' | 'needs_activation' | 'ready';

export function publishingAccessView(
  connected: boolean,
  capabilities: PublishingResult<PublishingCapabilities> | null,
): PublishingAccessView {
  if (!connected) return 'hidden';
  if (capabilities === null) return 'checking';
  if (!capabilities.ok) return 'unavailable';
  return capabilities.facebook_publish_ready === true ? 'ready' : 'needs_activation';
}

export interface ActivationState {
  busy: boolean;
  error: string | null;
}

export interface ActivationDeps {
  start: () => Promise<PublishingResult<{ url: string }>>;
  navigate: (url: string) => void;
  onChange: (state: ActivationState) => void;
}

export function createActivation({ start, navigate, onChange }: ActivationDeps) {
  let inFlight = false;
  return {
    async activate(): Promise<void> {
      if (inFlight) return;
      inFlight = true;
      onChange({ busy: true, error: null });
      const result = await start().catch(() => ({ ok: false as const, code: 'INTERNAL_ERROR' }));
      if (result.ok) {
        navigate(result.url);
        return;
      }
      inFlight = false;
      onChange({ busy: false, error: result.code });
    },
    // A back-navigation from Meta can restore the page from cache with the request still marked in flight.
    reset(): void {
      inFlight = false;
      onChange({ busy: false, error: null });
    },
  };
}
