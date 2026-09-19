// Shared, additive schema for local SQLite and remote libSQL.
export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, origins TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, repo TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, client_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, release TEXT NOT NULL, browser TEXT NOT NULL, viewport_width INTEGER NOT NULL, viewport_height INTEGER NOT NULL, duration INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', error_count INTEGER NOT NULL, event_count INTEGER NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, github_url TEXT, UNIQUE(project_id,client_id));
    CREATE TABLE IF NOT EXISTS events (session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, position INTEGER NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id,position));
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS shares (token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS source_maps (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, asset TEXT NOT NULL, release TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(project_id,asset,release));
    CREATE TABLE IF NOT EXISTS limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_project_date ON sessions(project_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_fingerprint ON sessions(project_id,fingerprint);
    CREATE INDEX IF NOT EXISTS auth_expiry ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id);`;
