// 비밀번호를 직접 정합니다 (메일 발송(Resend)을 아직 연결하지 않았을 때 첫 슈퍼어드민용).
//   npm run set-password -- kykim@creverse.com --prod   (운영)
//   npm run set-password -- kykim@creverse.com          (로컬 PGlite)
// .env.local의 Supabase 값을 쓰고, 없으면 로컬 개발 DB(.pglite)에 씁니다. 비밀번호는 화면에 입력합니다(기록 안 남음).
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import bcrypt from 'bcryptjs';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('사용법: npm run set-password -- you@creverse.com');
  process.exit(1);
}

// .env.local 읽기 (dotenv 없이)
const envFile = path.resolve('.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a))));
}

const pw = await ask(`${email}의 새 비밀번호 (8자 이상): `);
if (pw.length < 8) {
  console.error('8자 이상이어야 합니다.');
  process.exit(1);
}
const hash = await bcrypt.hash(pw, 10);
const p = { email, password_hash: hash };

let result;
// --prod: 운영 Supabase에 씁니다 (.env.local에 DB_MODE=local이 있어도)
const prod = process.argv.includes('--prod');
if (process.env.NEXT_PUBLIC_SUPABASE_URL && (prod || process.env.DB_MODE !== 'local')) {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('stat_user_update', { p });
  if (error) throw error;
  result = data;
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = path.resolve('.pglite');
  const fresh = !fs.existsSync(dir);
  const db = new PGlite(dir);
  if (fresh) {
    const mig = path.resolve('..', 'supabase', 'migrations');
    for (const f of fs.readdirSync(mig).filter((n) => n.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(mig, f), 'utf8'));
  }
  const { rows } = await db.query('select stat_user_update($1::jsonb) as r', [JSON.stringify(p)]);
  result = rows[0].r;
  await db.close();
}
console.log(result?.ok ? `${email} 비밀번호를 정했습니다.` : `${email} 계정이 없습니다.`);
