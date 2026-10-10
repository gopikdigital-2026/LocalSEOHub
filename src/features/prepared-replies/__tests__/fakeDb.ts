// In-memory stand-in for the two tables that mirrors their RLS policies, column grants,
// unique constraint, version trigger and content checks closely enough to exercise the repository.
type Row = Record<string, unknown>;
type Err = { code: string; message: string };

const REPLY_WRITABLE = { insert: ['business_id', 'category', 'lang', 'content', 'origin', 'source_fingerprint'], update: ['content', 'origin', 'source_fingerprint'] };
const DETAIL_WRITABLE = { insert: ['business_id', 'address', 'booking_method'], update: ['address', 'booking_method'] };

const hasBadControl = (s: string) => Array.from(s).some((ch) => {
  const c = ch.charCodeAt(0);
  return (c < 32 || c === 127) && c !== 9 && c !== 10 && c !== 13;
});

function contentInvalid(row: Row): boolean {
  if (!('content' in row)) return false;
  const c = row.content;
  return typeof c !== 'string' || !c.trim() || c.length > 1000 || hasBadControl(c)
    || !['location', 'services', 'hours', 'booking', 'contact'].includes(String(row.category))
    || !['es', 'en'].includes(String(row.lang))
    || !['template', 'edited'].includes(String(row.origin ?? 'template'));
}

export interface FakeWorld {
  owners: Record<string, string>;
  premium: Record<string, boolean>;
  tables: { prepared_replies: Row[]; prepared_reply_details: Row[] };
  calls: string[];
}

export const createWorld = (owners: Record<string, string>, premium: Record<string, boolean>): FakeWorld =>
  ({ owners, premium, tables: { prepared_replies: [], prepared_reply_details: [] }, calls: [] });

let seq = 0;

class Query {
  private filters: [string, unknown][] = [];
  constructor(
    private world: FakeWorld, private uid: string | null, private table: keyof FakeWorld['tables'],
    private op: 'select' | 'insert' | 'update', private payload: Row = {},
  ) {}
  select() { return this; }
  eq(col: string, value: unknown) { this.filters.push([col, value]); return this; }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); }
  then<T>(resolve: (v: { data: Row[] | null; error: Err | null }) => T) {
    const r = this.run();
    return Promise.resolve(resolve({ data: r.data as Row[] | null, error: r.error }));
  }

  private fail(code: string) { return { data: null, error: { code, message: 'denied' } }; }

  private visible(): Row[] {
    const uid = this.uid;
    return this.world.tables[this.table].filter((r) => uid && r.user_id === uid && this.world.owners[String(r.business_id)] === uid
      && this.filters.every(([k, v]) => r[k] === v));
  }

  private run(): { data: Row[] | Row | null; error: Err | null } {
    const { world, uid, table } = this;
    world.calls.push(`${table}:${this.op}`);
    if (!uid) return this.fail('42501');
    const writable = table === 'prepared_replies' ? REPLY_WRITABLE : DETAIL_WRITABLE;
    if (this.op === 'select') return { data: this.visible().map((r) => ({ ...r })), error: null };
    if (this.op === 'insert') {
      if (Object.keys(this.payload).some((k) => !writable.insert.includes(k))) return this.fail('42501');
      const businessId = String(this.payload.business_id);
      if (world.owners[businessId] !== uid || !world.premium[uid]) return this.fail('42501');
      const rows = world.tables[table];
      const dup = table === 'prepared_replies'
        ? rows.some((r) => r.business_id === businessId && r.category === this.payload.category && r.lang === this.payload.lang)
        : rows.some((r) => r.business_id === businessId);
      if (dup) return this.fail('23505');
      const row: Row = table === 'prepared_replies'
        ? { origin: 'template', source_fingerprint: '', ...this.payload, id: `r${++seq}`, user_id: uid, version: 1, updated_at: `t${seq}` }
        : { address: null, booking_method: null, ...this.payload, user_id: uid, version: 1 };
      if (table === 'prepared_replies' && contentInvalid(row)) return this.fail('23514');
      rows.push(row);
      return { data: { ...row }, error: null };
    }
    if (Object.keys(this.payload).some((k) => !writable.update.includes(k))) return this.fail('42501');
    if (!world.premium[uid]) return { data: [], error: null };
    const targets = this.visible();
    for (const r of targets) {
      const next = { ...r, ...this.payload };
      if (table === 'prepared_replies' && contentInvalid(next)) return this.fail('23514');
      Object.assign(r, this.payload, { version: Number(r.version) + 1, updated_at: `t${++seq}` });
    }
    return { data: targets.map((r) => ({ ...r })), error: null };
  }
}

export function clientFor(world: FakeWorld, uid: string | null) {
  return {
    from(table: string) {
      const t = table as keyof FakeWorld['tables'];
      return {
        select: () => new Query(world, uid, t, 'select'),
        insert: (payload: Row) => new Query(world, uid, t, 'insert', payload),
        update: (payload: Row) => new Query(world, uid, t, 'update', payload),
      };
    },
  } as never;
}
