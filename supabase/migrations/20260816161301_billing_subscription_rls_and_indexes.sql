-- Billing read/write policies and foreign-key indexes identified by the
-- Supabase database advisors after the activation rollout.

create index if not exists billing_subscriptions_purchased_by_idx
  on public.billing_subscriptions(purchased_by) where purchased_by is not null;
create index if not exists billing_subscriptions_verified_by_idx
  on public.billing_subscriptions(verified_by) where verified_by is not null;
create index if not exists billing_subscriptions_comp_granted_by_idx
  on public.billing_subscriptions(comp_granted_by) where comp_granted_by is not null;
create index if not exists school_billing_quotes_activated_subscription_idx
  on public.school_billing_quotes(activated_subscription_id) where activated_subscription_id is not null;

drop policy if exists "School members can view own subscription" on public.billing_subscriptions;
drop policy if exists "Service role manages billing subscriptions" on public.billing_subscriptions;
drop policy if exists billing_subscriptions_authorized_read on public.billing_subscriptions;
drop policy if exists billing_subscriptions_superadmin_insert on public.billing_subscriptions;
drop policy if exists billing_subscriptions_superadmin_update on public.billing_subscriptions;
drop policy if exists billing_subscriptions_superadmin_delete on public.billing_subscriptions;

create policy billing_subscriptions_authorized_read
  on public.billing_subscriptions for select to authenticated
  using (
    school_id in (
      select u.school_id from public.users u
      where u.id=(select auth.uid()) and u.school_id is not null
    )
    or public.is_superadmin((select auth.uid()))
  );
create policy billing_subscriptions_superadmin_insert
  on public.billing_subscriptions for insert to authenticated
  with check (public.is_superadmin((select auth.uid())));
create policy billing_subscriptions_superadmin_update
  on public.billing_subscriptions for update to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));
create policy billing_subscriptions_superadmin_delete
  on public.billing_subscriptions for delete to authenticated
  using (public.is_superadmin((select auth.uid())));

comment on policy billing_subscriptions_authorized_read on public.billing_subscriptions is
  'One optimized read policy for same-school users and Brains Heist superadministrators. Service role bypasses RLS.';
