create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;

create policy "Users read own todos"
  on public.todos for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own todos"
  on public.todos for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own todos"
  on public.todos for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own todos"
  on public.todos for delete
  to authenticated
  using (auth.uid() = user_id);
