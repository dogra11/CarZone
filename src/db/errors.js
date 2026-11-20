/**
 * db/errors.js - Turns low-level MySQL / network / TLS error codes into a plain-English
 * hint. Used by start-up (db/init.js) and by `npm run db:setup`, so a beginner sees
 * "check DB_PASSWORD" instead of only "ER_ACCESS_DENIED_ERROR".
 */
import { config } from '../config/index.js';

export function dbErrorHint(err, db = config.db) {
  const code = err?.code || '';
  const msg = String(err?.message || '');
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(db.host);

  if (/insecure transport|secure transport|require.*(ssl|tls)|SSL connection is required/i.test(msg) || code === 'ER_SECURE_TRANSPORT_REQUIRED') {
    return 'The database only accepts encrypted connections. Set DB_SSL=true (TiDB Cloud always needs it).';
  }
  if (/certificate|self[- ]signed|unable to verify|CERT_|TLS|SSL|HANDSHAKE/i.test(code + ' ' + msg)) {
    return 'TLS/SSL handshake failed. Check DB_SSL=true, the host name (it must match the certificate), and DB_SSL_CA if you set one.';
  }
  switch (code) {
    case 'ER_BAD_DB_ERROR':
      return `Database "${db.name}" not found - run database/carzone_db.sql (MySQL Workbench / TiDB SQL Editor) or npm run db:setup.`;
    case 'ER_NO_SUCH_TABLE':
      return 'Tables are missing - run database/carzone_db.sql (or npm run db:setup).';
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'The database rejected the user/password - check DB_USER and DB_PASSWORD (TiDB user names look like "xxxxxxxx.root").';
    case 'ECONNREFUSED':
      return isLocalHost && config.isProduction
        ? 'DB_HOST is still "localhost". On a cloud server set DB_HOST to your TiDB/MySQL host name.'
        : `Cannot reach the database at ${db.host}:${db.port} - is MySQL running, and is DB_PORT right (MySQL 3306, TiDB 4000)?`;
    case 'ETIMEDOUT':
    case 'ECONNRESET':
    case 'PROTOCOL_CONNECTION_LOST':
      return `Connection to ${db.host}:${db.port} timed out or was dropped - check DB_HOST, DB_PORT (TiDB uses 4000), DB_SSL=true and the TiDB firewall (Networking) rules.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Host name "${db.host}" was not found - copy DB_HOST exactly from the provider's Connect dialog.`;
    default:
      return '';
  }
}
