-- Require a successfully verified MFA factor for every account-data request.
-- Apply after the NetraOS schema has been installed.
begin;

do $$
declare t text;
begin
  foreach t in array array['user_profiles','user_settings','entries','incomes','budget_lines','spending','goals','achievements','currency_rates','tax_profile','audit_log','consents'] loop
    execute format('drop policy if exists owner_access on public.%I', t);
    execute format('create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid()) and (select auth.jwt() ->> ''aal'') = ''aal2'') with check (user_id = (select auth.uid()) and (select auth.jwt() ->> ''aal'') = ''aal2'')', t);
  end loop;
end $$;

commit;
