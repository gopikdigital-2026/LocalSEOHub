import type { Lang } from '../../../lib/i18n';
import { evaluateSocialSignals } from '../engine';
import { evaluateSocialFindings } from '../findings/engine';
import { formatSocialMessage } from '../findings/copy';
import { RECOMMENDATION_CATALOG } from '../findings/policy';
import type {
  FindingPlatform, FindingTopic, SocialFinding, SocialFindingsReport, SocialRecommendation, SupportedRecommendationKey,
} from '../findings/types';
import type { SocialPlatform, SocialSignalsReport } from '../types';
import {
  SOCIAL_UI_COPY, joinList,
  type ContentTypeLabelKey, type CoverageAspect, type PlatformStatusKey, type RefreshStatus, type SocialUiCopy,
} from './copy';
import { postRef, type SocialData } from './repository';

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram'];
const ALLOWED_PERMALINK_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'instagram.com', 'www.instagram.com'];

export type Tone = 'success' | 'warning' | 'neutral' | 'default';
export type AttentionTone = 'priority' | 'review' | 'technical';
export type AttentionIcon = 'text' | 'calendar' | 'noContent' | 'stale' | 'reauth' | 'permission' | 'notLinked' | 'rateLimited' | 'syncError' | 'neverSynced';
export type CtaAction = { kind: 'viewPosts' } | { kind: 'refresh' } | { kind: 'sources'; label: string };

export interface ActivityView { label: string; detail: string | null; tone: Tone }

export interface PlatformCardView {
  platform: SocialPlatform;
  name: string;
  account: string | null;
  status: { key: PlatformStatusKey; label: string; tone: Tone };
  activity: ActivityView | null;
  postsAnalysed: string | null;
  historyBuilding: string | null;
  updated: { label: string; dateTime: string; absolute: string } | null;
}

export interface AffectedPostView {
  id: string;
  date: string;
  dateTime: string | null;
  type: string;
  link: { href: string; label: string; newTab: string } | null;
  noLink: string;
}

export interface AttentionCardView {
  id: string;
  topic: FindingTopic;
  platform: FindingPlatform;
  platformLabel: string;
  tone: AttentionTone;
  icon: AttentionIcon;
  badge: string;
  title: string;
  body: string;
  why: string | null;
  notes: string[];
  cta: CtaAction | null;
  posts: AffectedPostView[] | null;
}

export interface KnownItemView { id: string; topic: FindingTopic; title: string; text: string }

export interface CoverageView {
  history: { title: string; platforms: string; body: string; wait: string | null } | null;
  notes: string[];
}

export type SocialViewModel =
  | { kind: 'empty' }
  | {
    kind: 'report';
    evaluatedAt: string;
    overview: PlatformCardView[];
    attention: AttentionCardView[];
    known: KnownItemView[];
    coverage: CoverageView;
  };

export interface SocialAnalysis {
  signals: SocialSignalsReport;
  findings: SocialFindingsReport;
}

export function analyseSocialData(data: SocialData, evaluatedAt: Date | string): SocialAnalysis {
  const signals = evaluateSocialSignals(data.snapshot, evaluatedAt);
  return { signals, findings: evaluateSocialFindings(signals) };
}

// Mirrors the frozen engine's non-exported text predicate; only used to list posts for display.
const hasText = (t: string | null) => typeof t === 'string' && t.trim().length > 0;

export function safeMetaPermalink(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!ALLOWED_PERMALINK_HOSTS.includes(url.hostname.toLowerCase())) return null;
  return url.href;
}

export function isPublishableRecommendation(rec: { recommendationKey: string; safetyClass?: string }): rec is SocialRecommendation {
  const def = (RECOMMENDATION_CATALOG as Record<string, { safetyClass: string; actionType: unknown } | undefined>)[rec.recommendationKey];
  if (!def || def.safetyClass === 'UNSUPPORTED' || def.actionType === null) return false;
  return rec.safetyClass === 'DIRECT' || rec.safetyClass === 'CONTEXTUAL';
}

const numParam = (f: SocialFinding, name: string): number | null => {
  const v = f.params[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

function relativeTime(lang: Lang, iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return fmt.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fmt.format(-hours, 'hour');
  return fmt.format(-Math.floor(hours / 24), 'day');
}

const absoluteDate = (lang: Lang, iso: string, withTime: boolean) =>
  new Intl.DateTimeFormat(lang, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso));

const validIso = (iso: string | null | undefined): iso is string => typeof iso === 'string' && !Number.isNaN(new Date(iso).getTime());

function statusOf(signals: SocialSignalsReport, platform: SocialPlatform): PlatformStatusKey {
  const a = signals.platforms[platform];
  switch (a.blockedReason) {
    case null: return a.freshness === 'STALE' ? 'stale' : 'connected';
    case 'REAUTH_REQUIRED': return 'reauth';
    case 'PERMISSION_UNAVAILABLE': return 'permission';
    case 'NOT_CONNECTED': return 'notConnected';
    case 'NOT_LINKED': return 'notLinked';
    case 'RATE_LIMITED': return 'rateLimited';
    case 'NEVER_SYNCED': return 'neverSynced';
    case 'STALE_DATA': return 'stale';
    default: return 'syncError';
  }
}

const STATUS_TONE: Record<PlatformStatusKey, Tone> = {
  connected: 'success', stale: 'warning', reauth: 'warning', permission: 'warning',
  notConnected: 'neutral', notLinked: 'neutral', rateLimited: 'neutral', syncError: 'neutral', neverSynced: 'neutral',
};

function activityOf(copy: SocialUiCopy, finding: SocialFinding | undefined): ActivityView | null {
  if (!finding) return null;
  const days = numParam(finding, 'daysSinceLastPost');
  switch (finding.topic) {
    case 'RECENT_ACTIVITY': return { label: copy.activityRecent, detail: days === null ? null : copy.lastPost(days), tone: 'success' };
    case 'INTERMEDIATE_ACTIVITY': return days === null ? null : { label: copy.lastPost(days), detail: null, tone: 'neutral' };
    case 'LONG_INACTIVITY': return { label: copy.activityLong, detail: days === null ? null : copy.lastPost(days), tone: 'default' };
    case 'NO_CONTENT': return { label: copy.activityNoContent, detail: null, tone: 'neutral' };
    case 'RECENCY_INSUFFICIENT': return { label: copy.activityNoDates, detail: null, tone: 'neutral' };
    default: return null;
  }
}

const ACTIVITY_TOPICS: FindingTopic[] = ['RECENT_ACTIVITY', 'INTERMEDIATE_ACTIVITY', 'LONG_INACTIVITY', 'NO_CONTENT', 'RECENCY_INSUFFICIENT'];

function platformCard(lang: Lang, copy: SocialUiCopy, data: SocialData, analysis: SocialAnalysis, platform: SocialPlatform, now: Date): PlatformCardView {
  const key = statusOf(analysis.signals, platform);
  const usable = key === 'connected';
  const own = analysis.findings.findings.filter((f) => f.platform === platform);
  const linked = key !== 'notConnected' && key !== 'notLinked';
  const account = !linked ? null
    : platform === 'facebook' ? data.account.pageName
      : data.account.instagramUsername ? `@${data.account.instagramUsername}` : null;
  const lastSuccessAt = analysis.signals.platforms[platform].lastSuccessAt;
  return {
    platform,
    name: copy.platform[platform],
    account,
    status: { key, label: copy.status[key], tone: STATUS_TONE[key] },
    activity: usable ? activityOf(copy, own.find((f) => ACTIVITY_TOPICS.includes(f.topic))) : null,
    postsAnalysed: usable ? copy.postsAnalysed(data.snapshot.items.filter((i) => i.platform === platform).length) : null,
    historyBuilding: usable && own.some((f) => f.topic === 'LIMITED_HISTORY') ? copy.historyBuilding : null,
    updated: validIso(lastSuccessAt)
      ? { label: copy.updated(relativeTime(lang, lastSuccessAt, now)), dateTime: lastSuccessAt, absolute: absoluteDate(lang, lastSuccessAt, true) }
      : linked ? { label: copy.neverUpdated, dateTime: '', absolute: '' } : null,
  };
}

const ACCESS_ICON: Partial<Record<FindingTopic, AttentionIcon>> = {
  ACCESS_REAUTH_REQUIRED: 'reauth', ACCESS_PERMISSION_UNAVAILABLE: 'permission', ACCESS_NOT_CONNECTED: 'notLinked',
  ACCESS_NOT_LINKED: 'notLinked', ACCESS_RATE_LIMITED: 'rateLimited', ACCESS_SYNC_ERROR: 'syncError',
  ACCESS_NEVER_SYNCED: 'neverSynced', DATA_STALE: 'stale',
};
const BUSINESS_ICON: Partial<Record<FindingTopic, AttentionIcon>> = {
  TEXT_MISSING: 'text', CAPTION_MISSING: 'text', LONG_INACTIVITY: 'calendar', NO_CONTENT: 'noContent',
};

const TECHNICAL_STATUS: Partial<Record<FindingTopic, PlatformStatusKey>> = {
  ACCESS_REAUTH_REQUIRED: 'reauth', ACCESS_PERMISSION_UNAVAILABLE: 'permission', ACCESS_NOT_CONNECTED: 'notConnected',
  ACCESS_NOT_LINKED: 'notLinked', ACCESS_RATE_LIMITED: 'rateLimited', ACCESS_SYNC_ERROR: 'syncError',
  ACCESS_NEVER_SYNCED: 'neverSynced', DATA_STALE: 'stale',
};

const isTechnical = (f: SocialFinding) => f.topic === 'DATA_STALE' || f.topic.startsWith('ACCESS_');
const isAttention = (f: SocialFinding) =>
  f.status === 'ACTIVE' || f.status === 'STALE' || (f.status === 'NOT_AVAILABLE' && f.topic.startsWith('ACCESS_'));

function ctaFor(copy: SocialUiCopy, f: SocialFinding, rec: SocialRecommendation | null, posts: AffectedPostView[] | null): CtaAction | null {
  switch (rec?.recommendationKey) {
    case 'REVIEW_POSTS_WITHOUT_TEXT':
    case 'REVIEW_POSTS_WITHOUT_CAPTION': return posts && posts.length > 0 ? { kind: 'viewPosts' } : null;
    case 'REFRESH_DATA': return { kind: 'refresh' };
    case 'RECONNECT_META':
    case 'REVIEW_META_PERMISSIONS': return { kind: 'sources', label: copy.goToSources };
    case 'CONNECT_PLATFORM': return { kind: 'sources', label: f.topic === 'ACCESS_NOT_CONNECTED' ? copy.connectCta : copy.goToSources };
    default: return null;
  }
}

function contentTypeLabel(copy: SocialUiCopy, type: string): string {
  const key = (type === 'status' || type === 'other' ? 'post' : type) as ContentTypeLabelKey;
  return copy.contentType[key] ?? copy.contentType.post;
}

export function affectedPosts(lang: Lang, copy: SocialUiCopy, data: SocialData, finding: SocialFinding): AffectedPostView[] | null {
  if (finding.topic !== 'TEXT_MISSING' && finding.topic !== 'CAPTION_MISSING') return null;
  if (finding.platform !== 'facebook' && finding.platform !== 'instagram') return null;
  const platform = finding.platform;
  const expected = numParam(finding, 'postsWithoutText');
  const candidates = data.snapshot.items.filter((i) => i.platform === platform && !hasText(i.text_content));
  if (expected === null || candidates.length !== expected) return null;
  return [...candidates]
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '') || a.external_id.localeCompare(b.external_id))
    .map((item) => {
      const href = safeMetaPermalink(data.permalinks[postRef(platform, item.external_id)]);
      const hostPlatform = href && new URL(href).hostname.includes('instagram') ? 'instagram' : 'facebook';
      return {
        id: postRef(platform, item.external_id),
        date: validIso(item.published_at) ? absoluteDate(lang, item.published_at, false) : copy.dateUnavailable,
        dateTime: validIso(item.published_at) ? item.published_at : null,
        type: contentTypeLabel(copy, item.content_type),
        link: href ? { href, label: copy.openOn(copy.platform[hostPlatform]), newTab: copy.newTab } : null,
        noLink: copy.noLink,
      };
    });
}

function attentionCard(lang: Lang, copy: SocialUiCopy, data: SocialData, analysis: SocialAnalysis, f: SocialFinding): AttentionCardView {
  const rec = analysis.findings.recommendations
    .filter(isPublishableRecommendation)
    .find((r) => r.findingKey === f.findingKey && r.recommendationKey !== 'WAIT_FOR_MORE_HISTORY') ?? null;
  const technical = isTechnical(f);
  const posts = affectedPosts(lang, copy, data, f);
  const recTitle = rec ? copy.recTitle[rec.recommendationKey as SupportedRecommendationKey] : undefined;
  const notes: string[] = [];
  if (technical) {
    const platforms = f.platform === 'cross_platform' ? PLATFORMS : [f.platform];
    const last = platforms.map((p) => analysis.signals.platforms[p].lastSuccessAt).filter(validIso).sort().pop();
    if (last) notes.push(copy.lastGood(absoluteDate(lang, last, true)));
  } else if (f.platform !== 'cross_platform') {
    const p = f.platform;
    if (analysis.signals.signals.some((s) => s.platform === p && s.evidence.windowTruncated === true)) notes.push(copy.windowTruncated);
  }
  const summary = formatSocialMessage(lang, f.summaryKey, f.params, f.platform);
  return {
    id: f.findingKey,
    topic: f.topic,
    platform: f.platform,
    platformLabel: f.platform === 'cross_platform' ? joinList(lang, PLATFORMS.map((p) => copy.platform[p])) : copy.platform[f.platform],
    tone: technical ? 'technical' : f.priority === 'MEDIUM' || f.priority === 'HIGH' ? 'priority' : 'review',
    icon: (technical ? ACCESS_ICON[f.topic] : BUSINESS_ICON[f.topic]) ?? 'syncError',
    badge: technical ? copy.status[TECHNICAL_STATUS[f.topic] ?? 'syncError'] : f.priority === 'MEDIUM' || f.priority === 'HIGH' ? copy.priority : copy.toReview,
    title: recTitle ?? formatSocialMessage(lang, f.titleKey, f.params, f.platform),
    body: rec ? formatSocialMessage(lang, rec.messageKey, rec.params, rec.platform) : summary,
    why: rec ? summary : null,
    notes,
    cta: ctaFor(copy, f, rec, posts),
    posts,
  };
}

const ASPECT_OF: Partial<Record<FindingTopic, CoverageAspect>> = {
  FREQUENCY_INSUFFICIENT: 'frequency', CONTENT_TYPE_INSUFFICIENT: 'contentType',
  ENGAGEMENT_SAMPLE_INSUFFICIENT: 'engagement', RECENCY_INSUFFICIENT: 'dates',
};
const ASPECT_ORDER: CoverageAspect[] = ['dates', 'frequency', 'contentType', 'engagement'];

function coverageOf(lang: Lang, copy: SocialUiCopy, analysis: SocialAnalysis, visible: SocialFinding[]): CoverageView {
  const limited = visible.filter((f) => f.status === 'INSUFFICIENT_DATA');
  const aspects = new Set<CoverageAspect>();
  const platforms = new Set<SocialPlatform>();
  for (const f of limited) {
    if (f.platform !== 'cross_platform') platforms.add(f.platform);
    const topics = f.topic === 'LIMITED_HISTORY' ? f.groupedFindings.map((g) => g.topic) : [f.topic];
    for (const t of topics) {
      const a = ASPECT_OF[t];
      if (a) aspects.add(a);
    }
  }
  const waitRec = analysis.findings.recommendations
    .filter(isPublishableRecommendation)
    .find((r) => r.recommendationKey === 'WAIT_FOR_MORE_HISTORY');
  const aspectText = joinList(lang, ASPECT_ORDER.filter((a) => aspects.has(a)).map((a) => copy.coverageAspect[a]));
  const history = limited.length && aspects.size
    ? {
      title: copy.coverageHistoryTitle,
      platforms: PLATFORMS.filter((p) => platforms.has(p)).map((p) => copy.platform[p]).join(' · '),
      body: copy.coverageHistoryBody(aspectText),
      wait: waitRec ? formatSocialMessage(lang, waitRec.messageKey, waitRec.params, waitRec.platform) : null,
    }
    : null;
  const notes = visible
    .filter((f) => f.topic === 'ENGAGEMENT_METRICS_UNAVAILABLE' && f.platform !== 'cross_platform')
    .map((f) => copy.coverageEngagementUnavailable(copy.platform[f.platform as SocialPlatform]));
  return { history, notes };
}

export function buildSocialViewModel(data: SocialData, analysis: SocialAnalysis, lang: Lang): SocialViewModel {
  const copy = SOCIAL_UI_COPY[lang];
  const findings = analysis.findings.findings;
  if (findings.some((f) => f.findingKey === 'CROSS_PLATFORM_ACCESS_NOT_CONNECTED')) return { kind: 'empty' };

  const now = new Date(analysis.signals.evaluatedAt);
  // A business finding computed from stale data must not be shown as current; DATA_STALE speaks for it.
  const visible = findings.filter((f) => isTechnical(f) || f.freshness !== 'STALE');

  return {
    kind: 'report',
    evaluatedAt: analysis.signals.evaluatedAt,
    overview: PLATFORMS.map((p) => platformCard(lang, copy, data, analysis, p, now)),
    attention: visible.filter(isAttention).map((f) => attentionCard(lang, copy, data, analysis, f)),
    known: visible.filter((f) => f.status === 'INFORMATIONAL').map((f) => ({
      id: f.findingKey,
      topic: f.topic,
      title: formatSocialMessage(lang, f.titleKey, f.params, f.platform),
      text: formatSocialMessage(lang, f.summaryKey, f.params, f.platform),
    })),
    coverage: coverageOf(lang, copy, analysis, visible),
  };
}

export function refreshOutcome(code: string | null, vm: SocialViewModel | null): Exclude<RefreshStatus, 'idle' | 'refreshing'> {
  if (code === 'SYNC_COOLDOWN') return 'cooldown';
  if (code === 'REAUTH_REQUIRED') return 'reauth';
  if (code !== null) return 'error';
  const keys = vm?.kind === 'report' ? vm.overview.map((p) => p.status.key) : [];
  if (keys.includes('reauth')) return 'reauth';
  if (keys.includes('permission')) return 'permission';
  if (keys.includes('rateLimited')) return 'rateLimited';
  if (keys.includes('syncError')) return 'error';
  return 'success';
}
