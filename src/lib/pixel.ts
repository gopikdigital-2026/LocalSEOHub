import { hasAdvertisingConsent } from './consent';

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

export const META_PIXEL_ID = '2022587961640258';
export const META_PIXEL_SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Params = Record<string, string | number>;
/** eventID is accepted now so a future server-side (CAPI) copy of the same event can be deduplicated by Meta. */
export interface PixelOptions { eventId?: string }

function send(kind: 'track' | 'trackCustom', name: string, params?: Params, opts?: PixelOptions) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  // Checked on every event: after a revocation the loaded script stays in memory but receives nothing.
  if (!hasAdvertisingConsent()) return;
  const args: unknown[] = [kind, name, params ?? {}];
  if (opts?.eventId) args.push({ eventID: opts.eventId });
  window.fbq(...args);
}

/** Auth links carry one-time tokens in the URL; that landing is not counted and the next route counts instead. */
export function urlCarriesAuthTokens(searchAndHash: string): boolean {
  return /(access_token|refresh_token|token_hash|[?&#]code=|[?&#]token=)/.test(searchAndHash);
}

/**
 * Official Meta base code, run only after advertising consent. Returns false when the pixel was already
 * loaded in this page. Must never be called without consent: loading the script is itself a transmission.
 */
export function loadMetaPixel(win: Window = window, doc: Document = document): boolean {
  if (win.fbq) return false;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  win.fbq = n;
  if (!win._fbq) win._fbq = n;
  const script = doc.createElement('script');
  script.async = true;
  script.src = META_PIXEL_SCRIPT;
  doc.head.appendChild(script);
  // Route changes are tracked by the app itself; Meta's own history listener would count them twice.
  n.disablePushState = true;
  // No automatic button/form-text events: only the explicit funnel events are sent.
  n('set', 'autoConfig', false, META_PIXEL_ID);
  n('init', META_PIXEL_ID);
  return true;
}

export function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Marks the key before firing so a re-entrant call (StrictMode, remount, second tab reload) cannot fire twice. */
export function fireOnce(key: string, fire: () => void, store: Store | null = browserStore()): boolean {
  try {
    if (store?.getItem(key)) return false;
    store?.setItem(key, '1');
  } catch {
    // storage unavailable: fire for this call only
  }
  fire();
  return true;
}

export function trackPageView() {
  send('track', 'PageView');
}

export function trackLead() {
  send('track', 'Lead');
}

export function trackCompleteRegistration(opts?: PixelOptions) {
  send('track', 'CompleteRegistration', undefined, opts);
}

export function trackActivation(opts?: PixelOptions) {
  send('trackCustom', 'Activation', undefined, opts);
}

export interface Money { value: number; currency: 'EUR' }

export function trackInitiateCheckout(money: Money, opts?: PixelOptions) {
  send('track', 'InitiateCheckout', { value: money.value, currency: money.currency }, opts);
}

export function trackPurchase(money: Money, opts?: PixelOptions) {
  send('track', 'Purchase', { value: money.value, currency: money.currency }, opts);
}
