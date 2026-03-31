create extension if not exists pgcrypto;

create table if not exists public.purchases (
  id bigserial primary key,
  paypal_capture_id text not null unique,
  paypal_order_id text,
  payer_email text not null,
  payer_name text,
  amount numeric(10, 2),
  currency text,
  payment_link text,
  status text not null default 'COMPLETED',
  issued_code text not null unique references public.access_codes(code),
  email_sent boolean not null default false,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

create or replace function public.record_purchase_and_issue_code(
  p_paypal_capture_id text,
  p_paypal_order_id text,
  p_payer_email text,
  p_payer_name text,
  p_amount numeric,
  p_currency text,
  p_payment_link text
)
returns table (issued_code text)
language plpgsql
security definer
as $$
declare
  candidate_code text;
  existing_code text;
begin
  select purchases.issued_code
    into existing_code
  from public.purchases
  where purchases.paypal_capture_id = p_paypal_capture_id;

  if existing_code is not null then
    return query select existing_code;
    return;
  end if;

  loop
    candidate_code := 'SERC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.access_codes (code, is_used)
      values (candidate_code, false);
      exit;
    exception when unique_violation then
      -- try another random code
    end;
  end loop;

  insert into public.purchases (
    paypal_capture_id,
    paypal_order_id,
    payer_email,
    payer_name,
    amount,
    currency,
    payment_link,
    status,
    issued_code
  )
  values (
    p_paypal_capture_id,
    p_paypal_order_id,
    lower(trim(p_payer_email)),
    p_payer_name,
    p_amount,
    p_currency,
    p_payment_link,
    'COMPLETED',
    candidate_code
  );

  return query select candidate_code;
end;
$$;

grant execute on function public.record_purchase_and_issue_code(
  text,
  text,
  text,
  text,
  numeric,
  text,
  text
) to anon, authenticated, service_role;
