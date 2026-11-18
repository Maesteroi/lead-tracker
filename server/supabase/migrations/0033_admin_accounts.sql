-- Maesteroi Lead Tracker — حساب عميل من لوحة الإدارة + تنبيه الدفعة القادمة (18 نوفمبر).
-- 1) دعوة «مالك»: الإدارة بتجهّز حساب العميل وتدعوه بإيميله، فالدعوة لازم تسمح بدور owner.
alter table org_invites drop constraint if exists org_invites_role_check;
alter table org_invites add constraint org_invites_role_check check (role in ('owner','admin','staff','viewer'));
-- 2) تنبيه الدفعة القادمة (تيليجرام): آخر موعد اتنبّه عليه ومرحلة التنبيه (7 · 3 · 1 · 0 أيام)، علشان التنبيه ما يتكررش.
alter table organizations add column if not exists renew_notified_for   timestamptz;
alter table organizations add column if not exists renew_notified_stage integer;
