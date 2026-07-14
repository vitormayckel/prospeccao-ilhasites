-- =====================================================================
-- Ilha Prospect — Migration 0003: triggers de updated_at
-- Mantém updated_at coerente mesmo em escritas fora da aplicação.
-- =====================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'search_profiles', 'search_profile_locations',
    'search_profile_categories', 'search_runs', 'companies',
    'company_sources', 'company_field_evidence', 'ai_analyses',
    'company_notes', 'message_templates', 'messages', 'follow_ups',
    'integration_settings', 'job_queue'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create trigger trg_%1$s_updated_at
         before update on %1$s
         for each row execute function set_updated_at();',
      t
    );
  end loop;
end;
$$;
