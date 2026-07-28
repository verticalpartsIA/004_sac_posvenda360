-- Sincronização Omie -> sac_notas_fiscais em tempo quase real (substitui a
-- dependência do webhook do Omie / do carregamento manual da tela /sac).
-- pg_cron dispara a Edge Function omie-sync-nfs a cada 1 minuto; ela varre uma
-- janela rolante de 3 dias em nfconsultar/ListarNF e faz upsert idempotente.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Token interno para autenticar a chamada pg_cron -> Edge Function (a função
-- roda com verify_jwt=false e valida este token no header x-sync-token).
-- RLS sem policies: só o service_role (usado pela Edge Function) enxerga a linha.
create table if not exists app_internal_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table app_internal_secrets enable row level security;

insert into app_internal_secrets (key, value)
values ('omie_sync_token', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

select cron.schedule(
  'omie-sync-nfs-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://jkbklzlbhhfnamaeislb.supabase.co/functions/v1/omie-sync-nfs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select value from app_internal_secrets where key = 'omie_sync_token')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
