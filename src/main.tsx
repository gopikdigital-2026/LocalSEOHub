import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from './lib/i18n';
import App from './App.tsx';
import { captureRecoveryLink } from './features/password-reset/recovery';
import { captureVerificationLinkProblem } from './features/email-verification/verification';
import { BusinessProvider } from './features/business-memory/BusinessContext';
import ActionsProvider from './features/actions/ActionsProvider';
import BillingProvider from './features/billing/BillingProvider';
import MetaPixelTracker from './features/conversion/MetaPixelTracker';
import ConsentProvider from './features/consent/ConsentProvider';
import { applyTrackingConsent } from './features/consent/applyConsent';
import { hasAdvertisingConsent } from './lib/consent';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, background: '#ffffff', minHeight: '100vh', color: '#0f172a', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 16 }}>Runtime Error</h2>
          <pre style={{ color: '#64748b', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {(this.state.error as Error).message}
            {'\n\n'}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Read before the Supabase client strips the recovery tokens from the URL.
const initialRecoveryLink = captureRecoveryLink(window.location.href);
const initialLinkProblem = captureVerificationLinkProblem(window.location.href);

// Optional trackers load only for a stored, current-version acceptance; otherwise nothing is requested.
if (hasAdvertisingConsent()) applyTrackingConsent(true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <MetaPixelTracker />
        <ConsentProvider>
          <I18nProvider>
            <BusinessProvider>
              <BillingProvider>
                <ActionsProvider>
                  <App initialRecoveryLink={initialRecoveryLink} initialLinkProblem={initialLinkProblem} />
                </ActionsProvider>
              </BillingProvider>
            </BusinessProvider>
          </I18nProvider>
        </ConsentProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
