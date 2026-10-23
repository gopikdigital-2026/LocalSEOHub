import { loadMetaPixel, trackPageView, urlCarriesAuthTokens } from '../../lib/pixel';
import { loadClarity } from '../../lib/clarity';

/**
 * Starts or stops optional trackers for the current page. Call only after the decision has been
 * persisted, because event helpers re-check the stored consent.
 *
 * Granting starts measurement from this moment: one PageView for the page being viewed, nothing earlier.
 * Revoking stops future events; nothing already sent is touched.
 */
export function applyTrackingConsent(advertising: boolean, win: Window = window, doc: Document = document): void {
  if (advertising) {
    const freshLoad = loadMetaPixel(win, doc);
    if (!freshLoad) win.fbq?.('consent', 'grant');
    if (!urlCarriesAuthTokens(win.location.search + win.location.hash)) trackPageView();
    if (!loadClarity(win, doc)) win.clarity?.('consent');
    return;
  }
  win.fbq?.('consent', 'revoke');
  win.clarity?.('consent', false);
}
