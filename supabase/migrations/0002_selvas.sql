-- 0002: 셀바스 정산, 보조 집계표(cut), 학년그룹, 주차 날짜 추정, 설정
-- 0001 다음에 실행합니다. 다시 실행해도 안전합니다.

-- 같은 학생을 다른 기준으로 나눈 표(April 주간 시트의 학원별 표 / 레벨별 표 등)를 함께 두되 섞지 않으려고,
-- 기본 표가 아닌 데이터셋에는 cut 이름을 붙입니다. 분석은 기본적으로 cut = '' 만 봅니다.
alter table stat_datasets add column if not exists cut text not null default '';

create index if not exists stat_facts_bsw on stat_facts (brand, semester, week);

create table if not exists stat_settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table stat_settings enable row level security;

-- ---------------------------------------------------------------------------
-- 차원: 학년그룹(초/중/고)은 학년 값에서 계산
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
    when 'grade_group' then 'case when f.grade ~ ''^유'' then ''유'' when f.grade ~ ''^초'' then ''초'' when f.grade ~ ''^중'' then ''중'' when f.grade ~ ''^고'' then ''고'' else f.grade end'
    when 'class_name' then 'f.class_name'
    when 'content' then 'f.content'
    when 'component' then 'f.component'
    when 'dataset' then 'f.dataset_id::text'
    else null
  end;
end $$;

-- 필터 조건 (ds = stat_datasets 별칭이 함께 조인돼 있어야 함). p.cut 없으면 기본 표만.
create or replace function stat_where(p jsonb) returns text language plpgsql stable as $$
declare
  w text := format('f.metric = %L and ds.cut = %L', coalesce(p->>'metric', 'enroll'), coalesce(p->>'cut', ''));
  k text;
  v jsonb;
  ex text;
begin
  for k, v in select key, value from jsonb_each(coalesce(p->'filters', '{}'::jsonb)) loop
    ex := stat_dim_expr(k);
    if ex is null then raise exception 'unknown dimension %', k; end if;
    if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0 then
      if v ? '(없음)' then
        w := w || format(' and coalesce(%s, ''(없음)'') = any(%L::text[])', ex, array(select jsonb_array_elements_text(v)));
      elsif k in ('brand', 'semester') then
        -- plain column comparison so the (brand, semester, week) index can be used
        w := w || format(' and %s = any(%L::text[])', ex, array(select jsonb_array_elements_text(v)));
      elsif k = 'week' then
        w := w || format(' and f.week = any(%L::int[])', array(select (jsonb_array_elements_text(v))::int));
      else
        w := w || format(' and %s = any(%L::text[])', ex, array(select jsonb_array_elements_text(v)));
      end if;
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

create or replace function stat_dataset_dims(p jsonb) returns jsonb language plpgsql as $$
declare
  ds_id uuid := (p->>'id')::uuid;
  dims text[] := array['brand','semester','week','month','branch_type','branch','alpha','program','level','level_group','grade','grade_group','class_name','content','component'];
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

create or replace function stat_dim_values(p jsonb) returns jsonb language plpgsql stable as $$
declare
  dims text[] := array['brand','semester','week','month','branch_type','branch','alpha','program','level','level_group','grade','grade_group','class_name','content','component'];
  d text;
  vals jsonb;
  out jsonb := '{}'::jsonb;
  m text := coalesce(p->>'metric', 'enroll');
  c text := coalesce(p->>'cut', '');
begin
  foreach d in array dims loop
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into vals
    from stat_datasets ds, jsonb_array_elements_text(coalesce(ds.dims -> d, '[]'::jsonb)) v
    where ds.status = 'ready' and ds.metric = m and ds.cut = c;
    out := out || jsonb_build_object(d, vals);
  end loop;
  select coalesce(jsonb_agg(id::text), '[]'::jsonb) into vals
  from stat_datasets where status = 'ready' and metric = m and cut = c;
  out := out || jsonb_build_object('dataset', vals);
  -- 이 지표에 있는 보조 집계표 이름들
  select coalesce(jsonb_agg(distinct cut), '[]'::jsonb) into vals
  from stat_datasets where status = 'ready' and metric = m and cut <> '';
  return out || jsonb_build_object('_cuts', vals);
end $$;

-- ---------------------------------------------------------------------------
-- 업로드: cut 저장, 겹침 판단에 cut 포함, 주차 날짜 추정
-- ---------------------------------------------------------------------------
create or replace function stat_dataset_create(p jsonb) returns jsonb language plpgsql as $$
declare
  new_id uuid;
begin
  insert into stat_datasets (name, brand, metric, cut, source_file, source_sheets, mapping, note, uploaded_by)
  values (p->>'name', p->>'brand', p->>'metric', coalesce(p->>'cut', ''), coalesce(p->>'source_file', ''),
          coalesce(array(select jsonb_array_elements_text(p->'source_sheets')), '{}'),
          coalesce(p->'mapping', '{}'::jsonb), coalesce(p->>'note', ''), p->>'uploaded_by')
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function stat_dataset_overlap(p jsonb) returns jsonb language sql stable as $$
  with me as (select cut from stat_datasets where id = (p->>'id')::uuid),
  mine as (
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
    where f.dataset_id <> (p->>'id')::uuid and ds.status = 'ready' and ds.cut = (select cut from me)
    group by ds.id, ds.name, ds.created_at
  ) t;
$$;

create or replace function stat_dataset_finish(p jsonb) returns jsonb language plpgsql as $$
declare
  ds_id uuid := (p->>'id')::uuid;
  my_cut text;
  n integer;
  removed integer := 0;
  touched uuid[] := '{}';
begin
  select cut into my_cut from stat_datasets where id = ds_id;

  update stat_facts f set branch = a.name
  from (select brand, name, unnest(aliases) alias from stat_branches) a
  where f.dataset_id = ds_id and f.brand = a.brand and f.branch = a.alias;

  -- 직/가맹만 채웁니다. 알파 여부는 학기마다 바뀌어서 표에 있는 값만 씁니다.
  update stat_facts f set branch_type = b.branch_type
  from stat_branches b
  where f.dataset_id = ds_id and f.brand = b.brand and f.branch = b.name
    and f.branch_type is null and b.branch_type is not null;

  -- 표에 알파/4.0 열이 없을 때, 올린 사람이 원하면 학원 정보의 (최신) 값으로 채웁니다.
  if coalesce((p->>'fill_alpha')::boolean, false) then
    update stat_facts f set alpha = b.alpha
    from stat_branches b
    where f.dataset_id = ds_id and f.brand = b.brand and f.branch = b.name
      and f.alpha is null and b.alpha is not null;
  end if;

  -- 주차 시작일이 없으면 같은 브랜드·학기·주차의 다른 데이터에서 가져옵니다 (월별 보기·셀바스 기준 주차용).
  update stat_facts f set week_start = k.week_start
  from (
    select o.brand, o.semester, o.week, min(o.week_start) week_start
    from stat_facts o
    join (select distinct brand, semester, week from stat_facts where dataset_id = ds_id and week_start is null) m
      on m.brand = o.brand and m.semester = o.semester and m.week = o.week
    where o.week_start is not null and o.dataset_id <> ds_id
    group by 1, 2, 3
  ) k
  where f.dataset_id = ds_id and f.week_start is null
    and f.brand = k.brand and f.semester = k.semester and f.week = k.week;

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
      select distinct brand, metric, semester, week, coalesce(content, '') c
      from stat_facts where dataset_id = ds_id
    ),
    gone as (
      delete from stat_facts f using mine m, stat_datasets d
      where f.dataset_id <> ds_id and d.id = f.dataset_id and d.cut = my_cut
        and f.brand = m.brand and f.metric = m.metric
        and f.semester is not distinct from m.semester and f.week is not distinct from m.week
        and coalesce(f.content, '') = m.c
      returning f.dataset_id
    )
    select count(*), coalesce(array_agg(distinct dataset_id), '{}') into removed, touched from gone;
    -- only the datasets that lost rows are recounted / dropped / re-indexed
    update stat_datasets d set row_count = (select count(*) from stat_facts f where f.dataset_id = d.id)
    where d.id = any(touched);
    delete from stat_datasets d where d.id = any(touched)
      and not exists (select 1 from stat_facts f where f.dataset_id = d.id);
  end if;

  select count(*) into n from stat_facts where dataset_id = ds_id;
  update stat_datasets set status = 'ready', row_count = n where id = ds_id;
  perform stat_dataset_dims(jsonb_build_object('id', d.id))
  from stat_datasets d where d.id = ds_id or d.id = any(touched);
  return jsonb_build_object('rows', n, 'removed', removed);
end $$;

create or replace function stat_dataset_list(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', d.id, 'name', d.name, 'brand', d.brand, 'metric', d.metric, 'cut', d.cut, 'source_file', d.source_file,
      'source_sheets', d.source_sheets, 'row_count', d.row_count, 'status', d.status, 'note', d.note,
      'uploaded_by', d.uploaded_by, 'created_at', d.created_at,
      'semesters', coalesce(d.dims -> 'semester', '[]'::jsonb),
      'week_min', (select min(week) from stat_facts f where f.dataset_id = d.id),
      'week_max', (select max(week) from stat_facts f where f.dataset_id = d.id),
      'denom', (select sum(denom) from stat_facts f where f.dataset_id = d.id),
      'numer', (select sum(numer) from stat_facts f where f.dataset_id = d.id)
    ) x
    from stat_datasets d
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 셀바스 정산
-- ---------------------------------------------------------------------------
-- 브랜드별 주차 목록과 시작일 (기준 주차 고르기용). p: {brands: [...]}
create or replace function stat_weeks(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand', brand, 'semester', semester, 'sem_order', sem_order, 'term', term, 'week', week,
    'week_start', week_start, 'cuts', cuts, 'has_program', has_program
  ) order by brand, sem_order, week), '[]'::jsonb)
  from (
    select f.brand, f.semester, max(f.sem_order) sem_order, max(f.term) term, f.week, min(f.week_start) week_start,
           jsonb_agg(distinct ds.cut) cuts, bool_or(f.program is not null) has_program
    from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready'
    where f.metric = 'enroll' and f.week is not null and f.semester is not null
      and (p->'brands' is null or f.brand = any(array(select jsonb_array_elements_text(p->'brands'))))
    group by f.brand, f.semester, f.week
  ) t;
$$;

-- 한 브랜드·학기·주차의 프로그램 × 레벨별 수강생. 프로그램 정보가 있는 표(cut)를 고릅니다.
-- p: {brand, semester, week}
create or replace function stat_program_counts(p jsonb) returns jsonb language plpgsql stable as $$
declare
  use_cut text;
  res jsonb;
begin
  select ds.cut into use_cut
  from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready'
  where f.metric = 'enroll' and f.brand = p->>'brand' and f.semester = p->>'semester' and f.week = (p->>'week')::int
  group by ds.cut
  order by bool_or(f.program is not null) desc, (ds.cut = '') desc
  limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('program', program, 'level', level, 'd', d, 'n', n)), '[]'::jsonb) into res
  from (
    select coalesce(f.program, '(없음)') program, coalesce(f.level, '(없음)') level, sum(f.denom) d, sum(f.numer) n
    from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready' and ds.cut = coalesce(use_cut, '')
    where f.metric = 'enroll' and f.brand = p->>'brand' and f.semester = p->>'semester' and f.week = (p->>'week')::int
    group by 1, 2
  ) t;
  return jsonb_build_object('cut', coalesce(use_cut, ''), 'rows', res);
end $$;

-- ---------------------------------------------------------------------------
-- 설정
-- ---------------------------------------------------------------------------
create or replace function stat_setting_get(p jsonb) returns jsonb language sql stable as $$
  select value from stat_settings where key = p->>'key';
$$;

create or replace function stat_setting_set(p jsonb) returns jsonb language plpgsql as $$
begin
  insert into stat_settings (key, value, updated_by) values (p->>'key', p->'value', p->>'updated_by')
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- 업로드 마무리(stat_dataset_finish)는 큰 파일에서 8초(기본 API 제한)를 넘을 수 있어 서비스 롤만 60초로 늘립니다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'alter role service_role set statement_timeout = ''60s''';
    notify pgrst, 'reload config';
  end if;
end $$;

-- 학원 정보를 이미 올라간 데이터 전체에 다시 적용 (이름 별칭 + 직/가맹). 바뀐 데이터셋만 필터 목록을 다시 만듭니다.
create or replace function stat_branch_apply(p jsonb) returns jsonb language plpgsql as $$
declare
  a integer;
  b integer;
  t1 uuid[];
  t2 uuid[];
begin
  with ch as (
    update stat_facts f set branch = al.name
    from (select brand, name, unnest(aliases) alias from stat_branches) al
    where f.brand = al.brand and f.branch = al.alias
    returning f.dataset_id
  )
  select count(*), coalesce(array_agg(distinct dataset_id), '{}') into a, t1 from ch;
  with ch as (
    update stat_facts f set branch_type = m.branch_type
    from stat_branches m
    where f.brand = m.brand and f.branch = m.name and m.branch_type is not null
      and f.branch_type is distinct from m.branch_type
    returning f.dataset_id
  )
  select count(*), coalesce(array_agg(distinct dataset_id), '{}') into b, t2 from ch;
  perform stat_dataset_dims(jsonb_build_object('id', d.id))
  from stat_datasets d where d.id = any(t1 || t2);
  return jsonb_build_object('renamed', a, 'updated', b);
end $$;
