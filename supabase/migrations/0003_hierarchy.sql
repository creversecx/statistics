-- 0003: 브랜드 위계 — 브랜드(AP·CD·iG) > 서브브랜드(Alpha·4.0 / Regular·Prime·TO) > 프로그램(CD만) > 레벨그룹 > 레벨
-- 0002 다음에 실행합니다. 다시 실행해도 안전합니다.
-- 기존 데이터의 브랜드·레벨 이름 변환은 이관 스크립트(lib/levels.ts 규칙)로 한 번 합니다.

alter table stat_facts add column if not exists sub_brand text;
-- April 레벨 아래 트랙 (A = 봄·가을, B = 여름·겨울, 지금은 A·B 동시 운영 레벨도 있음)
alter table stat_facts add column if not exists track text;
create index if not exists stat_facts_bssw on stat_facts (brand, sub_brand, semester, week);
-- 월 필터(날짜 범위)용
create index if not exists stat_facts_metric_ws on stat_facts (metric, week_start);

create or replace function stat_dim_expr(d text) returns text language plpgsql immutable as $$
begin
  return case d
    when 'brand' then 'f.brand'
    when 'sub_brand' then 'f.sub_brand'
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
    when 'track' then 'f.track'
    when 'grade' then 'f.grade'
    when 'grade_group' then 'case when f.grade ~ ''^유'' then ''유'' when f.grade ~ ''^초'' then ''초'' when f.grade ~ ''^중'' then ''중'' when f.grade ~ ''^고'' then ''고'' else f.grade end'
    when 'class_name' then 'f.class_name'
    when 'content' then 'f.content'
    when 'component' then 'f.component'
    when 'dataset' then 'f.dataset_id::text'
    else null
  end;
end $$;

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
      elsif k = 'week' then
        w := w || format(' and f.week = any(%L::int[])', array(select (jsonb_array_elements_text(v))::int));
      elsif k = 'month' then
        -- 날짜 범위로 먼저 좁혀서 (metric, week_start) 색인을 쓰고, 그 안에서 고른 달만
        w := w || format(' and f.week_start >= %L::date and f.week_start < (%L::date + interval ''1 month'') and to_char(f.week_start, ''YYYY-MM'') = any(%L::text[])',
          (select min(x) from jsonb_array_elements_text(v) x) || '-01', (select max(x) from jsonb_array_elements_text(v) x) || '-01',
          array(select jsonb_array_elements_text(v)));
      else
        -- plain column comparison so the (brand, sub_brand, semester, week) index can be used
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
  dims text[] := array['brand','sub_brand','semester','week','month','branch_type','branch','program','level','level_group','track','grade','grade_group','class_name','content','component'];
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
  dims text[] := array['brand','sub_brand','semester','week','month','branch_type','branch','program','level','level_group','track','grade','grade_group','class_name','content','component'];
  d text;
  vals jsonb;
  out jsonb := '{}'::jsonb;
  m text := coalesce(p->>'metric', 'enroll');
  c text := coalesce(p->>'cut', '');
  -- 브랜드를 고르면 그 브랜드 데이터의 값만 (학기·서브브랜드·레벨 목록이 브랜드를 따라감)
  b text[] := case when jsonb_typeof(p->'brands') = 'array' and jsonb_array_length(p->'brands') > 0
                   then array(select jsonb_array_elements_text(p->'brands')) end;
begin
  foreach d in array dims loop
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into vals
    from stat_datasets ds, jsonb_array_elements_text(coalesce(ds.dims -> d, '[]'::jsonb)) v
    where ds.status = 'ready' and ds.metric = m and ds.cut = c and (b is null or ds.brand = any(b));
    out := out || jsonb_build_object(d, vals);
  end loop;
  select coalesce(jsonb_agg(id::text), '[]'::jsonb) into vals
  from stat_datasets where status = 'ready' and metric = m and cut = c;
  out := out || jsonb_build_object('dataset', vals);
  select coalesce(jsonb_agg(distinct cut), '[]'::jsonb) into vals
  from stat_datasets where status = 'ready' and metric = m and cut <> '';
  return out || jsonb_build_object('_cuts', vals);
end $$;

create or replace function stat_dataset_rows(p jsonb) returns jsonb language plpgsql as $$
declare
  ds stat_datasets;
  n integer;
begin
  select * into ds from stat_datasets where id = (p->>'id')::uuid;
  if not found then raise exception 'dataset not found'; end if;
  insert into stat_facts (dataset_id, brand, sub_brand, track, metric, year, term, semester, sem_order, week, week_start,
    branch_type, branch, alpha, program, level, level_group, grade, class_name, content, component, denom, numer)
  select ds.id, coalesce(nullif(r.brand, ''), ds.brand), nullif(r.sub_brand, ''), nullif(r.track, ''), ds.metric, r.year, nullif(r.term, ''), nullif(r.semester, ''), r.sem_order,
    r.week, r.week_start, nullif(r.branch_type, ''), nullif(r.branch, ''), nullif(r.alpha, ''), nullif(r.program, ''),
    nullif(r.level, ''), nullif(r.level_group, ''), nullif(r.grade, ''), nullif(r.class_name, ''), nullif(r.content, ''),
    nullif(r.component, ''), coalesce(r.denom, 0), coalesce(r.numer, 0)
  from jsonb_to_recordset(p->'rows') as r(
    brand text, sub_brand text, track text, year integer, term text, semester text, sem_order integer, week integer, week_start date,
    branch_type text, branch text, alpha text, program text, level text, level_group text, grade text,
    class_name text, content text, component text, denom numeric, numer numeric);
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end $$;

-- 겹침: 같은 브랜드·서브브랜드·지표·학기·주차·콘텐츠 (Prime을 올려도 Regular는 그대로)
create or replace function stat_dataset_overlap(p jsonb) returns jsonb language sql stable as $$
  with me as (select cut from stat_datasets where id = (p->>'id')::uuid),
  mine as (
    select distinct brand, sub_brand, metric, semester, week, coalesce(content, '') c
    from stat_facts where dataset_id = (p->>'id')::uuid
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'rows', t.cnt, 'created_at', t.created_at)), '[]'::jsonb)
  from (
    select ds.id, ds.name, ds.created_at, count(*) cnt
    from stat_facts f
    join mine m on m.brand = f.brand and m.sub_brand is not distinct from f.sub_brand and m.metric = f.metric
      and m.semester is not distinct from f.semester and m.week is not distinct from f.week and m.c = coalesce(f.content, '')
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

  update stat_facts f set branch_type = b.branch_type
  from stat_branches b
  where f.dataset_id = ds_id and f.brand = b.brand and f.branch = b.name
    and f.branch_type is null and b.branch_type is not null;

  if coalesce((p->>'fill_alpha')::boolean, false) then
    update stat_facts f set alpha = b.alpha
    from stat_branches b
    where f.dataset_id = ds_id and f.brand = b.brand and f.branch = b.name
      and f.alpha is null and b.alpha is not null;
  end if;
  -- April 서브브랜드 = 알파 여부
  update stat_facts set sub_brand = case alpha when '알파' then 'Alpha' when '4.0' then '4.0' end
  where dataset_id = ds_id and brand = 'AP' and sub_brand is null and alpha in ('알파', '4.0');

  update stat_facts f set week_start = k.week_start
  from (
    select o.brand, o.sub_brand, o.semester, o.week, min(o.week_start) week_start
    from stat_facts o
    join (select distinct brand, sub_brand, semester, week from stat_facts where dataset_id = ds_id and week_start is null) m
      on m.brand = o.brand and m.sub_brand is not distinct from o.sub_brand and m.semester = o.semester and m.week = o.week
    where o.week_start is not null and o.dataset_id <> ds_id
    group by 1, 2, 3, 4
  ) k
  where f.dataset_id = ds_id and f.week_start is null
    and f.brand = k.brand and f.sub_brand is not distinct from k.sub_brand and f.semester = k.semester and f.week = k.week;

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
      select distinct brand, sub_brand, metric, semester, week, coalesce(content, '') c
      from stat_facts where dataset_id = ds_id
    ),
    gone as (
      delete from stat_facts f using mine m, stat_datasets d
      where f.dataset_id <> ds_id and d.id = f.dataset_id and d.cut = my_cut
        and f.brand = m.brand and f.sub_brand is not distinct from m.sub_brand and f.metric = m.metric
        and f.semester is not distinct from m.semester and f.week is not distinct from m.week
        and coalesce(f.content, '') = m.c
      returning f.dataset_id
    )
    select count(*), coalesce(array_agg(distinct dataset_id), '{}') into removed, touched from gone;
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

-- 셀바스: 주차 목록 (브랜드·서브브랜드별)
create or replace function stat_weeks(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand', brand, 'sub_brand', sub_brand, 'semester', semester, 'sem_order', sem_order, 'term', term, 'week', week,
    'week_start', week_start, 'has_program', has_program
  ) order by brand, sub_brand, sem_order, week), '[]'::jsonb)
  from (
    select f.brand, f.sub_brand, f.semester, max(f.sem_order) sem_order, max(f.term) term, f.week, min(f.week_start) week_start,
           bool_or(f.program is not null or f.level is not null) has_program
    from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready'
    where f.metric = 'enroll' and f.week is not null and f.semester is not null
      and (p->'brands' is null or f.brand = any(array(select jsonb_array_elements_text(p->'brands'))))
    group by f.brand, f.sub_brand, f.semester, f.week
  ) t;
$$;

-- 셀바스: 한 주의 프로그램·레벨그룹·레벨별 수강생. p: {brand, sub_brand(선택), semester, week}
create or replace function stat_program_counts(p jsonb) returns jsonb language plpgsql stable as $$
declare
  use_cut text;
  res jsonb;
  sb text := nullif(p->>'sub_brand', '');
begin
  select ds.cut into use_cut
  from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready'
  where f.metric = 'enroll' and f.brand = p->>'brand' and (sb is null or f.sub_brand = sb)
    and f.semester = p->>'semester' and f.week = (p->>'week')::int
  group by ds.cut
  order by bool_or(f.program is not null or f.level is not null) desc, (ds.cut = '') desc
  limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('program', program, 'level_group', level_group, 'level', level, 'd', d, 'n', n)), '[]'::jsonb) into res
  from (
    select coalesce(f.program, '(없음)') program, coalesce(f.level_group, '(없음)') level_group, coalesce(f.level, '(없음)') level,
           sum(f.denom) d, sum(f.numer) n
    from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready' and ds.cut = coalesce(use_cut, '')
    where f.metric = 'enroll' and f.brand = p->>'brand' and (sb is null or f.sub_brand = sb)
      and f.semester = p->>'semester' and f.week = (p->>'week')::int
    group by 1, 2, 3
  ) t;
  return jsonb_build_object('cut', coalesce(use_cut, ''), 'rows', res);
end $$;
