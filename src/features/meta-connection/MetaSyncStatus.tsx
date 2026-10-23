import { useCallback, useEffect, useState } from 'react';
import { Facebook, Instagram, Loader2, RefreshCw } from 'lucide-react';
import { META_SYNC_COPY, syncLine, type MetaSyncStateRow, type SyncPlatform } from './metaSyncStatus';
import { loadMetaSyncState, syncMetaContent } from './metaRepository';

const toneText = { ok: 'text-v2-text-primary', muted: 'text-v2-text-tertiary', warning: 'text-v2-warning-700' } as const;

export function MetaSyncStatus({ businessId, lang, onReauth }: { businessId: string; lang: 'es' | 'en'; onReauth: () => void }) {
  const t = META_SYNC_COPY[lang];
  const [rows, setRows] = useState<MetaSyncStateRow[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await loadMetaSyncState(businessId));
    } catch {
      setRows([]);
      setNotice(t.failed);
    }
  }, [businessId, t.failed]);

  useEffect(() => { void load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setNotice(null);
    const result = await syncMetaContent();
    if (!result.ok) {
      if (result.code === 'REAUTH_REQUIRED') {
        setSyncing(false);
        onReauth();
        return;
      }
      setNotice(result.code === 'SYNC_COOLDOWN' ? t.cooldown : t.failed);
    }
    await load();
    setSyncing(false);
  };

  const line = (platform: SyncPlatform) => {
    const l = syncLine(rows?.find((r) => r.platform === platform), platform, lang);
    const Icon = platform === 'facebook' ? Facebook : Instagram;
    return (
      <li className="flex items-start gap-2 text-[11px] leading-relaxed">
        <Icon size={12} className="mt-0.5 shrink-0 text-v2-text-tertiary" />
        <div className="min-w-0">
          <p className={`font-medium ${toneText[l.tone]}`}>{l.summary}</p>
          {l.detail && <p className="text-v2-text-tertiary">{l.detail}</p>}
        </div>
      </li>
    );
  };

  return (
    <div className="mb-3 rounded-v2-lg border border-v2-border bg-v2-neutral-50 p-2.5">
      {rows === null ? (
        <Loader2 size={13} className="animate-spin text-v2-text-tertiary" />
      ) : (
        <ul className="space-y-1.5">
          {line('facebook')}
          {line('instagram')}
        </ul>
      )}
      {notice && <p role="status" className="mt-2 text-[11px] text-v2-warning-700">{notice}</p>}
      <button
        onClick={() => void handleSync()}
        disabled={syncing || rows === null}
        className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-v2-primary-600 hover:text-v2-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        {syncing ? t.syncing : t.sync}
      </button>
    </div>
  );
}
