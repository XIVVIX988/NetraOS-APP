-- Add columns written by the current Power-Up sync code to existing projects.
-- Safe to run more than once; existing rows receive empty default values.
alter table public.incomes
  add column if not exists category text not null default '',
  add column if not exists month text not null default '';

alter table public.budget_lines
  add column if not exists month text not null default '';

notify pgrst, 'reload schema';
