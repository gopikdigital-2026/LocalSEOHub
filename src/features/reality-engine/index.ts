export { default as SourceManager } from './SourceManager';
export { connectSource, disconnectSource, syncSource, getGlobalHealth, getSourceConfidence, formatRelativeTime } from './engine';
export { getAllSourceEntries, getSourceEntry, getSourceEntriesByType } from './registry';
export { createRealityRepository } from './repositories';
export type { SourceId, SourceState, SourceHealth, SyncEvent, RealityState, SourceRegistryEntry } from './types';
