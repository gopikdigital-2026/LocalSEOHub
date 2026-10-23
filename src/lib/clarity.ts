type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: Clarity;
  }
}

export const CLARITY_ID = 'xhez4c3vjj';

/** Official Clarity tag, run only after consent and deferred to idle so it never blocks first paint. */
export function loadClarity(win: Window = window, doc: Document = document): boolean {
  if (win.clarity) return false;
  const c = function (...args: unknown[]) {
    (c.q = c.q || []).push(args);
  } as Clarity;
  win.clarity = c;
  const inject = () => {
    const script = doc.createElement('script');
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
    doc.head.appendChild(script);
  };
  if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(inject, { timeout: 4000 });
  else win.setTimeout(inject, 2000);
  return true;
}
