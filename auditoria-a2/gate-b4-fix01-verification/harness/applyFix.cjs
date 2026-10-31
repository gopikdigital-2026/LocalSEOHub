const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const db = process.argv[2];
const file = path.resolve(process.env.PROJECT_ROOT, process.argv[3] || "auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql");

(async () => {
  const sql = fs.readFileSync(file, "utf8");
  const c = new Client({ host: "localhost", port: 55432, user: "postgres", database: db });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query(sql);
    await c.query("COMMIT");
    console.log(`applied ${path.basename(file)} to ${db} in one transaction`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`FAILED: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
