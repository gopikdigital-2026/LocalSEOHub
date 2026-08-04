// ─── Source types ────────────────────────────────────────────────────────────

export type SourceType =
  | 'google_business'
  | 'website'
  | 'reviews'
  | 'search_console'
  | 'analytics'
  | 'manual';

export type SourceStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'permissions_required';

export type DataMode = 'demo' | 'estimated' | 'manual' | 'verified';

// ─── DB row shape (matches connected_sources table) ─────────────────────────

export interface ConnectedSource {
  id: string;
  user_id: string;
  business_id: string;
  source_type: SourceType;
  status: SourceStatus;
  external_account_id: string | null;
  external_location_id: string | null;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Sync event (matches source_sync_events table) ──────────────────────────

export type SyncEventType =
  | 'source_connect_started'
  | 'source_connected'
  | 'source_connect_failed'
  | 'source_sync_started'
  | 'source_sync_completed'
  | 'source_sync_failed'
  | 'source_disconnected';

export interface SyncEvent {
  id: string;
  user_id: string;
  source_id: string;
  source_type: SourceType;
  event_type: SyncEventType;
  message: string | null;
  records_updated: number;
  error_details: string | null;
  created_at: string;
}

// ─── Source registry (static metadata for each source type) ─────────────────

export interface SourceRegistryEntry {
  id: SourceType;
  name: string;
  description: string;
  icon: string;
  comingSoon: boolean;
  requiresOAuth: boolean;
  dependsOn?: SourceType;
}

// ─── Website analysis result (stored in metadata) ───────────────────────────

export interface WebsiteAnalysis {
  url: string;
  statusCode: number;
  https: boolean;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  canonical: string | null;
  hasSchema: boolean;
  analyzedAt: string;
  errors: string[];
  confidence: DataMode;
}

// ─── Manual entry data ──────────────────────────────────────────────────────

export interface ManualEntryData {
  services: string;
  targetAudience: string;
  differentiators: string;
  promotions: string;
  faqs: string;
  communicationTone: string;
}
