-- 0004: 청담 서브브랜드 = 일반관(Regular)·중등관(Prime) 두 개만. TO(The Open)는 일반관 아래 'ESL+EFL' 수업 형태로 합칩니다.
--   수업 형태(course_type, 청담만):
--     주2회 ESL = C1·C2 / C1·C2D / C1·C2·C2D (여름·겨울 A2·A3·V1 포함)
--     ESL+EFL  = ESL 1개 + TO(EFL) 수업. ERP raw에는 학생별 조합이 없어서 TO 수업 인원만 여기에 들어갑니다.
--     기타     = F1, Jump B2, MASTER 과정(D·GL·ST·WD·IM·GT) 등
--   ESL+EFL(TO) 인원은 수강률 합계에서 뺍니다. 수업 형태 필터에서 고르거나 수업 형태로 나눠 볼 때만 나옵니다.
-- 0003 다음에 실행합니다. 다시 실행해도 안전합니다.

alter table stat_facts add column if not exists course_type text;

-- 기존 데이터 변환
update stat_facts set sub_brand = 'Regular', course_type = 'ESL+EFL'
where brand = 'CD' and sub_brand = 'TO';
update stat_facts set course_type = case
    when program in ('C1', 'C2', 'C2D', 'A2', 'A3', 'V1') then '주2회 ESL'
    else '기타' end
where brand = 'CD' and program is not null and course_type is null;
-- TO 자료는 주 시작일이 비어 있었음 → 같은 일반관 주차에서 채움 (월 필터에 잡히게)
update stat_facts f set week_start = k.ws
from (select brand, sub_brand, semester, week, min(week_start) ws from stat_facts
      where brand = 'CD' and week_start is not null group by 1, 2, 3, 4) k
where f.brand = 'CD' and f.week_start is null and f.course_type = 'ESL+EFL'
  and k.brand = f.brand and k.sub_brand = f.sub_brand and k.semester = f.semester and k.week = f.week;

create or replace function stat_dim_expr(d text) returns text language plpgsql immutable as $$
begin
  return case d
    when 'brand' then 'f.brand'
    when 'sub_brand' then 'f.sub_brand'
    when 'course_type' then 'f.course_type'
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
  picked_course boolean := false;
begin
  for k, v in select key, value from jsonb_each(coalesce(p->'filters', '{}'::jsonb)) loop
    ex := stat_dim_expr(k);
    if ex is null then raise exception 'unknown dimension %', k; end if;
    if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0 then
      if k = 'course_type' then picked_course := true; end if;
      if v ? '(없음)' then
        w := w || format(' and coalesce(%s, ''(없음)'') = any(%L::text[])', ex, array(select jsonb_array_elements_text(v)));
      elsif k = 'week' then
        w := w || format(' and f.week = any(%L::int[])', array(select (jsonb_array_elements_text(v))::int));
      elsif k = 'month' then
        w := w || format(' and f.week_start >= %L::date and f.week_start < (%L::date + interval ''1 month'') and to_char(f.week_start, ''YYYY-MM'') = any(%L::text[])',
          (select min(x) from jsonb_array_elements_text(v) x) || '-01', (select max(x) from jsonb_array_elements_text(v) x) || '-01',
          array(select jsonb_array_elements_text(v)));
      else
        w := w || format(' and %s = any(%L::text[])', ex, array(select jsonb_array_elements_text(v)));
      end if;
    end if;
  end loop;
  -- ESL+EFL(TO) 인원은 수강률 합계에서 뺌: 수업 형태를 고르거나(필터) 수업 형태로 나눠 볼 때(include_efl)만 포함
  if not picked_course and not coalesce((p->>'include_efl')::boolean, false) then
    w := w || ' and f.course_type is distinct from ''ESL+EFL''';
  end if;
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
  dims text[] := array['brand','sub_brand','course_type','semester','week','month','branch_type','branch','program','level','level_group','track','grade','grade_group','class_name','content','component'];
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
  dims text[] := array['brand','sub_brand','course_type','semester','week','month','branch_type','branch','program','level','level_group','track','grade','grade_group','class_name','content','component'];
  d text;
  vals jsonb;
  out jsonb := '{}'::jsonb;
  m text := coalesce(p->>'metric', 'enroll');
  c text := coalesce(p->>'cut', '');
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

-- 어떤 차원(레벨·학원·프로그램 …)이 어느 학기·주차에만 있는지. 화면의 '(없음)' 안내용.
-- p: {metric, cut, dim, brands}. 결과: [{brand, semester, weeks: [..], partial: 그 브랜드에 이 정보가 없는 자료도 있는지}]
create or replace function stat_dim_coverage(p jsonb) returns jsonb language sql stable as $$
  with ds as (
    select d.brand, d.dims
    from stat_datasets d
    where d.status = 'ready' and d.metric = coalesce(p->>'metric', 'enroll') and d.cut = coalesce(p->>'cut', '')
      and (jsonb_typeof(p->'brands') is distinct from 'array' or jsonb_array_length(p->'brands') = 0
           or d.brand = any(array(select jsonb_array_elements_text(p->'brands'))))
  ),
  has as (
    select brand, dims, exists (select 1 from jsonb_array_elements_text(coalesce(dims -> (p->>'dim'), '[]'::jsonb)) v where v <> '(없음)') ok,
           coalesce(dims -> (p->>'dim'), '[]'::jsonb) ? '(없음)' missing
    from ds
  ),
  partial as (select brand, bool_or(missing) partial from has group by brand),
  sw as (
    select h.brand, s semester, w::int week
    from has h, jsonb_array_elements_text(coalesce(h.dims -> 'semester', '[]'::jsonb)) s,
         jsonb_array_elements_text(coalesce(h.dims -> 'week', '[]'::jsonb)) w
    where h.ok and s <> '(없음)' and w ~ '^\d+$'
  )
  select coalesce(jsonb_agg(jsonb_build_object('brand', x.brand, 'semester', x.semester, 'weeks', x.weeks, 'partial', pt.partial)), '[]'::jsonb)
  from (select brand, semester, jsonb_agg(distinct week) weeks from sw group by brand, semester) x
  join partial pt on pt.brand = x.brand;
$$;

-- 겹치는 자료 바꾸기: ESL+EFL(TO) 자료와 나머지 일반관 자료는 서로 지우지 않습니다.
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
      select distinct brand, sub_brand, metric, semester, week, coalesce(content, '') c,
             (course_type is not distinct from 'ESL+EFL') efl
      from stat_facts where dataset_id = ds_id
    ),
    gone as (
      delete from stat_facts f using mine m, stat_datasets d
      where f.dataset_id <> ds_id and d.id = f.dataset_id and d.cut = my_cut
        and f.brand = m.brand and f.sub_brand is not distinct from m.sub_brand and f.metric = m.metric
        and f.semester is not distinct from m.semester and f.week is not distinct from m.week
        and coalesce(f.content, '') = m.c
        and (f.course_type is not distinct from 'ESL+EFL') = m.efl
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

create or replace function stat_dataset_rows(p jsonb) returns jsonb language plpgsql as $$
declare
  ds stat_datasets;
  n integer;
begin
  select * into ds from stat_datasets where id = (p->>'id')::uuid;
  if not found then raise exception 'dataset not found'; end if;
  insert into stat_facts (dataset_id, brand, sub_brand, course_type, track, metric, year, term, semester, sem_order, week, week_start,
    branch_type, branch, alpha, program, level, level_group, grade, class_name, content, component, denom, numer)
  select ds.id, coalesce(nullif(r.brand, ''), ds.brand), nullif(r.sub_brand, ''), nullif(r.course_type, ''), nullif(r.track, ''), ds.metric, r.year, nullif(r.term, ''), nullif(r.semester, ''), r.sem_order,
    r.week, r.week_start, nullif(r.branch_type, ''), nullif(r.branch, ''), nullif(r.alpha, ''), nullif(r.program, ''),
    nullif(r.level, ''), nullif(r.level_group, ''), nullif(r.grade, ''), nullif(r.class_name, ''), nullif(r.content, ''),
    nullif(r.component, ''), coalesce(r.denom, 0), coalesce(r.numer, 0)
  from jsonb_to_recordset(p->'rows') as r(
    brand text, sub_brand text, course_type text, track text, year integer, term text, semester text, sem_order integer, week integer, week_start date,
    branch_type text, branch text, alpha text, program text, level text, level_group text, grade text,
    class_name text, content text, component text, denom numeric, numer numeric);
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end $$;

-- 셀바스: ESL+EFL(TO) 수업은 셀바스 대상이 아니라서 뺍니다.
create or replace function stat_program_counts(p jsonb) returns jsonb language plpgsql stable as $$
declare
  use_cut text;
  res jsonb;
  sb text := nullif(p->>'sub_brand', '');
begin
  select ds.cut into use_cut
  from stat_facts f join stat_datasets ds on ds.id = f.dataset_id and ds.status = 'ready'
  where f.metric = 'enroll' and f.brand = p->>'brand' and (sb is null or f.sub_brand = sb)
    and f.course_type is distinct from 'ESL+EFL'
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
      and f.course_type is distinct from 'ESL+EFL'
      and f.semester = p->>'semester' and f.week = (p->>'week')::int
    group by 1, 2, 3
  ) t;
  return jsonb_build_object('cut', coalesce(use_cut, ''), 'rows', res);
end $$;

-- 변환한 청담 자료의 필터 목록 다시 계산
select stat_dataset_dims(jsonb_build_object('id', id)) from stat_datasets where brand = 'CD';
