// Generates the FIX01 rollback SQL from the pre-fix replay database (exact prior definitions and grants).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const SIGS = [
  "public.publish_attempt_record_verification(uuid, uuid, text, text, text)",
  "public.publish_attempt_finish(uuid, uuid, text, text, text, text)",
  "public.publish_attempt_begin(uuid, uuid, text, integer)",
  "public.publish_attempts_guard()",
];
const out = path.join(process.env.PROJECT_ROOT, "auditoria-a2/gate-b4-fix01-verification/rollback/ROLLBACK_a3743_gateb4_fix01_publish_safety.sql");

(async () => {
  const c = new Client({ host: "localhost", port: 55432, user: "postgres", database: process.argv[2] || "audit" });
  await c.connect();
  const parts = [`/*
# ROLLBACK for A3.7.4.3 Gate B.4 FIX01 (PREPARED, NOT APPLIED; emergency use only, separate authorization required)

Restores the four functions replaced by 20261031190000_a3743_gateb4_fix01_publish_safety.sql to their exact
pre-FIX01 definitions, generated with pg_get_functiondef from a faithful replay of all applied migrations
(whitespace-free md5 equal to production before FIX01). No tables, columns, data, policies or grants change.

WARNING: rolling back re-opens the stale-verification, failed-after-publish-request and missing-entitlement
findings. Instagram publishing must stay disarmed (no META_INSTAGRAM_* secrets) for as long as this is in effect.
*/
`];
  for (const sig of SIGS) {
    const { rows } = await c.query("SELECT pg_get_functiondef($1::regprocedure) d", [sig]);
    parts.push(`${rows[0].d.trimEnd()};\n`);
  }
  parts.push(`REVOKE ALL ON FUNCTION public.publish_attempts_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_attempt_begin(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_finish(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_record_verification(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_attempt_begin(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_finish(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_record_verification(uuid, uuid, text, text, text) TO service_role;
`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, parts.join("\n"));
  console.log(`wrote ${out}`);
  await c.end();
})();
