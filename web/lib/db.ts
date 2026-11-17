import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Every read and write goes through one of the stat_* SQL functions in
 * supabase/migrations, each taking a single jsonb argument and returning
 * jsonb. That keeps the query logic in one SQL file that runs the same on
 * Supabase (production) and on PGlite, an in-process Postgres used for local
 * development when no Supabase project is configured.
 *
 * Server only: the service role key never reaches the browser.
 */

const FN = /^stat_[a-z_]+$/;

type Local = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const g = globalThis as unknown as { __statLocalDb?: Promise<Local>; __statSupabase?: SupabaseClient };

/** Production never falls back to the local DB: a missing env var should fail loudly, not serve an empty database. */
export const isLocalDb = () =>
  process.env.NODE_ENV !== 'production' && (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.DB_MODE === 'local');

function supabase() {
  if (!g.__statSupabase) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('서버 설정 오류: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수가 없습니다.');
    }
    g.__statSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return g.__statSupabase;
}

async function localDb(): Promise<Local> {
  if (!g.__statLocalDb) {
    g.__statLocalDb = (async () => {
      const path = await import('path');
      const fs = await import('fs');
      // A variable module name keeps the bundler from pulling PGlite into production builds.
      const mod = '@electric-sql/pglite';
      const { PGlite } = await import(/* webpackIgnore: true */ mod);
      const dir = path.resolve(process.cwd(), '.pglite');
      const fresh = !fs.existsSync(dir);
      const db = new PGlite(dir);
      await db.waitReady;
      if (fresh) {
        const migDir = path.resolve(process.cwd(), '..', 'supabase', 'migrations');
        for (const f of fs.readdirSync(migDir).filter((n: string) => n.endsWith('.sql')).sort()) {
          await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
        }
      }
      return db as Local;
    })();
  }
  return g.__statLocalDb;
}

export async function rpc<T = unknown>(fn: string, p: Record<string, unknown> = {}): Promise<T> {
  if (!FN.test(fn)) throw new Error(`bad function ${fn}`);
  if (isLocalDb()) {
    const db = await localDb();
    const { rows } = await db.query(`select ${fn}($1::jsonb) as r`, [JSON.stringify(p)]);
    return (rows[0]?.r ?? null) as T;
  }
  const { data, error } = await supabase().rpc(fn, { p });
  if (error) throw new Error(error.message);
  return data as T;
}
