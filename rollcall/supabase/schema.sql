-- RollCall schema — paste into Supabase SQL editor (or run via supabase db push)
--
-- Security model: RLS is enabled with NO policies, so the public anon key can
-- never read or write the tables directly (attendee emails and host tokens stay
-- private). All access goes through the SECURITY DEFINER functions below, which
-- expose only what each caller is allowed to see.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  organizer_name text not null,
  organizer_email text not null,
  organizer_token uuid not null default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null,
  company text,
  linkedin text,
  share_contact boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

alter table public.events enable row level security;
alter table public.checkins enable row level security;

-- Belt and braces: no direct table access for API roles even if RLS changes.
revoke all on public.events from anon, authenticated;
revoke all on public.checkins from anon, authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.create_event(
  p_name text,
  p_organizer_name text,
  p_organizer_email text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_token uuid;
begin
  if length(trim(p_name)) = 0 or length(trim(p_organizer_name)) = 0 then
    raise exception 'Event name and organizer name are required';
  end if;
  if p_organizer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid organizer email is required';
  end if;

  -- 6-char code from an unambiguous alphabet; retry on the rare collision
  loop
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (random() * 30)::int + 1, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from events where code = v_code);
  end loop;

  insert into events (code, name, organizer_name, organizer_email)
  values (v_code, left(trim(p_name), 120), left(trim(p_organizer_name), 120), lower(trim(p_organizer_email)))
  returning organizer_token into v_token;

  return json_build_object('code', v_code, 'organizer_token', v_token);
end;
$$;

create or replace function public.get_event_public(p_code text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'code', e.code,
    'name', e.name,
    'status', e.status,
    'checkin_count', (select count(*) from checkins c where c.event_id = e.id)
  )
  from events e
  where e.code = p_code;
$$;

create or replace function public.check_in(
  p_code text,
  p_name text,
  p_email text,
  p_company text,
  p_linkedin text,
  p_share boolean
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
begin
  select * into v_event from events where code = p_code;
  if not found then
    raise exception 'Event not found';
  end if;
  if v_event.status <> 'open' then
    raise exception 'This event has ended — check-in is closed.';
  end if;
  if length(trim(p_name)) = 0 then
    raise exception 'Name is required';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;

  insert into checkins (event_id, name, email, company, linkedin, share_contact)
  values (
    v_event.id,
    left(trim(p_name), 120),
    lower(trim(p_email)),
    nullif(left(trim(coalesce(p_company, '')), 160), ''),
    nullif(left(trim(coalesce(p_linkedin, '')), 255), ''),
    coalesce(p_share, true)
  )
  on conflict (event_id, email) do update
    set name = excluded.name,
        company = excluded.company,
        linkedin = excluded.linkedin,
        share_contact = excluded.share_contact;

  return get_event_public(p_code);
end;
$$;

create or replace function public.get_event_host(p_code text, p_token uuid)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'code', e.code,
    'name', e.name,
    'status', e.status,
    'organizer_name', e.organizer_name,
    'organizer_email', e.organizer_email,
    'checkin_count', (select count(*) from checkins c where c.event_id = e.id),
    'attendees', coalesce(
      (select json_agg(json_build_object(
         'name', c.name,
         'email', c.email,
         'company', c.company,
         'linkedin', c.linkedin,
         'share_contact', c.share_contact,
         'created_at', c.created_at
       ) order by c.created_at)
       from checkins c where c.event_id = e.id),
      '[]'::json
    )
  )
  from events e
  where e.code = p_code and e.organizer_token = p_token;
$$;

grant execute on function
  public.create_event(text, text, text),
  public.get_event_public(text),
  public.check_in(text, text, text, text, text, boolean),
  public.get_event_host(text, uuid)
to anon, authenticated;
