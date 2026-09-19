import type { Capture, CaptureEvent, Project, StoredSession, User } from './types.ts';
export type SqlValue = string | number | bigint | null | Uint8Array;
type Maybe<T> = T | Promise<T>;
export interface Persistence {
  db: { prepare(sql: string): {
    get(...args: SqlValue[]): Maybe<Record<string, unknown> | undefined>;
    all(...args: SqlValue[]): Maybe<Record<string, unknown>[]>;
    run(...args: SqlValue[]): Maybe<unknown>;
  } };
  close(): void;
  userForToken(token: string): Maybe<User | undefined>;
  ownerProject(id: string, user: string): Maybe<Project>;
  ownerSession(id: string, user: string): Maybe<StoredSession>;
  saveCapture(project: string, capture: Capture): Maybe<{ id: string; duplicate: boolean }>;
  events(id: string): Maybe<CaptureEvent[]>;
  rateLimit(bucket: string, max: number, windowMs?: number): Maybe<void>;
  purge(days: number): Maybe<void>;
}
export interface SqlStatement { sql: string; args: SqlValue[] }
export interface SqlResult { rows: Record<string, unknown>[]; rowsAffected: number }
export interface SqlExecutor {
  execute(statement: SqlStatement): Promise<SqlResult>;
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}
export interface SqlTransaction extends SqlExecutor {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): void;
}
export interface SqlClient extends SqlExecutor {
  transaction(mode: 'write'): Promise<SqlTransaction>;
  executeMultiple(sql: string): Promise<void>;
  close(): void;
}
