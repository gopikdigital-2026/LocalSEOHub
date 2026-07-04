const ua = typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : '';

// True when running inside Instagram, Facebook, or TikTok in-app browser
export const isSocialWebView: boolean =
  /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS|TikTok|BytedanceWebview/i.test(ua);

// Broader check: any in-app browser (social networks, messaging apps, etc.)
export function isInAppBrowser(): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS|Twitter|Snapchat|LinkedIn|TikTok|BytedanceWebview/i.test(ua);
}

export type SocialWebViewSource = 'instagram' | 'facebook' | 'tiktok' | null;

export function getSocialWebViewSource(): SocialWebViewSource {
  if (!isSocialWebView) return null;
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/TikTok|BytedanceWebview/i.test(ua)) return 'tiktok';
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i.test(ua)) return 'facebook';
  return null;
}
