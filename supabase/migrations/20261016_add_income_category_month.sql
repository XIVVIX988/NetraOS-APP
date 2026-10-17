-- Power-Up income rows sync their category and cycle month as top-level columns.
-- Apply this migration to existing Supabase projects; safe to run more than once.
alter table public.incomes
  add column if not exists category text not null default '',
  add column if not exists month text not null default '';

notify pgrst, 'reload schema';
