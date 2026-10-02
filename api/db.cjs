const { Pool } = require('pg');
module.exports = function makePool() {
  if (!process.env.POSTGRES_PASSWORD) throw new Error('POSTGRES_PASSWORD is required');
  return new Pool({host: process.env.DB_HOST || 'database', port: Number(process.env.DB_PORT || 5432), database: 'app', user: 'app', password: process.env.POSTGRES_PASSWORD, max: 8, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, statement_timeout: 5000});
};
