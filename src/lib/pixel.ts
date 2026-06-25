declare global {
  interface Window {
    fbq: (...args: any[]) => void;
  }
}

export function trackPageView() {
  if (typeof window.fbq === 'function') {
    window.fbq('track', 'PageView');
  }
}

export function trackViewContent(params: {
  content_name: string;
  content_category?: string;
  content_ids?: string[];
  value?: number;
  currency?: string;
}) {
  if (typeof window.fbq === 'function') {
    window.fbq('track', 'ViewContent', params);
  }
}
