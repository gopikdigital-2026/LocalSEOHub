// Real-PostgreSQL behavioural checks for Gate B.4 FIX01. Runs only against the disposable local server.
const { Client } = require("pg");
const crypto = require("crypto");

const CONN = { host: "localhost", port: 55432, user: "postgres" };
const DBS = { prefix: process.env.PREFIX_DB || "audit", fixed: process.env.FIXED_DB || "audit_fixed" };
const IG_PERMS = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];
const CAPTION = "Visit us this weekend for fresh bread #local";

const results = [];
let failures = 0;

function record(db, name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  results.push({ db, name, ok, actual, expected });
  console.log(`${ok ? "PASS" : "FAIL"} [${db}] ${name} -> ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

async function client(db, role) {
  const c = new Client({ ...CONN, database: db });
  await c.connect();
  if (role) await c.query(`SET ROLE ${role}`);
  const { rows } = await c.query("SELECT pg_backend_pid() pid");
  c.pid = rows[0].pid;
  return c;
}

async function safe(fn) {
  try { return await fn(); } catch (e) { return `ERR:${e.message}`; }
}

const begin = (c, u, p, ch, v) => safe(async () => (await c.query(
  "SELECT result FROM public.publish_attempt_begin($1,$2,$3,$4)", [u, p, ch, v])).rows[0].result);
const beginFull = (c, u, p, ch, v) => safe(async () => (await c.query("SELECT * FROM public.publish_attempt_begin($1,$2,$3,$4)", [u, p, ch, v])).rows[0]);
const scalar = (c, sql, args) => safe(async () => (await c.query(sql, args)).rows[0].r);
const advance = (c, u, a, stage, cid = null) => scalar(c, "SELECT public.publish_attempt_advance($1,$2,$3,$4) r", [u, a, stage, cid]);
const finish = (c, u, a, outcome, obj = null, perm = null, code = null) =>
  scalar(c, "SELECT public.publish_attempt_finish($1,$2,$3,$4,$5,$6) r", [u, a, outcome, obj, perm, code]);
const verify = (c, u, a, verdict, obj = null, perm = null) =>
  scalar(c, "SELECT public.publish_attempt_record_verification($1,$2,$3,$4,$5) r", [u, a, verdict, obj, perm]);
const markStale = (c, a) => scalar(c, "SELECT public.publish_attempt_mark_stale($1, now() - interval '5 minutes') r", [a]);

async function row(admin, id) {
  const { rows } = await admin.query(
    `SELECT status, external_stage, error_code, retryable, verification_required, verification_attempts,
            meta_object_id, attempt_number, channel FROM public.publication_publish_attempts WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
const brief = r => r && `${r.status}/${r.external_stage}/${r.error_code ?? "-"}/retry=${r.retryable}/vreq=${r.verification_required}/v=${r.verification_attempts}`;
const countAttempts = async (admin, p, ch) =>
  Number((await admin.query("SELECT count(*) n FROM public.publication_publish_attempts WHERE publication_id=$1 AND channel=$2", [p, ch])).rows[0].n);

async function fixture(admin, { entitlement = "active" } = {}) {
  const u = crypto.randomUUID(), b = crypto.randomUUID(), p = crypto.randomUUID(), g = crypto.randomUUID();
  const path = `${u}/${b}/${p}/${crypto.randomUUID()}.jpg`;
  await admin.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [u, `${u}@audit.invalid`]);
  await admin.query("INSERT INTO public.businesses (id, user_id, name) VALUES ($1, $2, 'Audit Bakery')", [b, u]);
  await admin.query(
    `INSERT INTO public.publications (id, user_id, business_id, status, image_path, image_mime, image_bytes, image_width,
       image_height, image_uploaded_at, image_normalized, proposal_generation_id, proposals_lang, proposals_generated_at)
     VALUES ($1,$2,$3,'proposals_ready',$4,'image/jpeg',200000,1080,1080,now(),true,$5,'en',now())`, [p, u, b, path, g]);
  await admin.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('publication-images', $1)", [path]);
  await admin.query(
    `INSERT INTO public.publication_drafts (publication_id, user_id, business_id, source_generation_id, source_position,
       source_role, source_lang, source_body, source_cta, facebook_generated, facebook_text, instagram_generated, instagram_text, version, adapted_at)
     VALUES ($1,$2,$3,$4,1,'direct','en','Fresh bread','Visit us',$5,$5,$5,$5,3,now())`, [p, u, b, g, CAPTION]);
  await admin.query(
    `INSERT INTO public.meta_connections (user_id, business_id, status, instagram_status, page_id, instagram_account_id,
       granted_permissions, page_tasks, user_token_ref, token_expires_at, connected_at, publishing_consent_at)
     VALUES ($1,$2,'connected','connected','111222333','178414000000001',$3,ARRAY['CREATE_CONTENT'],'vault-ref-audit',now()+interval '30 days',now(),now())`,
    [u, b, IG_PERMS]);
  if (entitlement !== "none") {
    await admin.query(
      `INSERT INTO public.internal_test_entitlements (user_id, created_at, expires_at, revoked_at, note)
       VALUES ($1, now() - interval '2 hours', $2, $3, 'disposable audit')`,
      [u, entitlement === "expired" ? new Date(Date.now() - 60000) : new Date(Date.now() + 3600000),
       entitlement === "revoked" ? new Date() : null]);
  }
  return { u, b, p, g };
}

async function staleAttempt(admin, f, channel = "instagram", minutesAgo = 10) {
  const { rows } = await admin.query(
    `INSERT INTO public.publication_publish_attempts (publication_id, user_id, business_id, channel, draft_version,
       source_generation_id, attempt_number, started_at)
     VALUES ($1,$2,$3,$4,3,$5,
       (SELECT COALESCE(max(attempt_number),0)+1 FROM public.publication_publish_attempts WHERE publication_id=$1 AND channel=$4),
       now() - make_interval(mins => $6)) RETURNING id`,
    [f.p, f.u, f.b, channel, f.g, minutesAgo]);
  return rows[0].id;
}

async function toStage(svc, f, a, stage) {
  const order = ["container_requested", "container_created", "publish_requested"];
  for (const s of order.slice(0, order.indexOf(stage) + 1)) {
    const r = await advance(svc, f.u, a, s, s === "container_created" ? "17900000001" : null);
    if (r !== "ok") throw new Error(`advance ${s} -> ${r}`);
  }
}

async function waitsOnLock(admin, pid) {
  for (let i = 0; i < 40; i++) {
    const { rows } = await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid]);
    if (rows[0]?.wait_event_type === "Lock") return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const by = (kind, prefix, fixed) => (kind === "prefix" ? prefix : fixed);

async function staleVerification(kind, admin, svc) {
  const f = await fixture(admin);
  const a = await staleAttempt(admin, f);
  await toStage(svc, f, a, "publish_requested");
  record(kind, "S1.1 mark_stale on publish_requested attempt", await markStale(svc, a), true);
  record(kind, "S1.2 row after stale", brief(await row(admin, a)), "unknown/publish_requested/PUBLISH_OUTCOME_UNKNOWN/retry=false/vreq=true/v=0");
  record(kind, "S1.3 verification 'absent' at publish_requested", await verify(svc, f.u, a, "absent"), by(kind, "ok", "unsafe_absent"));
  record(kind, "S1.4 row after absent verdict", brief(await row(admin, a)),
    by(kind, "failed/publish_requested/META_TEMPORARY_ERROR/retry=true/vreq=false/v=1",
      "unknown/publish_requested/PUBLISH_OUTCOME_UNKNOWN/retry=false/vreq=true/v=0"));
  record(kind, "S1.5 retry begin after absent verdict", await begin(svc, f.u, f.p, "instagram", 3), by(kind, "OK", "PUBLISH_OUTCOME_UNKNOWN"));
  record(kind, "S1.6 instagram attempts for publication", await countAttempts(admin, f.p, "instagram"), by(kind, 2, 1));
  if (kind === "fixed") {
    record(kind, "S1.7 verification 'inconclusive' keeps unknown", await verify(svc, f.u, a, "inconclusive"), "ok");
    record(kind, "S1.8 row after inconclusive", brief(await row(admin, a)), "unknown/publish_requested/PUBLISH_OUTCOME_UNKNOWN/retry=false/vreq=true/v=1");
    record(kind, "S1.9 verification 'found'", await verify(svc, f.u, a, "found", "17895695668004550", "https://www.instagram.com/p/audit/"), "ok");
    record(kind, "S1.10 row after found", brief(await row(admin, a)), "succeeded/publish_requested/-/retry=false/vreq=false/v=2");
    record(kind, "S1.11 begin after success", await begin(svc, f.u, f.p, "instagram", 3), "ALREADY_PUBLISHED");
  }

  const f2 = await fixture(admin);
  const a2 = await staleAttempt(admin, f2);
  await toStage(svc, f2, a2, "container_created");
  await markStale(svc, a2);
  record(kind, "S1.12 'absent' before publish request (container_created) still allowed", await verify(svc, f2.u, a2, "absent"), "ok");
  record(kind, "S1.13 row after safe absent", brief(await row(admin, a2)), "failed/container_created/META_TEMPORARY_ERROR/retry=true/vreq=false/v=1");
  record(kind, "S1.14 retry begin after provably-unpublished failure", await begin(svc, f2.u, f2.p, "instagram", 3), "OK");
}

async function concurrency(kind, admin, svc) {
  // C1: publisher holds the row lock while advancing to publish_requested; a sweeper marks it stale concurrently.
  {
    const f = await fixture(admin);
    const a = await staleAttempt(admin, f);
    await toStage(svc, f, a, "container_created");
    const A = await client(DBS[kind], "service_role");
    const B = await client(DBS[kind], "service_role");
    await A.query("BEGIN");
    record(kind, "C1.1 session A advance publish_requested (uncommitted)", await advance(A, f.u, a, "publish_requested"), "ok");
    const pending = markStale(B, a);
    record(kind, "C1.2 session B mark_stale blocks on row lock", await waitsOnLock(admin, B.pid), true);
    await A.query("COMMIT");
    record(kind, "C1.3 session B mark_stale after A commits", await pending, true);
    record(kind, "C1.4 session B 'absent' verdict", await verify(B, f.u, a, "absent"), by(kind, "ok", "unsafe_absent"));
    record(kind, "C1.5 final row", (await row(admin, a)).status, by(kind, "failed", "unknown"));
    await A.end(); await B.end();
  }
  // C2: record_verification waits for a concurrent holder of the attempt row lock and then re-reads the committed stage.
  {
    const f = await fixture(admin);
    const a = await staleAttempt(admin, f);
    await toStage(svc, f, a, "publish_requested");
    await markStale(svc, a);
    const A = await client(DBS[kind]);
    const B = await client(DBS[kind], "service_role");
    await A.query("BEGIN");
    await A.query("SELECT 1 FROM public.publication_publish_attempts WHERE id=$1 FOR UPDATE", [a]);
    const pending = verify(B, f.u, a, "absent");
    record(kind, "C2.1 record_verification blocks behind row lock", await waitsOnLock(admin, B.pid), true);
    await A.query("COMMIT");
    record(kind, "C2.2 record_verification result after lock release", await pending, by(kind, "ok", "unsafe_absent"));
    await A.end(); await B.end();
  }
  // C3: finish('failed') racing the publisher's publish_requested transition.
  {
    const f = await fixture(admin);
    const r = await beginFull(svc, f.u, f.p, "instagram", 3);
    const a = r.attempt_id;
    await toStage(svc, f, a, "container_created");
    const A = await client(DBS[kind], "service_role");
    const B = await client(DBS[kind], "service_role");
    await A.query("BEGIN");
    await advance(A, f.u, a, "publish_requested");
    const pending = finish(B, f.u, a, "failed", null, null, "META_TEMPORARY_ERROR");
    record(kind, "C3.1 finish blocks behind publisher row lock", await waitsOnLock(admin, B.pid), true);
    await A.query("COMMIT");
    record(kind, "C3.2 finish('failed') after publish_requested committed", await pending, by(kind, "ok", "ok_unknown"));
    record(kind, "C3.3 final row", brief(await row(admin, a)),
      by(kind, "failed/publish_requested/META_TEMPORARY_ERROR/retry=true/vreq=false/v=0",
        "unknown/publish_requested/PUBLISH_OUTCOME_UNKNOWN/retry=false/vreq=true/v=0"));
    record(kind, "C3.4 retry begin", await begin(svc, f.u, f.p, "instagram", 3), by(kind, "OK", "PUBLISH_OUTCOME_UNKNOWN"));
    await A.end(); await B.end();
  }
  // C4: two sessions begin for the same publication; the second blocks on the publication lock.
  for (const ch of ["instagram", "facebook"]) {
    const f = await fixture(admin);
    const A = await client(DBS[kind], "service_role");
    const B = await client(DBS[kind], "service_role");
    await A.query("BEGIN");
    record(kind, `C4.1 ${ch} session A begin (uncommitted)`, await begin(A, f.u, f.p, ch, 3), "OK");
    const pending = begin(B, f.u, f.p, ch, 3);
    record(kind, `C4.2 ${ch} session B begin blocks`, await waitsOnLock(admin, B.pid), true);
    await A.query("COMMIT");
    record(kind, `C4.3 ${ch} session B result`, await pending, "PUBLISH_IN_PROGRESS");
    record(kind, `C4.4 ${ch} attempts created`, await countAttempts(admin, f.p, ch), 1);
    await A.end(); await B.end();
  }
  // C5: eight simultaneous autocommit begins.
  {
    const f = await fixture(admin);
    const sessions = await Promise.all(Array.from({ length: 8 }, () => client(DBS[kind], "service_role")));
    const outs = await Promise.all(sessions.map(s => begin(s, f.u, f.p, "instagram", 3)));
    record(kind, "C5.1 eight parallel instagram begins: OK count", outs.filter(o => o === "OK").length, 1);
    record(kind, "C5.2 others report in-progress", outs.filter(o => o === "PUBLISH_IN_PROGRESS").length, 7);
    record(kind, "C5.3 attempts created", await countAttempts(admin, f.p, "instagram"), 1);
    await Promise.all(sessions.map(s => s.end()));
  }
}

async function unknownAndRetry(kind, admin, svc) {
  const f = await fixture(admin);
  const { attempt_id: a } = await beginFull(svc, f.u, f.p, "instagram", 3);
  record(kind, "U1 begin while publishing", await begin(svc, f.u, f.p, "instagram", 3), "PUBLISH_IN_PROGRESS");
  await toStage(svc, f, a, "publish_requested");
  record(kind, "U2 finish('unknown')", await finish(svc, f.u, a, "unknown"), "ok");
  record(kind, "U3 row", brief(await row(admin, a)), "unknown/publish_requested/PUBLISH_OUTCOME_UNKNOWN/retry=false/vreq=true/v=0");
  record(kind, "U4 begin while unknown", await begin(svc, f.u, f.p, "instagram", 3), "PUBLISH_OUTCOME_UNKNOWN");
  record(kind, "U5 second finish on unknown", await finish(svc, f.u, a, "succeeded", "17895695668004551"), "invalid_transition");
  record(kind, "U6 advance on unknown", await advance(svc, f.u, a, "publish_requested"), "invalid_transition");
  record(kind, "U7 verification by another user", await verify(svc, crypto.randomUUID(), a, "found", "1"), "not_found");
  record(kind, "U8 invalid verdict", await verify(svc, f.u, a, "maybe"), "invalid_payload");

  const f2 = await fixture(admin);
  const { attempt_id: a2 } = await beginFull(svc, f2.u, f2.p, "instagram", 3);
  await toStage(svc, f2, a2, "container_created");
  record(kind, "U9 finish('failed') before publish request", await finish(svc, f2.u, a2, "failed", null, null, "META_TEMPORARY_ERROR"), "ok");
  record(kind, "U10 row", brief(await row(admin, a2)), "failed/container_created/META_TEMPORARY_ERROR/retry=true/vreq=false/v=0");
  record(kind, "U11 retry begin allowed", await begin(svc, f2.u, f2.p, "instagram", 3), "OK");

  const f3 = await fixture(admin);
  const { attempt_id: a3 } = await beginFull(svc, f3.u, f3.p, "instagram", 3);
  await toStage(svc, f3, a3, "publish_requested");
  record(kind, "U12 finish('failed', META_REJECTED) after publish request", await finish(svc, f3.u, a3, "failed", null, null, "META_REJECTED"), by(kind, "ok", "ok_unknown"));
  record(kind, "U13 retry begin", await begin(svc, f3.u, f3.p, "instagram", 3), by(kind, "OK", "PUBLISH_OUTCOME_UNKNOWN"));
  record(kind, "U14 begin for a non-existent publication", await begin(svc, f3.u, crypto.randomUUID(), "instagram", 3), "INVALID_PUBLICATION_STATE");
}

async function forbiddenTransitions(kind, admin, svc) {
  const upd = (id, set) => safe(async () => { await admin.query(`UPDATE public.publication_publish_attempts SET ${set} WHERE id = $1`, [id]); return "updated"; });
  const f = await fixture(admin);
  const { attempt_id: a } = await beginFull(svc, f.u, f.p, "instagram", 3);
  record(kind, "T1 advance skipping a stage", await advance(svc, f.u, a, "container_created", "1"), "invalid_transition");
  record(kind, "T2 container_created without numeric id", await advance(svc, f.u, a, "container_requested", "abc"), "invalid_payload");
  await toStage(svc, f, a, "publish_requested");
  record(kind, "T3 direct UPDATE publishing->failed at publish_requested", await upd(a, "status='failed', error_code='META_REJECTED', finished_at=now()"),
    by(kind, "updated", "ERR:publish_attempt_outcome_unprovable"));

  const f2 = await fixture(admin);
  const { attempt_id: a2 } = await beginFull(svc, f2.u, f2.p, "instagram", 3);
  await toStage(svc, f2, a2, "publish_requested");
  await finish(svc, f2.u, a2, "unknown");
  record(kind, "T4 direct UPDATE unknown->failed with verification bump", await upd(a2, "status='failed', error_code='META_TEMPORARY_ERROR', retryable=true, verification_required=false, verification_attempts=verification_attempts+1, last_verified_at=now()"),
    by(kind, "updated", "ERR:publish_attempt_outcome_unprovable"));
  const f2b = await fixture(admin);
  const { attempt_id: a2b } = await beginFull(svc, f2b.u, f2b.p, "instagram", 3);
  await toStage(svc, f2b, a2b, "publish_requested");
  await finish(svc, f2b.u, a2b, "unknown");
  record(kind, "T5 stage backwards", await upd(a2b, "external_stage='container_created'"), "ERR:publish_attempt_stage_backwards");
  record(kind, "T6 identity change", await upd(a2b, "draft_version=2"), "ERR:publish_attempt_identity_immutable");
  record(kind, "T7 container id change", await upd(a2b, "meta_container_id='999'"), "ERR:publish_attempt_container_immutable");
  record(kind, "T8 unknown->succeeded without verification", await upd(a2b, "status='succeeded', meta_object_id='1'"), "ERR:publish_attempt_unknown_requires_verification");

  const f3 = await fixture(admin);
  const a3 = await staleAttempt(admin, f3);
  await toStage(svc, f3, a3, "container_requested");
  await markStale(svc, a3);
  record(kind, "T9 advance after stale", await advance(svc, f3.u, a3, "container_created", "17900000002"), "invalid_transition");
  record(kind, "T10 direct stage change after stale", await upd(a3, "external_stage='container_created', meta_container_id='17900000002'"), "ERR:publish_attempt_stage_frozen");

  const f4 = await fixture(admin);
  const { attempt_id: a4 } = await beginFull(svc, f4.u, f4.p, "facebook", 3);
  await finish(svc, f4.u, a4, "succeeded", "111222333_444");
  record(kind, "T11 succeeded->failed", await upd(a4, "status='failed'"), "ERR:publish_attempt_invalid_transition");
  record(kind, "T12 advance on facebook attempt", await advance(svc, f4.u, a4, "container_requested"), "invalid_channel");
  record(kind, "T13 insert attempt not in publishing", await safe(async () => {
    await admin.query(`INSERT INTO public.publication_publish_attempts (publication_id,user_id,business_id,channel,draft_version,source_generation_id,attempt_number,status)
      VALUES ($1,$2,$3,'instagram',3,$4,9,'failed')`, [f4.p, f4.u, f4.b, f4.g]); return "inserted"; }), "ERR:publish_attempt_must_start_publishing");
}

async function entitlement(kind, admin, svc) {
  for (const state of ["none", "expired", "revoked"]) {
    const f = await fixture(admin, { entitlement: state });
    record(kind, `E1 instagram begin with entitlement=${state}`, await begin(svc, f.u, f.p, "instagram", 3), by(kind, "OK", "PERMISSION_REQUIRED"));
    record(kind, `E2 instagram attempts with entitlement=${state}`, await countAttempts(admin, f.p, "instagram"), by(kind, 1, 0));
    record(kind, `E3 facebook begin with entitlement=${state}`, await begin(svc, f.u, f.p, "facebook", 3), "OK");
  }
  const f = await fixture(admin);
  record(kind, "E4 instagram begin wrong version", await begin(svc, f.u, f.p, "instagram", 2), "VERSION_CONFLICT");
  record(kind, "E5 instagram begin by non-owner", await begin(svc, crypto.randomUUID(), f.p, "instagram", 3), "INVALID_PUBLICATION_STATE");
  const r = await beginFull(svc, f.u, f.p, "instagram", 3);
  record(kind, "E6 entitled instagram begin returns pinned caption and account",
    [r.result, r.draft_version, r.caption, r.instagram_account_id, r.page_id], ["OK", 3, CAPTION, "178414000000001", "111222333"]);
}

async function facebookSequence(kind, admin, svc) {
  const trace = [];
  const t = async (label, v) => { trace.push(`${label}=${typeof v === "object" ? JSON.stringify(v) : v}`); };
  const f = await fixture(admin);
  const r1 = await beginFull(svc, f.u, f.p, "facebook", 3);
  await t("begin1", [r1.result, r1.draft_version, r1.caption, r1.page_id, r1.instagram_account_id]);
  await t("finish_bad_code", await finish(svc, f.u, r1.attempt_id, "failed", null, null, "NOPE"));
  await t("finish_success_no_id", await finish(svc, f.u, r1.attempt_id, "succeeded"));
  await t("finish_success", await finish(svc, f.u, r1.attempt_id, "succeeded", "111222333_444", "https://facebook.com/111222333_444"));
  await t("row1", brief(await row(admin, r1.attempt_id)));
  await t("begin_again", await begin(svc, f.u, f.p, "facebook", 3));

  const g = await fixture(admin);
  const a = (await beginFull(svc, g.u, g.p, "facebook", 3)).attempt_id;
  await t("fail_temp", await finish(svc, g.u, a, "failed", null, null, "META_TEMPORARY_ERROR"));
  await t("row_fail_temp", brief(await row(admin, a)));
  const b2 = await beginFull(svc, g.u, g.p, "facebook", 3);
  await t("retry_after_temp", [b2.result]);
  await t("fail_rejected", await finish(svc, g.u, b2.attempt_id, "failed", null, null, "META_REJECTED"));
  await t("row_fail_rejected", brief(await row(admin, b2.attempt_id)));
  const b3 = await beginFull(svc, g.u, g.p, "facebook", 3);
  await t("retry_after_rejected", [b3.result]);
  await t("finish_unknown", await finish(svc, g.u, b3.attempt_id, "unknown"));
  await t("begin_while_unknown", await begin(svc, g.u, g.p, "facebook", 3));
  await t("verify_inconclusive", await verify(svc, g.u, b3.attempt_id, "inconclusive"));
  await t("verify_absent", await verify(svc, g.u, b3.attempt_id, "absent"));
  await t("row_after_absent", brief(await row(admin, b3.attempt_id)));
  const b4 = await beginFull(svc, g.u, g.p, "facebook", 3);
  await t("retry_after_absent", [b4.result]);
  await t("finish_unknown2", await finish(svc, g.u, b4.attempt_id, "unknown"));
  await t("verify_found", await verify(svc, g.u, b4.attempt_id, "found", "111222333_555"));
  await t("row_after_found", brief(await row(admin, b4.attempt_id)));
  await t("verify_again", await verify(svc, g.u, b4.attempt_id, "found", "111222333_555"));
  await t("attempt_numbers", (await admin.query("SELECT array_agg(attempt_number ORDER BY attempt_number) r FROM public.publication_publish_attempts WHERE publication_id=$1", [g.p])).rows[0].r);

  const h = await fixture(admin);
  const s = await staleAttempt(admin, h, "facebook");
  await t("fb_mark_stale", await markStale(svc, s));
  await t("fb_stale_absent", await verify(svc, h.u, s, "absent"));
  await t("fb_stale_row", brief(await row(admin, s)));
  await t("fb_finish_after_verify", await finish(svc, h.u, s, "succeeded", "1_2"));
  return trace;
}

async function privileges(admin) {
  const fns = ["publish_attempt_begin", "publish_attempt_finish", "publish_attempt_record_verification", "publish_attempt_advance",
    "publish_attempt_mark_stale", "publish_attempts_guard", "publication_publish_gate", "publication_publish_preflight",
    "internal_test_entitlement_active", "meta_publish_channel_issue"];
  const { rows } = await admin.query(
    `SELECT p.proname, p.prosecdef, p.proconfig, p.proowner::regrole::text AS owner,
            has_function_privilege('anon', p.oid, 'EXECUTE') anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') authd,
            has_function_privilege('service_role', p.oid, 'EXECUTE') svc,
            pg_get_function_identity_arguments(p.oid) args
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY($1) ORDER BY p.proname`, [fns]);
  const tbl = await admin.query(
    `SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) privs FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='publication_publish_attempts' AND grantee IN ('anon','authenticated','service_role')
     GROUP BY grantee ORDER BY grantee`);
  const pol = await admin.query(
    `SELECT tablename, policyname, cmd, roles::text, qual, with_check FROM pg_policies
     WHERE schemaname IN ('public','storage') ORDER BY tablename, policyname`);
  const rls = await admin.query(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
  const allFns = await admin.query(
    `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f,
            md5(regexp_replace(p.prosrc, '\\s', '', 'g')) h, coalesce(p.proacl::text, '') acl
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1`);
  return { fns: rows, table: tbl.rows, policies: pol.rows, rls: rls.rows, allFns: allFns.rows };
}

async function apiRoleCalls(kind) {
  for (const role of ["anon", "authenticated"]) {
    const c = await client(DBS[kind], role);
    for (const [fn, sql] of [
      ["begin", "SELECT * FROM public.publish_attempt_begin(gen_random_uuid(), gen_random_uuid(), 'instagram', 3)"],
      ["finish", "SELECT public.publish_attempt_finish(gen_random_uuid(), gen_random_uuid(), 'failed', NULL, NULL, 'META_REJECTED')"],
      ["record_verification", "SELECT public.publish_attempt_record_verification(gen_random_uuid(), gen_random_uuid(), 'absent', NULL, NULL)"],
      ["entitlement", "SELECT public.internal_test_entitlement_active(gen_random_uuid())"],
    ]) {
      const out = await safe(async () => { await c.query(sql); return "executed"; });
      record(kind, `P1 ${role} calls ${fn}`, out.startsWith("ERR:permission denied") ? "permission denied" : out, "permission denied");
    }
    await c.end();
  }
}

(async () => {
  const traces = {}, privs = {};
  for (const kind of ["prefix", "fixed"]) {
    console.log(`\n===== ${kind.toUpperCase()} database: ${DBS[kind]} =====`);
    const admin = await client(DBS[kind]);
    const svc = await client(DBS[kind], "service_role");
    privs[kind] = await privileges(admin);
    await staleVerification(kind, admin, svc);
    await concurrency(kind, admin, svc);
    await unknownAndRetry(kind, admin, svc);
    await forbiddenTransitions(kind, admin, svc);
    await entitlement(kind, admin, svc);
    traces[kind] = await facebookSequence(kind, admin, svc);
    await apiRoleCalls(kind);
    await svc.end(); await admin.end();
  }

  console.log("\n===== FACEBOOK PARITY (identical call sequence on both databases) =====");
  traces.fixed.forEach((line, i) => console.log(`  ${line === traces.prefix[i] ? "=" : "!"} ${line}`));
  record("both", "F1 facebook RPC trace identical before/after", traces.fixed, traces.prefix);

  console.log("\n===== PRIVILEGES / POLICIES / RLS =====");
  for (const r of privs.fixed.fns) console.log(`  ${r.proname}(${r.args}) secdef=${r.prosecdef} config=${JSON.stringify(r.proconfig)} anon=${r.anon} auth=${r.authd} service=${r.svc}`);
  record("both", "G1 function security attributes and EXECUTE privileges unchanged", privs.fixed.fns, privs.prefix.fns);
  record("both", "G2 publication_publish_attempts table grants unchanged", privs.fixed.table, privs.prefix.table);
  record("both", `G3 all ${privs.fixed.policies.length} RLS policies (public+storage) unchanged`, privs.fixed.policies, privs.prefix.policies);
  record("both", "G4 RLS enablement on every public table unchanged", privs.fixed.rls, privs.prefix.rls);
  const before = new Map(privs.prefix.allFns.map(r => [r.f, r]));
  const changed = privs.fixed.allFns.filter(r => !before.has(r.f) || before.get(r.f).h !== r.h || before.get(r.f).acl !== r.acl).map(r => r.f.split("(")[0]);
  record("both", `G5 only the four intended functions differ (of ${privs.fixed.allFns.length})`, changed.sort(),
    ["publish_attempt_begin", "publish_attempt_finish", "publish_attempt_record_verification", "publish_attempts_guard"]);
  record("both", "G6 no function added or removed", privs.fixed.allFns.length, privs.prefix.allFns.length);

  const passed = results.filter(r => r.ok).length;
  console.log(`\nSUMMARY: ${passed}/${results.length} checks matched expectations, ${failures} mismatches`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
