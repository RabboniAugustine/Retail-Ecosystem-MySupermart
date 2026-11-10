-- ============================================================================
-- 004_owner_creates_staff.sql
-- The owner creates staff logins (username + password) from the Staff page.
-- Staff no longer sign themselves up. Safe to run more than once. Run AFTER 003.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Usernames without an "@" are stored as <username>@staff.mysupermart
-- (it is never emailed; it only makes the login unique).

-- Is the app still waiting for its first (owner) account? Used by the login
-- page to decide whether to show "Create owner account".
create or replace function public.ms_setup_needed()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.ms_profiles where role = 'owner');
$$;
revoke execute on function public.ms_setup_needed() from public;
grant execute on function public.ms_setup_needed() to anon, authenticated;

-- Owner creates a staff login. Returns the new user's id.
create or replace function public.ms_create_staff(p_full_name text, p_login text, p_password text, p_role text default 'sales')
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(p_login));
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can create staff accounts'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Enter the staff member''s name'; end if;
  if v_email = '' then raise exception 'Enter a username'; end if;
  if v_email !~ '^[a-z0-9._@+-]+$' then raise exception 'Username can only use letters, numbers, dots, dashes and underscores'; end if;
  if position('@' in v_email) = 0 then v_email := v_email || '@staff.mysupermart'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if p_role not in ('sales', 'owner') then raise exception 'Unknown role %', p_role; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'That username is already taken';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name)), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- The sign-up trigger created the profile as 'pending'; set the real details.
  insert into public.ms_profiles (id, full_name, email, role)
  values (v_id, trim(p_full_name), v_email, p_role)
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role;

  return v_id;
end;
$$;

-- Owner sets a new password for a staff member (e.g. they forgot it).
create or replace function public.ms_reset_staff_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.ms_is_owner() then raise exception 'Only the owner can reset passwords'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if not exists (select 1 from public.ms_profiles where id = p_user_id) then raise exception 'Staff member not found'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf', 10)), updated_at = now()
  where id = p_user_id;
end;
$$;

revoke execute on function public.ms_create_staff(text, text, text, text) from public, anon;
revoke execute on function public.ms_reset_staff_password(uuid, text) from public, anon;
grant execute on function public.ms_create_staff(text, text, text, text) to authenticated;
grant execute on function public.ms_reset_staff_password(uuid, text) to authenticated;
