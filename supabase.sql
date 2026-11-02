-- Aktivitäten-Planer. Einmal im SQL Editor des Supabase-Projekts ausführen (dasselbe Projekt wie der Trainingslog,
-- deshalb das Präfix pl_). Die Tabellen sind von außen nicht lesbar oder schreibbar (RLS ohne Regeln, Rechte
-- entzogen). Die Seite spricht nur mit den Funktionen pl_* unten. Der Gruppen-Code ist der Schlüssel: Wer ihn kennt,
-- sieht und ändert die Pläne der Gruppe. Der Name zeigt nur an, wer etwas eingetragen hat.

create table public.pl_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.pl_activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pl_groups (id) on delete cascade,
  day date not null,
  start_time time not null,
  duration_min integer not null,
  kind text not null,
  title text not null,
  place text not null default '',
  note text not null default '',
  cost_cents integer not null default 0,   -- pro Person
  created_by text not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create index pl_activities_group_day on public.pl_activities (group_id, day);

alter table public.pl_groups enable row level security;
alter table public.pl_activities enable row level security;
revoke all on public.pl_groups, public.pl_activities from anon, authenticated;

create function public.pl_clean(p_text text, p_max integer, p_label text, p_required boolean) returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g');
begin
  if p_required and char_length(v) < 2 then raise exception '%: mindestens 2 Zeichen', p_label; end if;
  if char_length(v) > p_max then raise exception '%: höchstens % Zeichen', p_label, p_max; end if;
  return v;
end $$;

create function public.pl_group_id(p_code text) returns uuid
language plpgsql stable set search_path = ''
as $$
declare v uuid;
begin
  select id into v from public.pl_groups where code = upper(trim(p_code));
  if not found then raise exception 'Diesen Gruppen-Code gibt es nicht'; end if;
  return v;
end $$;

create function public.pl_json(a public.pl_activities) returns json
language sql stable set search_path = ''
as $$
  select json_build_object('id', a.id, 'day', a.day, 'start', to_char(a.start_time, 'HH24:MI'),
    'duration', a.duration_min, 'kind', a.kind, 'title', a.title, 'place', a.place, 'note', a.note,
    'cost_cents', a.cost_cents, 'created_by', a.created_by, 'updated_by', a.updated_by, 'updated_at', a.updated_at)
$$;

create function public.pl_create_group(p_group_name text) returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne I, O, 0, 1
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
  v_name text := public.pl_clean(p_group_name, 40, 'Gruppenname', true);
begin
  if (select count(*) from public.pl_groups) >= 200 then
    raise exception 'Es können gerade keine Gruppen angelegt werden';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.pl_groups (code, name) values (v_code, v_name);
  return json_build_object('code', v_code, 'group_name', v_name);
end $$;

-- Alle Pläne der Gruppe; null, wenn es den Code nicht gibt.
create function public.pl_plan(p_code text) returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object('code', g.code, 'group_name', g.name, 'activities', coalesce((
    select json_agg(public.pl_json(a) order by a.day, a.start_time, a.updated_at)
    from public.pl_activities a where a.group_id = g.id), '[]'::json))
  from public.pl_groups g where g.code = upper(trim(p_code))
$$;

-- Neue Aktivität, wenn p_id null ist, sonst Änderung einer vorhandenen.
create function public.pl_save(p_code text, p_name text, p_id uuid, p_day date, p_start time, p_duration integer,
                               p_kind text, p_title text, p_place text, p_note text, p_cost_cents integer)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_group uuid := public.pl_group_id(p_code);
  v_name text := public.pl_clean(p_name, 24, 'Name', true);
  v_title text := public.pl_clean(p_title, 80, 'Titel', true);
  v_place text := public.pl_clean(p_place, 80, 'Ort', false);
  v_note text := trim(coalesce(p_note, ''));
  v_row public.pl_activities;
begin
  if char_length(v_note) > 500 then raise exception 'Notiz: höchstens 500 Zeichen'; end if;
  if p_day is null or p_start is null or p_duration is null or p_duration not between 0 and 1440
     or coalesce(p_cost_cents, 0) not between 0 and 10000000 or coalesce(p_kind, '') !~ '^[a-z]{2,16}$' then
    raise exception 'Ungültige Werte';
  end if;
  if p_id is null then
    if (select count(*) from public.pl_activities where group_id = v_group) >= 3000 then
      raise exception 'Zu viele Einträge in dieser Gruppe';
    end if;
    insert into public.pl_activities (group_id, day, start_time, duration_min, kind, title, place, note, cost_cents,
                                      created_by, updated_by)
      values (v_group, p_day, p_start, p_duration, p_kind, v_title, v_place, v_note, coalesce(p_cost_cents, 0),
              v_name, v_name)
      returning * into v_row;
  else
    update public.pl_activities
       set day = p_day, start_time = p_start, duration_min = p_duration, kind = p_kind, title = v_title,
           place = v_place, note = v_note, cost_cents = coalesce(p_cost_cents, 0), updated_by = v_name, updated_at = now()
     where id = p_id and group_id = v_group
     returning * into v_row;
    if not found then raise exception 'Diese Aktivität gibt es nicht mehr'; end if;
  end if;
  return public.pl_json(v_row);
end $$;

create function public.pl_delete(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.pl_activities where id = p_id and group_id = public.pl_group_id(p_code);
end $$;

-- Nur diese vier sind von außen aufrufbar, die Helfer nicht.
revoke execute on function public.pl_clean(text, integer, text, boolean), public.pl_group_id(text),
  public.pl_json(public.pl_activities), public.pl_create_group(text), public.pl_plan(text),
  public.pl_save(text, text, uuid, date, time, integer, text, text, text, text, integer),
  public.pl_delete(text, uuid) from public, anon, authenticated;
grant execute on function public.pl_create_group(text), public.pl_plan(text),
  public.pl_save(text, text, uuid, date, time, integer, text, text, text, text, integer),
  public.pl_delete(text, uuid) to anon, authenticated;
