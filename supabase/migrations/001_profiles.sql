-- Profiles: one row per auth user
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New user',
  wallet_address text unique check (wallet_address is null or wallet_address = lower(wallet_address)),
  wallet_type text check (wallet_type in ('external', 'wdk')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Signed-in users can read profiles (buyers need to see the seller's name)
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

-- Users can update only their own row...
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ...and only these columns (is_admin can never be self-granted)
revoke update on public.profiles from authenticated, anon;
grant update (display_name, wallet_address, wallet_type) on public.profiles to authenticated;

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'New user'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();