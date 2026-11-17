-- Creverse Learning Stats — 초기 스키마
-- Supabase SQL Editor에서 그대로 실행합니다. (로컬 개발 DB(PGlite)도 같은 파일을 씁니다)
-- 모든 테이블은 stat_ 접두사: 같은 Supabase 프로젝트에 다른 사내 서비스가 함께 있어도 겹치지 않습니다.
-- 클라이언트는 DB에 직접 붙지 않고, web의 API가 service role 키로 아래 함수(RPC)만 호출합니다.

-- ---------------------------------------------------------------------------
-- 계정
-- ---------------------------------------------------------------------------
create table if not exists stat_users (
  email text primary key,
  name text not null default '',
  team text not null default '',
  password_hash text,
  role text not null default 'member' check (role in ('super_admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'disabled')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  last_login_at timestamptz,
  reset_token_hash text,
  reset_token_expires timestamptz
);

-- 최초 슈퍼어드민. 비밀번호는 "비밀번호 찾기" 메일 또는 scripts/set-password.mjs로 정합니다.
insert into stat_users (email, name, role, status, approved_at, approved_by) values
  ('kykim@creverse.com', '김기연', 'super_admin', 'active', now(), 'system'),
  ('jy_cha@creverse.com', '', 'super_admin', 'active', now(), 'system')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 데이터
-- ---------------------------------------------------------------------------
-- 한 번 올린 원본 파일(또는 시트 묶음) = 데이터셋 하나
create table if not exists stat_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  metric text not null check (metric in ('enroll', 'complete')),
  source_file text not null default '',
  source_sheets text[] not null default '{}',
  mapping jsonb not null default '{}',
  row_count integer not null default 0,
  status text not null default 'loading' check (status in ('loading', 'ready')),
  note text not null default '',
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table stat_datasets add column if not exists dims jsonb not null default '{}';

-- 정규화된 집계 행. enroll: denom=현원생(재원생), numer=수강생(학습대상자)
--                   complete: denom=학습해야 할 건수, numer=학습 완료 건수
create table if not exists stat_facts (
  id bigint generated always as identity primary key,
  dataset_id uuid not null references stat_datasets(id) on delete cascade,
  brand text not null,
  metric text not null,
  year integer,
  term text,
  semester text,
  sem_order integer,
  week integer,
  week_start date,
  branch_type text,
  branch text,
  alpha text,
  program text,
  level text,
  level_group text,
  grade text,
  class_name text,
  content text,
  component text,
  denom numeric not null default 0,
  numer numeric not null default 0
);
create index if not exists stat_facts_metric_brand on stat_facts (metric, brand);
create index if not exists stat_facts_dataset on stat_facts (dataset_id);
create index if not exists stat_facts_period on stat_facts (metric, sem_order, week);

-- 학원 마스터: 직/가맹, 알파 여부, 예전 이름(별칭)
create table if not exists stat_branches (
  brand text not null,
  name text not null,
  branch_type text,
  alpha text,
  aliases text[] not null default '{}',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (brand, name)
);

-- 저장한 보고서(피벗 설정)
create table if not exists stat_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  config jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table stat_users enable row level security;
alter table stat_datasets enable row level security;
alter table stat_facts enable row level security;
alter table stat_branches enable row level security;
alter table stat_reports enable row level security;

-- ---------------------------------------------------------------------------
-- 계정 함수
-- ---------------------------------------------------------------------------
create or replace function stat_user_get(p jsonb) returns jsonb language sql stable as $$
  select to_jsonb(u) from stat_users u where u.email = lower(p->>'email');
$$;

create or replace function stat_user_list(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', email, 'name', name, 'team', team, 'role', role, 'status', status,
    'created_at', created_at, 'approved_at', approved_at, 'approved_by', approved_by,
    'last_login_at', last_login_at, 'has_password', password_hash is not null
  ) order by (status = 'pending') desc, role, created_at), '[]'::jsonb)
  from stat_users;
$$;

create or replace function stat_user_signup(p jsonb) returns jsonb language plpgsql as $$
declare
  existing stat_users;
begin
  select * into existing from stat_users where email = lower(p->>'email');
  if found then
    -- 거절된 사람은 다시 신청할 수 있습니다.
    if existing.status = 'rejected' then
      update stat_users set name = p->>'name', team = coalesce(p->>'team', ''), password_hash = p->>'password_hash',
        status = 'pending', created_at = now(), approved_at = null, approved_by = null
      where email = existing.email;
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'exists', 'status', existing.status);
  end if;
  insert into stat_users (email, name, team, password_hash, role, status)
  values (lower(p->>'email'), coalesce(p->>'name', ''), coalesce(p->>'team', ''), p->>'password_hash', 'member', 'pending');
  return jsonb_build_object('ok', true);
end $$;

-- 넘어온 키만 바꿉니다.
create or replace function stat_user_update(p jsonb) returns jsonb language plpgsql as $$
declare
  e text := lower(p->>'email');
begin
  update stat_users set
    name = case when p ? 'name' then p->>'name' else name end,
    team = case when p ? 'team' then p->>'team' else team end,
    role = case when p ? 'role' then p->>'role' else role end,
    status = case when p ? 'status' then p->>'status' else status end,
    password_hash = case when p ? 'password_hash' then p->>'password_hash' else password_hash end,
    approved_at = case when p ? 'approved_by' then now() else approved_at end,
    approved_by = case when p ? 'approved_by' then p->>'approved_by' else approved_by end,
    last_login_at = case when p ? 'touch_login' then now() else last_login_at end,
    reset_token_hash = case when p ? 'reset_token_hash' then p->>'reset_token_hash' else reset_token_hash end,
    reset_token_expires = case when p ? 'reset_token_expires' then (p->>'reset_token_expires')::timestamptz else reset_token_expires end
  where email = e;
  return jsonb_build_object('ok', found);
end $$;

create or replace function stat_user_delete(p jsonb) returns jsonb language plpgsql as $$
begin
  delete from stat_users where email = lower(p->>'email');
  return jsonb_build_object('ok', found);
end $$;

create or replace function stat_super_admin_emails(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(email), '[]'::jsonb) from stat_users where role = 'super_admin' and status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- 차원(dimension) — 피벗에서 행/열/필터로 쓸 수 있는 것들
-- ---------------------------------------------------------------------------
create or replace function stat_dim_expr(d text) returns text language plpgsql immutable as $$
begin
  return case d
    when 'brand' then 'f.brand'
    when 'semester' then 'f.semester'
    when 'year' then 'f.year::text'
    when 'term' then 'f.term'
    when 'week' then 'f.week::text'
    when 'month' then 'to_char(f.week_start, ''YYYY-MM'')'
    when 'branch_type' then 'f.branch_type'
    when 'branch' then 'f.branch'
    when 'alpha' then 'f.alpha'
    when 'program' then 'f.program'
    when 'level' then 'f.level'
    when 'level_group' then 'f.level_group'
    when 'grade' then 'f.grade'
    when 'class_name' then 'f.class_name'
    when 'content' then 'f.content'
    when 'component' then 'f.component'
    when 'dataset' then 'f.dataset_id::text'
    else null
  end;
end $$;

-- 필터 조건 SQL. p: {metric, filters: {dim: [값...]}, week_from, week_to}
create or replace function stat_where(p jsonb) returns text language plpgsql stable as $$
declare
  w text := format('f.metric = %L', coalesce(p->>'metric', 'enroll'));
  k text;
  v jsonb;
  ex text;
begin
  for k, v in select key, value from jsonb_each(coalesce(p->'filters', '{}'::jsonb)) loop
    ex := stat_dim_expr(k);
    if ex is null then raise exception 'unknown dimension %', k; end if;
    if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0 then
      w := w || format(' and coalesce(%s, ''(없음)'') = any(%L::text[])', ex,
        array(select jsonb_array_elements_text(v)));
    end if;
  end loop;
  if p ? 'week_from' and (p->>'week_from') is not null then
    w := w || format(' and f.week >= %s', (p->>'week_from')::int);
  end if;
  if p ? 'week_to' and (p->>'week_to') is not null then
    w := w || format(' and f.week <= %s', (p->>'week_to')::int);
  end if;
  return w;
end $$;

-- 피벗 집계. p: {metric, filters, rows, cols, week_from, week_to}
-- 각 셀: d=분모 합, n=분자 합, np=포함된 (학기,주차) 수 — 수강률의 현원생은 d/np(주 평균)로 보여 줍니다.
-- so=정렬용 학기 순서(행·열이 학기일 때)
create or replace function stat_pivot(p jsonb) returns jsonb language plpgsql stable as $$
declare
  rx text := coalesce(stat_dim_expr(p->>'rows'), '''전체''');
  cx text := coalesce(stat_dim_expr(p->>'cols'), '''전체''');
  res jsonb;
begin
  if p->>'rows' is not null and stat_dim_expr(p->>'rows') is null then raise exception 'unknown dimension'; end if;
  if p->>'cols' is not null and stat_dim_expr(p->>'cols') is null then raise exception 'unknown dimension'; end if;
  -- 브랜드마다 학기·주차 이름이 달라서(April "26 가을" / iG "26 2학기") 주 평균은 브랜드별로 낸 뒤 더합니다.
  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object('r', r, 'c', c, 'd', d, 'n', n, 'np', np, 'da', da, 'na', na)), '[]'::jsonb)
    from (
      select r, c, sum(d) d, sum(n) n, max(np) np, sum(d / np) da, sum(n / np) na
      from (
        select coalesce(%1$s, '(없음)') r, coalesce(%2$s, '(없음)') c, f.brand,
               sum(f.denom) d, sum(f.numer) n,
               count(distinct (coalesce(f.semester, ''), coalesce(f.week, -1))) np
        from stat_facts f
        join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready'
        where %3$s
        group by 1, 2, 3
      ) b
      group by r, c
    ) t
  $q$, rx, cx, stat_where(p)) into res;
  return res;
end $$;

-- 데이터셋 하나의 차원별 값 목록을 계산해 stat_datasets.dims에 저장 (필터 목록을 빠르게 띄우려고)
create or replace function stat_dataset_dims(p jsonb) returns jsonb language plpgsql as $$
declare
  ds_id uuid := (p->>'id')::uuid;
  dims text[] := array['brand','semester','week','month','branch_type','branch','alpha','program','level','level_group','grade','class_name','content','component'];
  d text;
  vals jsonb;
  out jsonb := '{}'::jsonb;
begin
  foreach d in array dims loop
    execute format($q$
      select coalesce(jsonb_agg(v), '[]'::jsonb) from (
        select distinct coalesce(%1$s, '(없음)') v from stat_facts f where f.dataset_id = %2$L limit 3000
      ) t
    $q$, stat_dim_expr(d), ds_id) into vals;
    out := out || jsonb_build_object(d, vals);
  end loop;
  update stat_datasets set dims = out where id = ds_id;
  return out;
end $$;

-- 필터에 띄울 차원별 값 목록 (공개된 데이터셋들의 dims를 합침). p: {metric}
create or replace function stat_dim_values(p jsonb) returns jsonb language plpgsql stable as $$
declare
  dims text[] := array['brand','semester','week','month','branch_type','branch','alpha','program','level','level_group','grade','class_name','content','component'];
  d text;
  vals jsonb;
  out jsonb := '{}'::jsonb;
begin
  foreach d in array dims loop
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into vals
    from stat_datasets ds, jsonb_array_elements_text(coalesce(ds.dims -> d, '[]'::jsonb)) v
    where ds.status = 'ready' and ds.metric = coalesce(p->>'metric', 'enroll');
    out := out || jsonb_build_object(d, vals);
  end loop;
  select coalesce(jsonb_agg(id::text), '[]'::jsonb) into vals
  from stat_datasets where status = 'ready' and metric = coalesce(p->>'metric', 'enroll');
  return out || jsonb_build_object('dataset', vals);
end $$;

-- ---------------------------------------------------------------------------
-- 업로드
-- ---------------------------------------------------------------------------
create or replace function stat_dataset_create(p jsonb) returns jsonb language plpgsql as $$
declare
  new_id uuid;
begin
  insert into stat_datasets (name, brand, metric, source_file, source_sheets, mapping, note, uploaded_by)
  values (p->>'name', p->>'brand', p->>'metric', coalesce(p->>'source_file', ''),
          coalesce(array(select jsonb_array_elements_text(p->'source_sheets')), '{}'),
          coalesce(p->'mapping', '{}'::jsonb), coalesce(p->>'note', ''), p->>'uploaded_by')
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

-- p: {id, rows: [{brand, metric, year, term, semester, sem_order, week, week_start, branch_type, ...,  denom, numer}]}
create or replace function stat_dataset_rows(p jsonb) returns jsonb language plpgsql as $$
declare
  ds stat_datasets;
  n integer;
begin
  select * into ds from stat_datasets where id = (p->>'id')::uuid;
  if not found then raise exception 'dataset not found'; end if;
  insert into stat_facts (dataset_id, brand, metric, year, term, semester, sem_order, week, week_start,
    branch_type, branch, alpha, program, level, level_group, grade, class_name, content, component, denom, numer)
  select ds.id, coalesce(nullif(r.brand, ''), ds.brand), ds.metric, r.year, nullif(r.term, ''), nullif(r.semester, ''), r.sem_order,
    r.week, r.week_start, nullif(r.branch_type, ''), nullif(r.branch, ''), nullif(r.alpha, ''), nullif(r.program, ''),
    nullif(r.level, ''), nullif(r.level_group, ''), nullif(r.grade, ''), nullif(r.class_name, ''), nullif(r.content, ''),
    nullif(r.component, ''), coalesce(r.denom, 0), coalesce(r.numer, 0)
  from jsonb_to_recordset(p->'rows') as r(
    brand text, year integer, term text, semester text, sem_order integer, week integer, week_start date,
    branch_type text, branch text, alpha text, program text, level text, level_group text, grade text,
    class_name text, content text, component text, denom numeric, numer numeric);
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end $$;

-- 같은 브랜드·지표·학기·주차·콘텐츠가 이미 다른 데이터셋에 있는지
create or replace function stat_dataset_overlap(p jsonb) returns jsonb language sql stable as $$
  with mine as (
    select distinct brand, metric, coalesce(semester, '') s, coalesce(week, -1) w, coalesce(content, '') c
    from stat_facts where dataset_id = (p->>'id')::uuid
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'rows', t.cnt, 'created_at', t.created_at)), '[]'::jsonb)
  from (
    select ds.id, ds.name, ds.created_at, count(*) cnt
    from stat_facts f
    join mine m on m.brand = f.brand and m.metric = f.metric and m.s = coalesce(f.semester, '')
      and m.w = coalesce(f.week, -1) and m.c = coalesce(f.content, '')
    join stat_datasets ds on ds.id = f.dataset_id
    where f.dataset_id <> (p->>'id')::uuid and ds.status = 'ready'
    group by ds.id, ds.name, ds.created_at
  ) t;
$$;

-- 업로드 마무리: 학원 별칭 정리 → 마스터로 직/가맹·알파 채우기 → 마스터 갱신 → (선택) 겹치는 기존 행 삭제 → 공개
create or replace function stat_dataset_finish(p jsonb) returns jsonb language plpgsql as $$
declare
  ds_id uuid := (p->>'id')::uuid;
  n integer;
  removed integer := 0;
begin
  update stat_facts f set branch = b.name
  from stat_branches b
  where f.dataset_id = ds_id and f.brand = b.brand and f.branch = any(b.aliases);

  -- 직/가맹만 채웁니다. 알파 여부는 학기마다 바뀌어서(26봄 알파 전환 등) 표에 있는 값만 씁니다.
  update stat_facts f set branch_type = b.branch_type
  from stat_branches b
  where f.dataset_id = ds_id and f.brand = b.brand and f.branch = b.name
    and f.branch_type is null and b.branch_type is not null;

  insert into stat_branches (brand, name, branch_type, alpha)
  select brand, branch, max(branch_type),
    (array_agg(alpha order by sem_order desc nulls last, week desc nulls last) filter (where alpha is not null))[1]
  from stat_facts where dataset_id = ds_id and branch is not null
  group by brand, branch
  on conflict (brand, name) do update set
    branch_type = coalesce(excluded.branch_type, stat_branches.branch_type),
    alpha = coalesce(excluded.alpha, stat_branches.alpha),
    updated_at = now();

  if coalesce((p->>'replace_overlap')::boolean, false) then
    with mine as (
      select distinct brand, metric, coalesce(semester, '') s, coalesce(week, -1) w, coalesce(content, '') c
      from stat_facts where dataset_id = ds_id
    )
    delete from stat_facts f using mine m
    where f.dataset_id <> ds_id and m.brand = f.brand and m.metric = f.metric
      and m.s = coalesce(f.semester, '') and m.w = coalesce(f.week, -1) and m.c = coalesce(f.content, '');
    get diagnostics removed = row_count;
    update stat_datasets d set row_count = (select count(*) from stat_facts f where f.dataset_id = d.id)
    where d.id <> ds_id;
    delete from stat_datasets d where d.id <> ds_id and d.status = 'ready'
      and not exists (select 1 from stat_facts f where f.dataset_id = d.id);
  end if;

  select count(*) into n from stat_facts where dataset_id = ds_id;
  update stat_datasets set status = 'ready', row_count = n where id = ds_id;
  perform stat_dataset_dims(jsonb_build_object('id', d.id))
  from stat_datasets d where d.id = ds_id or (removed > 0 and d.status = 'ready');
  return jsonb_build_object('rows', n, 'removed', removed);
end $$;

create or replace function stat_dataset_list(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', d.id, 'name', d.name, 'brand', d.brand, 'metric', d.metric, 'source_file', d.source_file,
      'source_sheets', d.source_sheets, 'row_count', d.row_count, 'status', d.status, 'note', d.note,
      'uploaded_by', d.uploaded_by, 'created_at', d.created_at,
      'semesters', (select coalesce(jsonb_agg(distinct f.semester), '[]'::jsonb) from stat_facts f where f.dataset_id = d.id and f.semester is not null),
      'week_min', (select min(week) from stat_facts f where f.dataset_id = d.id),
      'week_max', (select max(week) from stat_facts f where f.dataset_id = d.id),
      'denom', (select sum(denom) from stat_facts f where f.dataset_id = d.id),
      'numer', (select sum(numer) from stat_facts f where f.dataset_id = d.id)
    ) x
    from stat_datasets d
  ) t;
$$;

create or replace function stat_dataset_get(p jsonb) returns jsonb language sql stable as $$
  select to_jsonb(d) from stat_datasets d where d.id = (p->>'id')::uuid;
$$;

create or replace function stat_dataset_update(p jsonb) returns jsonb language plpgsql as $$
begin
  update stat_datasets set
    name = case when p ? 'name' then p->>'name' else name end,
    note = case when p ? 'note' then p->>'note' else note end
  where id = (p->>'id')::uuid;
  return jsonb_build_object('ok', found);
end $$;

create or replace function stat_dataset_delete(p jsonb) returns jsonb language plpgsql as $$
begin
  delete from stat_datasets where id = (p->>'id')::uuid;
  return jsonb_build_object('ok', found);
end $$;

-- 끝내지 못한 업로드(1시간 넘게 loading) 정리
create or replace function stat_dataset_cleanup(p jsonb) returns jsonb language plpgsql as $$
declare n integer;
begin
  delete from stat_datasets where status = 'loading' and created_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return jsonb_build_object('removed', n);
end $$;

-- ---------------------------------------------------------------------------
-- 학원 마스터
-- ---------------------------------------------------------------------------
create or replace function stat_branch_list(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand', b.brand, 'name', b.name, 'branch_type', b.branch_type, 'alpha', b.alpha,
    'aliases', to_jsonb(b.aliases), 'note', b.note, 'updated_at', b.updated_at
  ) order by b.brand, b.branch_type nulls last, b.name), '[]'::jsonb)
  from stat_branches b
  where p->>'brand' is null or b.brand = p->>'brand';
$$;

create or replace function stat_branch_upsert(p jsonb) returns jsonb language plpgsql as $$
begin
  insert into stat_branches (brand, name, branch_type, alpha, aliases, note)
  values (p->>'brand', p->>'name', nullif(p->>'branch_type', ''), nullif(p->>'alpha', ''),
          coalesce(array(select jsonb_array_elements_text(p->'aliases')), '{}'), coalesce(p->>'note', ''))
  on conflict (brand, name) do update set
    branch_type = excluded.branch_type, alpha = excluded.alpha, aliases = excluded.aliases,
    note = excluded.note, updated_at = now();
  -- 별칭으로 들어온 다른 마스터 행은 합칩니다.
  delete from stat_branches where brand = p->>'brand' and name <> p->>'name'
    and name = any(array(select jsonb_array_elements_text(p->'aliases')));
  return jsonb_build_object('ok', true);
end $$;

create or replace function stat_branch_delete(p jsonb) returns jsonb language plpgsql as $$
begin
  delete from stat_branches where brand = p->>'brand' and name = p->>'name';
  return jsonb_build_object('ok', found);
end $$;

-- 마스터를 이미 올라간 데이터 전체에 다시 적용 (이름 별칭 + 직/가맹 + 알파)
create or replace function stat_branch_apply(p jsonb) returns jsonb language plpgsql as $$
declare
  a integer;
  b integer;
begin
  update stat_facts f set branch = m.name
  from stat_branches m
  where f.brand = m.brand and f.branch = any(m.aliases);
  get diagnostics a = row_count;
  update stat_facts f set branch_type = m.branch_type
  from stat_branches m
  where f.brand = m.brand and f.branch = m.name and m.branch_type is not null
    and coalesce(f.branch_type, '') <> m.branch_type;
  get diagnostics b = row_count;
  if a + b > 0 then
    perform stat_dataset_dims(jsonb_build_object('id', d.id)) from stat_datasets d where d.status = 'ready';
  end if;
  return jsonb_build_object('renamed', a, 'updated', b);
end $$;

-- ---------------------------------------------------------------------------
-- 보고서
-- ---------------------------------------------------------------------------
create or replace function stat_report_list(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc), '[]'::jsonb) from stat_reports r;
$$;

create or replace function stat_report_save(p jsonb) returns jsonb language plpgsql as $$
declare
  rid uuid;
begin
  if p ? 'id' and (p->>'id') is not null then
    update stat_reports set name = p->>'name', description = coalesce(p->>'description', ''),
      config = p->'config', updated_at = now()
    where id = (p->>'id')::uuid returning id into rid;
  else
    insert into stat_reports (name, description, config, created_by)
    values (p->>'name', coalesce(p->>'description', ''), p->'config', p->>'created_by')
    returning id into rid;
  end if;
  return jsonb_build_object('id', rid);
end $$;

create or replace function stat_report_get(p jsonb) returns jsonb language sql stable as $$
  select to_jsonb(r) from stat_reports r where r.id = (p->>'id')::uuid;
$$;

create or replace function stat_report_delete(p jsonb) returns jsonb language plpgsql as $$
begin
  delete from stat_reports where id = (p->>'id')::uuid;
  return jsonb_build_object('ok', found);
end $$;
