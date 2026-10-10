import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_REPLY_CHARS, REPLY_CATEGORIES, factsFrom, originFor, replyView, suggestReply, validateReply,
  type BookingMethod, type ReplyFacts, type SavedReply,
} from '../model';
import { loadDetails, loadReplies, saveDetails, saveReply } from '../repository';
import { REPLIES_COPY } from '../copy';
import { clientFor, createWorld } from './fakeDb';
import * as weekly from '../../weekly-content/model';
import * as improvement from '../../improvement/model';

const ROOT = join(__dirname, '../../../..');
const FEATURE = join(ROOT, 'src/features/prepared-replies');
const MIGRATION = '20261010143224_v073_prepared_replies.sql';
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const migration = stripComments(readFileSync(join(ROOT, 'supabase/migrations', MIGRATION), 'utf8'));

const business = {
  name: 'Peluquería Lola', city: 'Sevilla', services: ['Corte', 'Color', 'Peinados'],
  schedule: 'L-V 9:00-14:00 y 17:00-20:00', phone: '954 000 000', website: 'https://peluquerialola.es',
};
const details: { address: string; booking_method: BookingMethod } = { address: 'Calle Feria 12', booking_method: 'phone' };
const facts = (b: Partial<typeof business> = {}, d: Partial<typeof details> | null = details) =>
  factsFrom({ ...business, ...b }, d ? { ...details, ...d } : null);
const text = (cat: Parameters<typeof suggestReply>[0], f: ReplyFacts, lang: 'es' | 'en' = 'es') => {
  const s = suggestReply(cat, f, lang);
  if (s.status !== 'ready') throw new Error(`expected ready, got ${s.missing.join(',')}`);
  return s.text;
};

const U1 = 'user-1', U2 = 'user-2', FREE = 'user-free';
const B1 = 'biz-1', B1b = 'biz-1b', B2 = 'biz-2', BF = 'biz-free';
const world = () => createWorld({ [B1]: U1, [B1b]: U1, [B2]: U2, [BF]: FREE }, { [U1]: true, [U2]: true, [FREE]: false });
const draft = (over: Partial<Parameters<typeof saveReply>[0]> = {}) => ({
  businessId: B1, category: 'hours' as const, lang: 'es' as const, content: 'Abrimos de 9 a 14.', origin: 'template' as const, fingerprint: 'fp1', ...over,
});
const saved = async (r: ReturnType<typeof saveReply>) => {
  const out = await r;
  if (out.status !== 'saved') throw new Error(out.status);
  return out.row;
};

describe('v0.7.3 plantillas deterministas', () => {
  it('1. ubicación con dirección confirmada', () => {
    const es = text('location', facts());
    expect(es).toContain('Calle Feria 12, Sevilla');
    expect(es).toContain('Peluquería Lola');
    expect(text('location', facts(), 'en')).toMatch(/^Hi! You'll find us at Calle Feria 12, Sevilla\./);
    expect(text('location', facts({}, { address: 'Calle Feria 12, Sevilla' }))).not.toContain('Sevilla, Sevilla');
  });

  it('2. ubicación sin dirección: pide completar en lugar de inventar', () => {
    expect(suggestReply('location', facts({}, { address: '' }), 'es')).toEqual({ status: 'missing', missing: ['address'] });
    expect(suggestReply('location', facts({}, null), 'en')).toEqual({ status: 'missing', missing: ['address'] });
  });

  it('3. servicios declarados, sin duplicados y en orden', () => {
    expect(text('services', facts())).toContain('ofrecemos Corte, Color y Peinados.');
    expect(text('services', facts(), 'en')).toContain('we offer Corte, Color and Peinados.');
    expect(text('services', facts({ services: ['Corte', ' corte ', '', 'Color'] }))).toContain('ofrecemos Corte y Color.');
  });

  it('4. ausencia de servicios', () => {
    expect(suggestReply('services', facts({ services: [] }), 'es')).toEqual({ status: 'missing', missing: ['services'] });
  });

  it('5. horario confirmado, copiado literalmente', () => {
    expect(text('hours', facts())).toBe('¡Hola! Nuestro horario en Peluquería Lola es: L-V 9:00-14:00 y 17:00-20:00.');
    expect(text('hours', facts({ schedule: 'Lunes a sábado 10-20.' }), 'en')).toBe('Hi! Our opening hours at Peluquería Lola are: Lunes a sábado 10-20.');
  });

  it('6. horario desconocido', () => {
    expect(suggestReply('hours', facts({ schedule: '   ' }), 'es')).toEqual({ status: 'missing', missing: ['schedule'] });
  });

  it('7. reserva con procedimiento declarado', () => {
    expect(text('booking', facts())).toContain('llámanos al 954 000 000');
    expect(text('booking', facts({}, { booking_method: 'website' }))).toContain('https://peluquerialola.es');
    expect(text('booking', facts({}, { booking_method: 'in_person' }), 'en')).toContain('drop by Peluquería Lola (Calle Feria 12)');
    expect(text('booking', facts({}, { booking_method: 'walk_in' }))).toContain('no hace falta pedir cita');
    expect(suggestReply('booking', facts({ phone: '' }), 'es')).toEqual({ status: 'missing', missing: ['phone'] });
    expect(suggestReply('booking', facts({ website: '' }, { booking_method: 'website' }), 'es')).toEqual({ status: 'missing', missing: ['website'] });
  });

  it('8. reserva sin procedimiento: no asume sistema de reservas', () => {
    expect(suggestReply('booking', facts({}, { booking_method: undefined as never }), 'es')).toEqual({ status: 'missing', missing: ['booking'] });
    expect(suggestReply('booking', factsFrom(business, { address: null, booking_method: 'online_system' as never }), 'es'))
      .toEqual({ status: 'missing', missing: ['booking'] });
    expect(REPLIES_COPY.es.booking.prompt).toMatch(/No damos por hecho/);
  });

  it('9. contacto confirmado', () => {
    expect(text('contact', facts())).toContain('llamando al 954 000 000 o a través de nuestra web: https://peluquerialola.es');
    expect(text('contact', facts({ website: '' }), 'en')).toBe('Hi! You can reach Peluquería Lola by calling 954 000 000.');
    expect(text('contact', facts({ phone: '' }))).not.toContain('llamando');
  });

  it('10. contacto desconocido', () => {
    expect(suggestReply('contact', facts({ phone: '', website: '' }), 'es')).toEqual({ status: 'missing', missing: ['contact'] });
  });

  it('nunca inventa datos: solo aparecen cifras y enlaces declarados', () => {
    const f = facts();
    for (const cat of REPLY_CATEGORIES) {
      for (const lang of ['es', 'en'] as const) {
        const out = text(cat, f, lang);
        const declared = [f.schedule, f.phone, f.website, f.address].join(' ');
        for (const n of out.match(/\d+/g) ?? []) expect(declared).toContain(n);
        expect(out).not.toMatch(/€|\$|%|descuento|discount|precio|price|gratis|free/i);
        expect(out.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
      }
    }
  });

  it('las plantillas son deterministas y sin nombre de negocio piden el nombre', () => {
    expect(suggestReply('hours', facts(), 'es')).toEqual(suggestReply('hours', facts(), 'es'));
    expect(suggestReply('hours', facts({ name: '' }), 'es')).toEqual({ status: 'missing', missing: ['name'] });
  });
});

describe('v0.7.3 persistencia, edición y separación', () => {
  it('11. edición de una respuesta marca origen editado', async () => {
    const w = world();
    const db = clientFor(w, U1);
    const first = await saved(saveReply(draft(), null, db));
    const edited = await saved(saveReply(draft({ content: 'Abrimos de 9 a 14, ¡te esperamos!', origin: 'edited' }), first, db));
    expect(edited).toMatchObject({ content: 'Abrimos de 9 a 14, ¡te esperamos!', origin: 'edited', version: 2 });
    const s = suggestReply('hours', facts(), 'es');
    expect(originFor(text('hours', facts()), s)).toBe('template');
    expect(originFor('Otro texto', s)).toBe('edited');
  });

  it('12. guardado y recuperación', async () => {
    const w = world();
    const db = clientFor(w, U1);
    await saved(saveReply(draft({ content: '  Texto con espacios  ' }), null, db));
    const rows = await loadReplies(B1, 'es', db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'hours', content: 'Texto con espacios', lang: 'es' });
  });

  it('13. persistencia entre sesiones (nuevo cliente, mismo usuario)', async () => {
    const w = world();
    await saved(saveReply(draft({ content: 'Guardado ayer' }), null, clientFor(w, U1)));
    await saveDetails(B1, { address: 'Calle Feria 12' }, null, clientFor(w, U1));
    const later = clientFor(w, U1);
    expect((await loadReplies(B1, 'es', later))[0].content).toBe('Guardado ayer');
    expect(await loadDetails(B1, later)).toMatchObject({ address: 'Calle Feria 12', booking_method: null });
  });

  it('14. separación entre negocios del mismo usuario', async () => {
    const w = world();
    const db = clientFor(w, U1);
    await saved(saveReply(draft({ content: 'Negocio 1' }), null, db));
    await saved(saveReply(draft({ businessId: B1b, content: 'Negocio 1b' }), null, db));
    expect((await loadReplies(B1, 'es', db)).map((r) => r.content)).toEqual(['Negocio 1']);
    expect((await loadReplies(B1b, 'es', db)).map((r) => r.content)).toEqual(['Negocio 1b']);
  });

  it('15. separación entre usuarios', async () => {
    const w = world();
    const mine = await saved(saveReply(draft({ content: 'Privado' }), null, clientFor(w, U1)));
    const other = clientFor(w, U2);
    expect(await loadReplies(B1, 'es', other)).toEqual([]);
    expect(await saveReply(draft({ content: 'hack' }), mine, other)).toEqual({ status: 'conflict' });
    expect(w.tables.prepared_replies[0].content).toBe('Privado');
  });

  it('16. separación entre español e inglés', async () => {
    const w = world();
    const db = clientFor(w, U1);
    await saved(saveReply(draft({ content: 'Respuesta editada en español', origin: 'edited' }), null, db));
    await saved(saveReply(draft({ lang: 'en', content: 'We open 9 to 2.' }), null, db));
    expect((await loadReplies(B1, 'es', db))[0].content).toBe('Respuesta editada en español');
    expect((await loadReplies(B1, 'en', db))[0].content).toBe('We open 9 to 2.');
    expect(suggestReply('hours', facts(), 'en')).not.toEqual(suggestReply('hours', facts(), 'es'));
  });

  it('17. cambio de datos del negocio sin sobrescribir ediciones', () => {
    const before = suggestReply('hours', facts(), 'es');
    if (before.status !== 'ready') throw new Error();
    const reply: SavedReply = {
      id: 'r', business_id: B1, category: 'hours', lang: 'es', content: 'Mi versión', origin: 'edited',
      source_fingerprint: before.fingerprint, version: 3, updated_at: 'x',
    };
    expect(replyView('hours', facts(), 'es', reply)).toMatchObject({ kind: 'saved', stale: false });
    const changed = replyView('hours', facts({ schedule: 'L-S 10:00-21:00' }), 'es', reply);
    expect(changed).toMatchObject({ kind: 'saved', stale: true, reply: { content: 'Mi versión' } });
    expect(replyView('hours', facts({ schedule: '' }), 'es', reply)).toMatchObject({ kind: 'saved', stale: true, reply: { content: 'Mi versión' } });
    expect(replyView('hours', facts({ phone: '000' }), 'es', reply)).toMatchObject({ stale: false });
  });

  it('18. actualización manual de una plantilla', async () => {
    const w = world();
    const db = clientFor(w, U1);
    const old = suggestReply('hours', facts(), 'es');
    if (old.status !== 'ready') throw new Error();
    const first = await saved(saveReply(draft({ content: old.text, fingerprint: old.fingerprint }), null, db));
    const fresh = suggestReply('hours', facts({ schedule: 'L-S 10:00-21:00' }), 'es');
    if (fresh.status !== 'ready') throw new Error();
    expect(replyView('hours', facts({ schedule: 'L-S 10:00-21:00' }), 'es', first)).toMatchObject({ stale: true });
    const updated = await saved(saveReply(draft({ content: fresh.text, fingerprint: fresh.fingerprint, origin: originFor(fresh.text, fresh) }), first, db));
    expect(updated).toMatchObject({ content: fresh.text, origin: 'template', version: 2 });
    expect(replyView('hours', facts({ schedule: 'L-S 10:00-21:00' }), 'es', updated)).toMatchObject({ stale: false });
  });

  it('19. conflictos entre pestañas', async () => {
    const w = world();
    const tabA = clientFor(w, U1);
    const tabB = clientFor(w, U1);
    const base = await saved(saveReply(draft(), null, tabA));
    await saved(saveReply(draft({ content: 'Pestaña A' }), base, tabA));
    expect(await saveReply(draft({ content: 'Pestaña B' }), base, tabB)).toEqual({ status: 'conflict' });
    expect(w.tables.prepared_replies[0].content).toBe('Pestaña A');
    expect(await saveReply(draft({ content: 'Doble alta' }), null, tabB)).toEqual({ status: 'conflict' });
    const d1 = await saveDetails(B1, { address: 'A' }, null, tabA);
    if (d1.status !== 'saved') throw new Error();
    await saveDetails(B1, { address: 'B' }, d1.row, tabA);
    expect(await saveDetails(B1, { address: 'C' }, d1.row, tabB)).toEqual({ status: 'conflict' });
  });
});

describe('v0.7.3 copia, seguridad y Premium', () => {
  afterEach(() => vi.restoreAllMocks());

  it('20. copiar solo usa el portapapeles y no envía mensajes', () => {
    const item = readFileSync(join(FEATURE, 'ReplyItem.tsx'), 'utf8');
    const onCopy = item.slice(item.indexOf('const onCopy'), item.indexOf('const chip'));
    expect(onCopy).toContain('navigator.clipboard.writeText(text)');
    expect(onCopy).not.toMatch(/fetch|invoke|onSave|from\(|mailto|wa\.me|sms:/);
    for (const f of readdirSync(FEATURE).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
      expect(readFileSync(join(FEATURE, f), 'utf8')).not.toMatch(/mailto:|wa\.me|whatsapp:|sms:|window\.open|fetch\(/i);
    }
    expect(REPLIES_COPY.es.copiedNote).toMatch(/No se ha enviado nada/);
    expect(REPLIES_COPY.en.copiedNote).toMatch(/Nothing has been sent/);
  });

  it('21. acceso no autorizado', async () => {
    const w = world();
    const anon = clientFor(w, null);
    await expect(loadReplies(B1, 'es', anon)).rejects.toThrow();
    expect(await saveReply(draft(), null, anon)).toEqual({ status: 'locked' });
    expect(await saveReply(draft({ businessId: B2 }), null, clientFor(w, U1))).toEqual({ status: 'locked' });
    expect(await saveDetails(B2, { address: 'x' }, null, clientFor(w, U1))).toEqual({ status: 'locked' });
    expect(w.tables.prepared_replies).toHaveLength(0);
    expect(migration).toMatch(/REVOKE ALL ON public\.prepared_replies FROM anon;/);
    expect(migration).toMatch(/REVOKE ALL ON public\.prepared_reply_details FROM anon;/);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY;[\s\S]*prepared_reply_details ENABLE ROW LEVEL SECURITY;/);
    expect(migration).not.toMatch(/GRANT[^;]*DELETE[^;]*prepared_repl/i);
    expect(migration).not.toMatch(/FOR DELETE/i);
    expect(migration).toMatch(/GRANT UPDATE \(content, origin, source_fingerprint\) ON public\.prepared_replies TO authenticated;/);
    expect((migration.match(/auth\.uid\(\) = user_id/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('22. sin Premium: lectura permitida, escritura bloqueada en servidor', async () => {
    const w = world();
    expect(await saveReply(draft({ businessId: BF }), null, clientFor(w, FREE))).toEqual({ status: 'locked' });
    expect(await saveDetails(BF, { booking_method: 'phone' }, null, clientFor(w, FREE))).toEqual({ status: 'locked' });
    w.tables.prepared_replies.push({ id: 'old', user_id: FREE, business_id: BF, category: 'hours', lang: 'es', content: 'De cuando tenía prueba', origin: 'template', source_fingerprint: '', version: 1, updated_at: 'x' });
    const db = clientFor(w, FREE);
    const rows = await loadReplies(BF, 'es', db);
    expect(rows[0].content).toBe('De cuando tenía prueba');
    expect(await saveReply(draft({ businessId: BF, content: 'Nuevo' }), rows[0], db)).toEqual({ status: 'conflict' });
    expect(w.tables.prepared_replies[0].content).toBe('De cuando tenía prueba');
    expect(migration).toMatch(/AS RESTRICTIVE FOR INSERT[\s\S]*?current_user_has_premium\(\)/);
    expect((migration.match(/AS RESTRICTIVE FOR (INSERT|UPDATE)/g) ?? [])).toHaveLength(4);
  });

  it('23. validación de contenido', async () => {
    expect(validateReply('')).toBe('empty');
    expect(validateReply('   \n ')).toBe('empty');
    expect(validateReply('x'.repeat(MAX_REPLY_CHARS + 1))).toBe('too_long');
    expect(validateReply(`hola${String.fromCharCode(7)}`)).toBe('invalid_chars');
    expect(validateReply('Línea 1\nLínea 2\t¡ok!')).toBeNull();
    const w = world();
    const db = clientFor(w, U1);
    await expect(saveReply(draft({ content: `a${String.fromCharCode(0)}b` }), null, db)).rejects.toThrow('unavailable');
    expect(w.tables.prepared_replies).toHaveLength(0);
    expect(migration).toMatch(/char_length\(content\) <= 1000/);
  });

  it('24. sin llamadas a IA ni funciones remotas', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const w = world();
    const db = clientFor(w, U1);
    for (const cat of REPLY_CATEGORIES) suggestReply(cat, facts(), 'es');
    await saveReply(draft(), null, db);
    await loadReplies(B1, 'es', db);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const f of readdirSync(FEATURE).filter((n) => /\.tsx?$/.test(n))) {
      const src = readFileSync(join(FEATURE, f), 'utf8');
      expect(src).not.toMatch(/functions\.invoke|openai|\/functions\/v1|gpt-|anthropic/i);
    }
    expect(readdirSync(join(ROOT, 'supabase/functions'))).not.toContain('prepared-replies');
  });

  it('25. sin regresiones en los límites de v0.7.1 y v0.7.2', () => {
    expect(weekly.MAX_GENERATIONS).toBe(3);
    expect(weekly.MAX_ATTEMPTS).toBe(6);
    expect(weekly.MAX_CONTENT_CHARS).toBe(2200);
    expect(improvement.MAX_GENERATIONS).toBe(3);
    expect(improvement.MAX_ATTEMPTS).toBe(6);
    expect(improvement.MAX_CONTENT_CHARS).toBe(2000);
    expect(migration).not.toMatch(/weekly_content_drafts|business_improvement_drafts|ALTER TABLE public\.businesses/);
  });
});
