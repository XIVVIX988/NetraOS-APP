-- Restore owner-only data access without requiring an authenticator factor.
-- Apply after 20261015_require_totp_aal2.sql if that migration was used.
begin;

do $$
declare t text;
begin
  foreach t in array array['user_profiles','user_settings','entries','incomes','budget_lines','spending','goals','achievements','currency_rates','tax_profile','audit_log','consents'] loop
    execute format('drop policy if exists owner_access on public.%I', t);
    execute format('create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

commit;
