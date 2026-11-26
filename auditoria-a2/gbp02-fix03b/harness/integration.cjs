// GBP-02-FIX03B integration harness. Runs ONLY against the disposable local PostgreSQL (localhost:55432).
// Usage: PROJECT_ROOT=<repo> NODE_PATH=<pg modules> node integration.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { Client } = require("pg");

const ROOT = process.env.PROJECT_ROOT;
const HARNESS_B4 = path.join(ROOT, "auditoria-a2/gate-b4-fix01-verification/harness");
const FIX = path.join(ROOT, "auditoria-a2/gbp02-fix03b");
const M1 = fs.readFileSync(path.join(FIX, "migrations/20261126120000_gbp02_fix03b_oauth_transactional.sql"), "utf8");
const M2 = fs.readFileSync(path.join(FIX, "migrations/20261126120100_gbp02_fix03b_revoke_blind_store.sql"), "utf8");
const RB1 = fs.readFileSync(path.join(FIX, "rollback/ROLLBACK_gbp02_fix03b_oauth_transactional.sql"), "utf8");
const RB2 = fs.readFileSync(path.join(FIX, "rollback/ROLLBACK_gbp02_fix03b_revoke_blind_store.sql"), "utf8");
const CONN = { host: "localhost", port: 55432, user: "postgres" };
if (CONN.host !== "localhost") throw new Error("refusing non-local database");

const results = [];
function check(id, name, ok, detail = "") {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? " — " + detail : ""}`);
}

const hex = () => crypto.randomBytes(32).toString("hex");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const md5ws = (s) => crypto.createHash("md5").update(s.replace(/\s+/g, "")).digest("hex");

function replay(db) {
  execFileSync("node", [path.join(HARNESS_B4, "replay.cjs"), db], { env: process.env, stdio: "pipe" });
}
async function open(db) {
  const c = new Client({ ...CONN, database: db });
  await c.connect();
  return c;
}
async function applyTx(c, sql) {
  await c.query("BEGIN");
  try { await c.query(sql); await c.query("COMMIT"); } catch (e) { await c.query("ROLLBACK"); throw e; }
}

async function asService(c, sql, params) {
  await c.query("SET ROLE service_role");
  try { return await c.query(sql, params); } finally { await c.query("RESET ROLE"); }
}
const consume = async (c, state) => (await asService(c, "SELECT * FROM public.gbp_consume_oauth_state($1)", [state])).rows[0];
const complete = async (c, a, access, refresh, exp = iso(3600e3)) =>
  (await asService(c, "SELECT public.gbp_complete_oauth_attempt($1,$2,$3,$4,$5,$6,$7,$8) r",
    [a.source, a.user, a.biz, a.attempt, a.state, access, refresh, exp])).rows[0].r;
const failA = async (c, a, status = "error", code = "CODE_EXCHANGE_FAILED") =>
  (await asService(c, "SELECT public.gbp_fail_oauth_attempt($1,$2,$3,$4,$5,$6,$7) r",
    [a.source, a.user, a.biz, a.attempt, a.state, status, code])).rows[0].r;
const refresh = async (c, source, ea, er, na, nr, exp = iso(3600e3)) =>
  (await asService(c, "SELECT public.gbp_refresh_credentials($1,$2,$3,$4,$5,$6) r", [source, ea, er, na, nr, exp])).rows[0].r;
const readCreds = async (c, source) =>
  (await asService(c, "SELECT * FROM public.gbp_read_credentials($1)", [source])).rows[0] ?? null;
const row = async (c, source) => (await c.query("SELECT * FROM public.connected_sources WHERE id=$1", [source])).rows[0];
const vaultCount = async (c) => Number((await c.query("SELECT count(*) n FROM vault.secrets")).rows[0].n);

let seq = 0;
async function makeUser(c) {
  const id = crypto.randomUUID();
  await c.query("INSERT INTO auth.users (id) VALUES ($1)", [id]);
  return id;
}
// Mirrors gbp-oauth-start: connecting / authorizing with a fresh state.
async function startAttempt(c, user, biz, { started = iso(), source = null } = {}) {
  const state = hex();
  const meta = { phase: "authorizing", oauth_state: state, oauth_started_at: started };
  if (source) {
    await c.query("UPDATE public.connected_sources SET status='connecting', last_error=NULL, metadata=$2, updated_at=now() WHERE id=$1", [source, meta]);
    return { source, user, biz, state };
  }
  const r = await c.query(
    "INSERT INTO public.connected_sources (user_id, business_id, source_type, status, metadata) VALUES ($1,$2,'google_business','connecting',$3) RETURNING id",
    [user, biz, meta]);
  return { source: r.rows[0].id, user, biz, state };
}
async function connectedRow(c, access, refreshTok) {
  const user = await makeUser(c);
  const biz = `biz-${++seq}`;
  const a = await startAttempt(c, user, biz);
  const k = await consume(c, a.state);
  const att = { ...a, attempt: k.r_attempt_id };
  await complete(c, att, access, refreshTok);
  await c.query("UPDATE public.connected_sources SET status='connected', metadata = metadata || '{\"phase\":\"connected\"}' WHERE id=$1", [a.source]);
  return att;
}

async function dateMatrix(c) {
  const cases = [
    ["2026-11-26T10:00:00.123Z", true], ["2026-11-26T10:00:00Z", true], ["2026-11-26T10:00:00.123456Z", true],
    ["2026-11-26T10:00:00.1234567Z", false], ["2026-11-26T10:00:00+00:00", false], ["2026-11-26T10:00:00", false],
    ["2026-02-30T10:00:00Z", false], ["2026-11-26T25:00:00Z", false], ["2026-13-01T10:00:00Z", false],
    ["infinity", false], ["epoch", false], ["now", false], ["", false], [" 2026-11-26T10:00:00Z", false],
    ["99999-11-26T10:00:00Z", false], ["2026-11-26 10:00:00Z", false],
  ];
  let ok = true; const bad = [];
  for (const [v, valid] of cases) {
    const r = (await asService(c, "SELECT public.gbp_oauth_started_at($1::jsonb) t", [JSON.stringify({ oauth_started_at: v })])).rows[0].t;
    if ((r !== null) !== valid) { ok = false; bad.push(v); }
  }
  for (const meta of ['{"oauth_started_at":1732615200}', '{"oauth_started_at":null}', '{}', '{"oauth_started_at":{"a":1}}', '{"oauth_started_at":["2026-11-26T10:00:00Z"]}', '{"oauth_started_at":true}']) {
    const r = (await asService(c, "SELECT public.gbp_oauth_started_at($1::jsonb) t", [meta])).rows[0].t;
    if (r !== null) { ok = false; bad.push(meta); }
  }
  const nul = (await asService(c, "SELECT public.gbp_oauth_started_at(NULL) t")).rows[0].t;
  check("U-B", "date matrix: strict UTC ISO accepted, everything else NULL without exception", ok && nul === null, bad.join(", "));
}

async function main() {
  const DB = "fix03b_it";
  replay(DB);
  const c = await open(DB);
  const before = (await c.query("SELECT proname, prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'gbp\\_%'")).rows;
  const preStore = md5ws(before.find((r) => r.proname === "gbp_store_credentials").prosrc);
  await applyTx(c, M1);
  check("I-0", "migration 1 applies in a single transaction on the 62-migration replay", true);

  await dateMatrix(c);

  // I-1 / I-2 / I-3 consume semantics
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-consume");
    const v0 = await vaultCount(c);
    const old = await c.query("SELECT public.gbp_vault_put(NULL,'old-access') a, public.gbp_vault_put(NULL,'old-refresh') r");
    await c.query("UPDATE public.connected_sources SET access_token_encrypted=$2, refresh_token_encrypted=$3, token_expires_at=now()+interval '1 hour' WHERE id=$1",
      [a.source, old.rows[0].a, old.rows[0].r]);
    const k = await consume(c, a.state);
    const r = await row(c, a.source);
    check("I-1", "consume: CONSUMED with identity, phase exchanging, plaintext state removed, hash stored, old credentials dropped",
      k.r_result === "CONSUMED" && k.r_source_id === a.source && k.r_user_id === user && k.r_business_id === "biz-consume"
      && /^[0-9a-f-]{36}$/.test(k.r_attempt_id) && r.metadata.phase === "exchanging" && !("oauth_state" in r.metadata)
      && r.metadata.oauth_state_hash === sha(a.state) && r.metadata.attempt_id === k.r_attempt_id
      && r.access_token_encrypted === null && r.refresh_token_encrypted === null && (await vaultCount(c)) === v0);
    const k2 = await consume(c, a.state);
    check("I-2", "second consume of the same state: ALREADY_USED without identifiers",
      k2.r_result === "ALREADY_USED" && k2.r_source_id === null && k2.r_attempt_id === null);
    const k3 = await consume(c, hex());
    const k4 = await consume(c, "not-a-state");
    const k5 = await consume(c, a.state.toUpperCase());
    check("I-3", "unknown / malformed / uppercase state: NOT_FOUND without identifiers",
      [k3, k4, k5].every((x) => x.r_result === "NOT_FOUND" && x.r_source_id === null));
  }

  // I-4 expiry window
  {
    const outcomes = [];
    for (const started of [iso(-16 * 60e3), iso(5 * 60e3), "2026-02-30T10:00:00Z", null, "garbage"]) {
      const user = await makeUser(c);
      const a = await startAttempt(c, user, "biz-exp", { started });
      const k = await consume(c, a.state);
      const r = await row(c, a.source);
      outcomes.push(k.r_result === "EXPIRED" && k.r_source_id === null && r.status === "disconnected"
        && r.last_error === "ATTEMPT_EXPIRED" && !("oauth_state" in r.metadata) && r.access_token_encrypted === null);
      const again = await consume(c, a.state);
      outcomes.push(again.r_result === "ALREADY_USED");
    }
    const user = await makeUser(c);
    const edge = await startAttempt(c, user, "biz-edge", { started: iso(-14 * 60e3) });
    const ke = await consume(c, edge.state);
    const skew = await startAttempt(c, await makeUser(c), "biz-skew", { started: iso(20e3) });
    const ks = await consume(c, skew.state);
    check("I-4", "expiry: >15 min, future >30 s, invalid or missing date => EXPIRED and closed; 14 min and +20 s skew accepted",
      outcomes.every(Boolean) && ke.r_result === "CONSUMED" && ks.r_result === "CONSUMED");
  }

  // I-5 concurrent consume
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-race");
    const c1 = await open(DB), c2 = await open(DB);
    await c1.query("BEGIN"); await c1.query("SET LOCAL ROLE service_role");
    const r1 = (await c1.query("SELECT * FROM public.gbp_consume_oauth_state($1)", [a.state])).rows[0];
    const p2 = (async () => { await c2.query("SET ROLE service_role"); return (await c2.query("SELECT * FROM public.gbp_consume_oauth_state($1)", [a.state])).rows[0]; })();
    await new Promise((r) => setTimeout(r, 300));
    const waiting = (await c.query("SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type='Lock' AND datname=$1", [DB])).rows[0].n;
    await c1.query("COMMIT");
    const r2 = await p2;
    await c1.end(); await c2.end();
    check("I-5", "concurrent consume: second caller blocks on the row lock, exactly one CONSUMED, the other ALREADY_USED",
      Number(waiting) >= 1 && r1.r_result === "CONSUMED" && r2.r_result === "ALREADY_USED", `waiting=${waiting}`);
  }

  // I-6 .. I-10 complete
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-complete");
    const k = await consume(c, a.state);
    const att = { ...a, attempt: k.r_attempt_id };
    const v0 = await vaultCount(c);
    const wrong = [
      { ...att, user: await makeUser(c) }, { ...att, biz: "other-biz" }, { ...att, attempt: crypto.randomUUID() },
      { ...att, state: hex() }, { ...att, source: crypto.randomUUID() },
    ];
    const ws = [];
    for (const w of wrong) ws.push(await complete(c, w, "acc-x", "ref-x"));
    check("I-7", "complete with any mismatched source/user/business/attempt/state: SUPERSEDED and no Vault write",
      ws.every((x) => x === "SUPERSEDED") && (await vaultCount(c)) === v0 && (await row(c, a.source)).metadata.phase === "exchanging");
    const inv = [
      await complete(c, att, "acc", null), await complete(c, att, "", "ref"), await complete(c, att, "a".repeat(4097), "ref"),
      await complete(c, att, "acc", "ref", iso(-1000)), await complete(c, att, "acc", "ref", iso(25 * 3600e3)),
      await complete(c, { ...att, state: "bad" }, "acc", "ref"),
    ];
    check("I-9", "complete with invalid input (missing refresh, empty/oversized token, past/>24 h expiry, bad state): INVALID_INPUT, no write",
      inv.every((x) => x === "INVALID_INPUT") && (await vaultCount(c)) === v0);
    const ok = await complete(c, att, "acc-A", "ref-A");
    const r = await row(c, a.source);
    const creds = await readCreds(c, a.source);
    check("I-6", "complete: COMPLETED, phase select_location, credentials in Vault (refs only in the row), readable back",
      ok === "COMPLETED" && r.metadata.phase === "select_location" && r.last_error === null && r.metadata.authorized_at
      && r.access_token_encrypted.startsWith("vault:") && r.refresh_token_encrypted.startsWith("vault:")
      && creds.access_token === "acc-A" && creds.refresh_token === "ref-A" && (await vaultCount(c)) === v0 + 2
      && !JSON.stringify(r.metadata).includes("acc-A"));
    const again = await complete(c, att, "acc-B", "ref-B");
    check("I-8", "second complete for the same attempt: SUPERSEDED, credentials unchanged",
      again === "SUPERSEDED" && (await readCreds(c, a.source)).access_token === "acc-A" && (await vaultCount(c)) === v0 + 2);

    const late = await startAttempt(c, await makeUser(c), "biz-late");
    const kl = await consume(c, late.state);
    await c.query("UPDATE public.connected_sources SET metadata = jsonb_set(metadata,'{oauth_started_at}',to_jsonb($2::text)) WHERE id=$1", [late.source, iso(-16 * 60e3)]);
    const v1 = await vaultCount(c);
    const rl = await complete(c, { ...late, attempt: kl.r_attempt_id }, "acc", "ref");
    const lr = await row(c, late.source);
    check("I-10", "complete after the 15 min window: EXPIRED, row disconnected with ATTEMPT_EXPIRED, nothing stored",
      rl === "EXPIRED" && lr.status === "disconnected" && lr.last_error === "ATTEMPT_EXPIRED" && lr.access_token_encrypted === null && (await vaultCount(c)) === v1);
  }

  // I-11 superseded attempt A vs new attempt B on the same row
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-ab");
    const ka = await consume(c, a.state);
    const b = await startAttempt(c, user, "biz-ab", { source: a.source });
    const kb = await consume(c, b.state);
    const lateA = await complete(c, { ...a, attempt: ka.r_attempt_id }, "acc-A", "ref-A");
    const failLateA = await failA(c, { ...a, attempt: ka.r_attempt_id });
    const okB = await complete(c, { ...b, attempt: kb.r_attempt_id }, "acc-B", "ref-B");
    const creds = await readCreds(c, a.source);
    check("I-11", "late callback of attempt A after attempt B started: complete and fail are SUPERSEDED; B's credentials win, no mixing",
      lateA === "SUPERSEDED" && failLateA === "SUPERSEDED" && okB === "COMPLETED" && creds.access_token === "acc-B" && creds.refresh_token === "ref-B");
  }

  // I-12 fail
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-fail");
    const k = await consume(c, a.state);
    const att = { ...a, attempt: k.r_attempt_id };
    const inv = [await failA(c, att, "connected"), await failA(c, att, "error", "lower_case"), await failA(c, att, "error", "A".repeat(65)), await failA(c, { ...att, state: "x" })];
    const wrong = await failA(c, { ...att, attempt: crypto.randomUUID() });
    const ok = await failA(c, att, "permissions_required", "GBP_PERMISSION_DENIED");
    const r = await row(c, a.source);
    const again = await failA(c, att);
    check("I-12", "fail: invalid status/code => INVALID_INPUT, wrong attempt => SUPERSEDED, valid => FAILED with no credentials, then SUPERSEDED",
      inv.every((x) => x === "INVALID_INPUT") && wrong === "SUPERSEDED" && ok === "FAILED" && r.status === "permissions_required"
      && r.last_error === "GBP_PERMISSION_DENIED" && r.metadata.phase === "failed" && r.access_token_encrypted === null && again === "SUPERSEDED");
  }

  // I-13 / I-21 refresh compare-and-swap
  {
    const att = await connectedRow(c, "acc-1", "ref-1");
    const v0 = await vaultCount(c);
    const ok = await refresh(c, att.source, "acc-1", "ref-1", "acc-2", null);
    const c1 = await readCreds(c, att.source);
    const stale = await refresh(c, att.source, "acc-1", "ref-1", "acc-stale", "ref-stale");
    const c2 = await readCreds(c, att.source);
    const rot = await refresh(c, att.source, "acc-2", "ref-1", "acc-3", "ref-3");
    const c3 = await readCreds(c, att.source);
    check("I-13", "refresh CAS: matching pair => true; stale pair => false and nothing written; old Vault secrets released",
      ok === true && c1.access_token === "acc-2" && c1.refresh_token === "ref-1" && stale === false && c2.access_token === "acc-2"
      && rot === true && c3.access_token === "acc-3" && c3.refresh_token === "ref-3" && (await vaultCount(c)) === v0);
    const inv = [
      await refresh(c, att.source, "acc-3", null, "x", null), await refresh(c, att.source, "acc-3", "ref-3", null, null),
      await refresh(c, att.source, "acc-3", "ref-3", "x", null, iso(-1000)), await refresh(c, att.source, "acc-3", "ref-3", "x", null, iso(25 * 3600e3)),
      await refresh(c, att.source, "acc-3", "ref-3", "a".repeat(4097), null),
    ];
    check("I-21", "refresh input validation (null expected refresh, null access, bad expiry, oversized) => false, unchanged",
      inv.every((x) => x === false) && (await readCreds(c, att.source)).access_token === "acc-3");
  }

  // I-14 late refresh from authorization A after reconnection B
  {
    const att = await connectedRow(c, "acc-A", "ref-A");
    const readByRefresher = await readCreds(c, att.source);
    const b = await startAttempt(c, att.user, att.biz, { source: att.source });
    const midAuth = await refresh(c, att.source, readByRefresher.access_token, readByRefresher.refresh_token, "acc-A2", null);
    const kb = await consume(c, b.state);
    const midExch = await refresh(c, att.source, readByRefresher.access_token, readByRefresher.refresh_token, "acc-A2", null);
    await complete(c, { ...b, attempt: kb.r_attempt_id }, "acc-B", "ref-B");
    const late = await refresh(c, att.source, readByRefresher.access_token, readByRefresher.refresh_token, "acc-A2", "ref-A2");
    const creds = await readCreds(c, att.source);
    check("I-14", "late refresh from authorization A during/after reconnection B => false every time; row holds only B's pair",
      midAuth === false && midExch === false && late === false && creds.access_token === "acc-B" && creds.refresh_token === "ref-B");
  }

  // I-15 phase guard on the legacy store
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-guard");
    const st = async () => (await asService(c, "SELECT public.gbp_store_credentials($1,'acc','ref',now()+interval '1 hour') r", [a.source])).rows[0].r;
    const s1 = await st();
    const k = await consume(c, a.state);
    const s2 = await st();
    await complete(c, { ...a, attempt: k.r_attempt_id }, "acc-ok", "ref-ok");
    const s3 = await st();
    const disc = await connectedRow(c, "acc-d", "ref-d");
    await c.query("UPDATE public.connected_sources SET status='disconnected' WHERE id=$1", [disc.source]);
    const rd = await refresh(c, disc.source, "acc-d", "ref-d", "x", null);
    check("I-15", "legacy store refused while authorizing/exchanging, allowed in select_location; refresh refused on disconnected",
      s1 === false && s2 === false && s3 === true && rd === false);
  }

  // I-16 concurrent refreshes with the same expected pair
  {
    const att = await connectedRow(c, "acc-c", "ref-c");
    const c1 = await open(DB), c2 = await open(DB);
    await c1.query("BEGIN"); await c1.query("SET LOCAL ROLE service_role");
    const r1 = (await c1.query("SELECT public.gbp_refresh_credentials($1,'acc-c','ref-c','acc-c1',NULL,now()+interval '1 hour') r", [att.source])).rows[0].r;
    const p2 = (async () => { await c2.query("SET ROLE service_role"); return (await c2.query("SELECT public.gbp_refresh_credentials($1,'acc-c','ref-c','acc-c2',NULL,now()+interval '1 hour') r", [att.source])).rows[0].r; })();
    await new Promise((r) => setTimeout(r, 300));
    const waiting = (await c.query("SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type='Lock' AND datname=$1", [DB])).rows[0].n;
    await c1.query("COMMIT");
    const r2 = await p2;
    await c1.end(); await c2.end();
    const creds = await readCreds(c, att.source);
    check("I-16", "concurrent refreshes with the same expected pair: one true, the other blocks then false; first writer's token kept",
      Number(waiting) >= 1 && r1 === true && r2 === false && creds.access_token === "acc-c1", `waiting=${waiting}`);
  }

  // I-17 ACL and function properties
  {
    const fns = [
      ["gbp_oauth_started_at", "'{}'::jsonb"], ["gbp_consume_oauth_state", `'${hex()}'`],
      ["gbp_complete_oauth_attempt", "NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL"], ["gbp_fail_oauth_attempt", "NULL,NULL,NULL,NULL,NULL,NULL,NULL"],
      ["gbp_refresh_credentials", "NULL,NULL,NULL,NULL,NULL,NULL"], ["gbp_store_credentials", "NULL,NULL,NULL,NULL"],
    ];
    const denied = [];
    for (const role of ["anon", "authenticated", "public_probe"]) {
      if (role === "public_probe") { await c.query("DROP ROLE IF EXISTS public_probe"); await c.query("CREATE ROLE public_probe"); await c.query("GRANT USAGE ON SCHEMA public TO public_probe"); }
      for (const [fn, args] of fns) {
        await c.query(`SET ROLE ${role}`);
        try { await c.query(`SELECT * FROM public.${fn}(${args})`); denied.push(`${role}:${fn}:ALLOWED`); }
        catch (e) { if (e.code !== "42501") denied.push(`${role}:${fn}:${e.code}`); }
        finally { await c.query("RESET ROLE"); }
      }
    }
    const props = (await c.query(`SELECT proname, prosecdef, proconfig, proacl::text acl, pg_get_userbyid(proowner) owner FROM pg_proc
      WHERE pronamespace='public'::regnamespace AND proname = ANY($1)`, [fns.map((f) => f[0])])).rows;
    const propsOk = props.length === 6 && props.every((p) => p.owner === "postgres" && p.acl === "{postgres=X/postgres,service_role=X/postgres}"
      && JSON.stringify(p.proconfig) === '["search_path=\\"\\""]' && (p.prosecdef || p.proname === "gbp_oauth_started_at"));
    const noCatchAll = !/EXCEPTION\s+WHEN\s+OTHERS/i.test(M1);
    check("I-17", "anon / authenticated / any other role get 42501 on all six functions; owner postgres, ACL service_role only, search_path '', no WHEN OTHERS",
      denied.length === 0 && propsOk && noCatchAll, denied.join(" ") + (propsOk ? "" : JSON.stringify(props)));
  }

  // I-18 Vault and row change are one transaction
  {
    const user = await makeUser(c);
    const a = await startAttempt(c, user, "biz-atomic");
    const k = await consume(c, a.state);
    const att = await connectedRow(c, "acc-y", "ref-y");
    await c.query("UPDATE public.connected_sources SET metadata = metadata || '{\"boom\":\"yes\"}' WHERE id=$1", [att.source]);
    // Fires after the Vault secrets were created inside the RPC, on the row UPDATE that follows.
    await c.query(`CREATE FUNCTION public.fix03b_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.metadata->>'phase' = 'select_location'
         OR (OLD.metadata->>'boom' = 'yes' AND NEW.access_token_encrypted IS DISTINCT FROM OLD.access_token_encrypted)
      THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$`);
    await c.query("CREATE TRIGGER fix03b_boom BEFORE UPDATE ON public.connected_sources FOR EACH ROW EXECUTE FUNCTION public.fix03b_boom()");
    const v0 = await vaultCount(c);
    let threw = false;
    try { await complete(c, { ...a, attempt: k.r_attempt_id }, "acc-z", "ref-z"); } catch { threw = true; }
    const r = await row(c, a.source);
    const v1 = await vaultCount(c);
    let threw2 = false;
    try { await refresh(c, att.source, "acc-y", "ref-y", "acc-y2", "ref-y2"); } catch { threw2 = true; }
    const creds = await readCreds(c, att.source);
    const v2 = await vaultCount(c);
    await c.query("DROP TRIGGER fix03b_boom ON public.connected_sources");
    await c.query("DROP FUNCTION public.fix03b_boom()");
    check("I-18", "forced failure after the Vault write rolls back both Vault secrets and the row (complete and refresh)",
      threw && v1 === v0 && r.metadata.phase === "exchanging" && r.access_token_encrypted === null
      && threw2 && v2 === v0 && creds.access_token === "acc-y" && creds.refresh_token === "ref-y");
  }

  // I-19 tenant isolation
  {
    const u1 = await makeUser(c), u2 = await makeUser(c);
    const a1 = await startAttempt(c, u1, "biz-shared-name");
    const a2 = await startAttempt(c, u2, "biz-shared-name");
    const before2 = await row(c, a2.source);
    const k1 = await consume(c, a1.state);
    const after2 = await row(c, a2.source);
    const cross = await complete(c, { ...a1, attempt: k1.r_attempt_id, source: a2.source, user: u2 }, "acc-x", "ref-x");
    const cross2 = await complete(c, { ...a2, attempt: k1.r_attempt_id, state: a1.state }, "acc-x", "ref-x");
    const own = await complete(c, { ...a1, attempt: k1.r_attempt_id }, "acc-1", "ref-1");
    const leak = await refresh(c, a2.source, "acc-1", "ref-1", "acc-x", null);
    check("I-19", "isolation: consuming user 1's state never touches user 2's row; cross-tenant complete/refresh refused",
      JSON.stringify(before2.metadata) === JSON.stringify(after2.metadata) && cross === "SUPERSEDED" && cross2 === "SUPERSEDED"
      && own === "COMPLETED" && leak === false && (await readCreds(c, a2.source)).access_token === null);
  }

  // I-20 unchanged functions keep their production bodies
  {
    const after = (await c.query("SELECT proname, prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'gbp\\_%'")).rows;
    const changed = before.filter((b) => b.proname !== "gbp_store_credentials" && md5ws(after.find((a) => a.proname === b.proname).prosrc) !== md5ws(b.prosrc));
    check("I-20", "pre-existing GBP functions other than gbp_store_credentials are byte-identical (whitespace-free md5)", changed.length === 0, changed.map((x) => x.proname).join(","));
  }
  await c.end();

  // I-22 rollback rehearsal + I-23 migration 2 (disposable DB only)
  {
    const RB = "fix03b_rb";
    replay(RB);
    const r = await open(RB);
    await applyTx(r, M1);
    const att = await connectedRow(r, "acc-r", "ref-r");
    await applyTx(r, M2);
    let m2denied = false;
    try { await asService(r, "SELECT public.gbp_store_credentials($1,'a','b',now()+interval '1 hour')", [att.source]); } catch (e) { m2denied = e.code === "42501"; }
    const stillRefresh = await refresh(r, att.source, "acc-r", "ref-r", "acc-r2", null);
    await applyTx(r, RB2);
    const storeBack = (await asService(r, "SELECT public.gbp_store_credentials($1,'acc-r3',NULL,now()+interval '1 hour') r", [att.source])).rows[0].r;
    check("I-23", "migration 2 (disposable DB only): service_role loses the legacy store (42501), refresh RPC unaffected; its rollback restores it",
      m2denied && stillRefresh === true && storeBack === true);

    await applyTx(r, RB1);
    const left = (await r.query("SELECT proname FROM pg_proc WHERE proname = ANY($1)", [["gbp_oauth_started_at", "gbp_consume_oauth_state", "gbp_complete_oauth_attempt", "gbp_fail_oauth_attempt", "gbp_refresh_credentials"]])).rows;
    const st = (await r.query("SELECT prosrc, proacl::text acl FROM pg_proc WHERE proname='gbp_store_credentials'")).rows[0];
    const creds = await readCreds(r, att.source);
    await applyTx(r, M1);
    const reapplied = (await r.query("SELECT count(*) n FROM pg_proc WHERE proname = ANY($1)", [["gbp_consume_oauth_state", "gbp_refresh_credentials"]])).rows[0].n;
    await r.end();
    check("I-22", "rollback: new functions removed, gbp_store_credentials restored to the pre-FIX03B body and ACL, credentials intact, M1 re-appliable",
      left.length === 0 && md5ws(st.prosrc) === preStore && st.acl === "{postgres=X/postgres,service_role=X/postgres}"
      && creds.access_token === "acc-r3" && Number(reapplied) === 2, `store md5 ${md5ws(st.prosrc)} vs ${preStore}`);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  const ver = await open("postgres");
  const v = (await ver.query("SELECT version()")).rows[0].version;
  await ver.end();
  fs.mkdirSync(path.join(FIX, "evidence"), { recursive: true });
  fs.writeFileSync(path.join(FIX, "evidence/integration-results.json"), JSON.stringify({ database: `${CONN.host}:${CONN.port} (disposable)`, server: v, preFix03bStoreMd5: preStore, results }, null, 2) + "\n");
  if (pass !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error("HARNESS ERROR:", e.message); process.exitCode = 2; });
