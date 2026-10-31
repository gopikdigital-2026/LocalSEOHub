// Builds a fresh disposable database: bootstrap stand-ins + all 60 repository migrations, each in its own transaction.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = process.env.PROJECT_ROOT;
const DB = process.argv[2] || 'audit';
const conn = { host: 'localhost', port: 55432, user: 'postgres' };

(async () => {
  const admin = new Client({ ...conn, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const c = new Client({ ...conn, database: DB });
  await c.connect();
  await c.query(fs.readFileSync(path.join(__dirname, 'bootstrap.sql'), 'utf8'));
  const dir = path.join(ROOT, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let ok = 0;
  const seen = new Map();
  const body = (s) => s.split('\n').filter((l) => !/^\s*(--|\/\*|\*)/.test(l) && l.trim()).join('\n');
  for (const f of files) {
    const b = body(fs.readFileSync(path.join(dir, f), 'utf8'));
    // Production applied the two identical 2026-06-23 files once (schema_migrations row "silent_coast").
    if (seen.has(b)) { console.log(`skip ${f}: SQL identical to ${seen.get(b)}`); ok++; continue; }
    seen.set(b, f);
    try {
      await c.query('BEGIN');
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('COMMIT');
      ok++;
    } catch (e) {
      await c.query('ROLLBACK');
      console.log(`FAIL ${f}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`replayed ${ok}/${files.length} migrations into ${DB}`);
  await c.end();
})();
