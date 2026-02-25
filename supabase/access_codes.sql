create table if not exists public.access_codes (
  code text primary key,
  is_used boolean not null default false,
  used_by text,
  used_at timestamptz
);

alter table public.access_codes enable row level security;

create policy if not exists "allow_read_code"
on public.access_codes
for select
using (true);

create policy if not exists "allow_consume_unused_code"
on public.access_codes
for update
using (is_used = false)
with check (is_used = true);

-- Example seed codes (replace with your own)
insert into public.access_codes (code)
values
  ('SERC-BUYER-001'),
  ('SERC-BUYER-002')
on conflict (code) do nothing;
