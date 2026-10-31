const {Client}=require("pg");
(async()=>{const c=new Client({host:"localhost",port:55432,user:"postgres",database:process.argv[2]||"audit"});await c.connect();
const names=['publish_attempt_begin','publish_attempt_finish','publish_attempt_record_verification','publish_attempt_mark_stale','publish_attempt_advance','publish_attempts_guard','internal_test_entitlement_active','publication_publish_gate','publication_publish_preflight'];
const r=await c.query("select p.proname, md5(p.prosrc) raw, md5(regexp_replace(p.prosrc, '\\s+', '', 'g')) nows, array_to_string(p.proacl::text[],' ') acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1) order by 1",[names]);
for(const x of r.rows)console.log(x.proname,x.raw,x.nows,x.acl);await c.end()})();
