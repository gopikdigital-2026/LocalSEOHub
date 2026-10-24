import type { Lang } from '../../../lib/i18n';
import { formatSocialMessage } from '../findings/copy';
import type { FindingParams, FindingPlatform, SupportedRecommendationKey } from '../findings/types';
import { SOCIAL_UI_COPY } from '../ui/copy';

interface IntegrationCopy {
  heading: string;
  cta: string;
  source: (platform: string) => string;
  meta: string;
  postsWithoutText: (n: number, platform: string) => string;
  postsWithoutCaption: (n: number, platform: string) => string;
}

export const SOCIAL_INTEGRATION_COPY: Record<Lang, IntegrationCopy> = {
  es: {
    heading: 'Desde tus redes sociales',
    cta: 'Ver en Inteligencia Social',
    source: (p) => `Basado en tus datos de ${p}`,
    meta: 'Meta',
    postsWithoutText: (n, p) => (n === 1 ? `Revisa 1 publicación de ${p} sin texto` : `Revisa ${n} publicaciones de ${p} sin texto`),
    postsWithoutCaption: (n, p) => (n === 1 ? `Revisa 1 publicación de ${p} sin descripción` : `Revisa ${n} publicaciones de ${p} sin descripción`),
  },
  en: {
    heading: 'From your social accounts',
    cta: 'View in Social Intelligence',
    source: (p) => `Based on your ${p} data`,
    meta: 'Meta',
    postsWithoutText: (n, p) => (n === 1 ? `Review 1 ${p} post without text` : `Review ${n} ${p} posts without text`),
    postsWithoutCaption: (n, p) => (n === 1 ? `Review 1 ${p} post without a caption` : `Review ${n} ${p} posts without a caption`),
  },
};

const count = (params: FindingParams): number | null => {
  const v = params.postsWithoutText;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
};

export function socialItemCopy(
  lang: Lang, key: SupportedRecommendationKey, params: FindingParams, platform: FindingPlatform, messageKey: string,
): { message: string; sourceLabel: string } {
  const c = SOCIAL_INTEGRATION_COPY[lang];
  const ui = SOCIAL_UI_COPY[lang];
  const name = platform === 'cross_platform' ? c.meta : ui.platform[platform];
  const n = count(params);
  let message: string;
  if (key === 'REVIEW_POSTS_WITHOUT_TEXT' && n !== null) message = c.postsWithoutText(n, name);
  else if (key === 'REVIEW_POSTS_WITHOUT_CAPTION' && n !== null) message = c.postsWithoutCaption(n, name);
  else if (key === 'CONSIDER_NEW_CONTENT') message = formatSocialMessage(lang, messageKey, params, platform);
  else message = ui.recTitle[key] ?? formatSocialMessage(lang, messageKey, params, platform);
  return { message, sourceLabel: c.source(name) };
}
