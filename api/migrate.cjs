const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pool = require('./db.cjs')();
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(730210)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const name of fs.readdirSync(path.join(__dirname, 'migrations')).filter(n => n.endsWith('.sql')).sort()) {
      const sql = fs.readFileSync(path.join(__dirname, 'migrations', name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (existing.rowCount) { if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration changed: ' + name); continue; }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      console.log('Applied ' + name);
    }
    await client.query('COMMIT');
    console.log('Migrations up to date');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); await pool.end(); }
})().catch(() => { console.error('Migration failed; check database configuration and migration checksums.'); process.exitCode = 1; });
