-- ============================================================
-- AMWALI 4.0 - Database Updates & Additions
-- ============================================================

-- 1. إضافة حقول تتبع الدورة المالية في جدول الراتب
alter table salaries add column if not exists cycle_end_date date;
alter table salaries add column if not exists savings_transferred boolean default false;
alter table salaries add column if not exists remaining_transferred_amount numeric(14,2) default 0;

-- 2. إنشاء جدول سجل تحويلات الراتب للمدخرات
create table if not exists salary_savings_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  salary_id uuid not null references salaries on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  transfer_date date not null,
  created_at timestamptz default now()
);

alter table salary_savings_transfers enable row level security;
create policy "own_salary_transfers" on salary_savings_transfers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. إنشاء جدول الإشعارات الذكية
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  message text not null,
  type text default 'info',
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;
create policy "own_notifications" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. إضافة دالة إعادة تعيين بيانات الحساب بأمان
create or replace function reset_user_financial_data(target_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.uid() <> target_user_id then
    raise exception 'Unauthorized';
  end if;

  delete from transactions where user_id = target_user_id;
  delete from income where user_id = target_user_id;
  delete from salaries where user_id = target_user_id;
  delete from budgets where user_id = target_user_id;
  delete from savings_contributions where user_id = target_user_id;
  delete from savings_goals where user_id = target_user_id;
  delete from debt_payments where user_id = target_user_id;
  delete from debts where user_id = target_user_id;
  delete from recurring_transactions where user_id = target_user_id;
  delete from salary_savings_transfers where user_id = target_user_id;
  delete from notifications where user_id = target_user_id;

  update user_settings set onboarding_completed = false where user_id = target_user_id;
end; $$;
