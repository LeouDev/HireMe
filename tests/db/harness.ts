// Runs the real migrations in an in-process Postgres (PGlite) with a minimal Supabase shim:
// roles anon/authenticated/service_role, auth.users + auth.uid(), storage.buckets/objects,
// and Supabase's permissive default privileges (so the tests prove our explicit revokes work).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  _parts := string_to_array(name, '/');
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type Actor = string | 'anon' | 'service';

export interface TestDb {
  db: PGlite;
  /** Run statements as a user (uuid), anon or the service role, inside a rolled-back-on-error transaction. */
  as<T>(actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Shorthand: run one query as an actor and return rows. */
  q<T = Record<string, unknown>>(actor: Actor, sql: string, params?: unknown[]): Promise<T[]>;
  createUser(email: string, fullName: string): Promise<string>;
  makeAdmin(userId: string): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SHIM);
  const dir = join(import.meta.dirname, '../../supabase/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }

  const as: TestDb['as'] = (actor, fn) =>
    db.transaction(async (tx) => {
      if (actor === 'service') {
        await tx.exec('set local role service_role');
      } else if (actor === 'anon') {
        await tx.exec('set local role anon');
      } else {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: actor, role: 'authenticated' })]);
        await tx.exec('set local role authenticated');
      }
      return fn(tx);
    });

  return {
    db,
    as,
    q: (actor, sql, params) => as(actor, async (tx) => (await tx.query(sql, params)).rows as never),
    async createUser(email, fullName) {
      const { rows } = await db.query<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
        [email, fullName],
      );
      return rows[0]!.id;
    },
    async makeAdmin(userId) {
      await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [userId]);
    },
  };
}

/** Expect a query to fail; returns the error message. */
export async function expectFail(p: Promise<unknown>, match?: RegExp): Promise<string> {
  try {
    await p;
  } catch (error) {
    const message = (error as Error).message;
    if (match && !match.test(message)) {
      throw new Error(`Expected error matching ${match}, got: ${message}`, { cause: error });
    }
    return message;
  }
  throw new Error(`Expected failure${match ? ` matching ${match}` : ''}, but the query succeeded`);
}
