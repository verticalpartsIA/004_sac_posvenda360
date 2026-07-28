-- Histórico de chamadas/contatos do SAC com o cliente. Uma NF pode ter várias
-- interações ao longo do tempo (ligações, WhatsApp, etc.) — cada uma vira uma
-- linha aqui, em vez de um único campo de "data do contato" em sac_notas_fiscais.
create table if not exists sac_chamados (
  id uuid primary key default gen_random_uuid(),
  nf_id uuid not null references sac_notas_fiscais(id) on delete cascade,
  data_contato date not null,
  responsavel text,
  conteudo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sac_chamados_nf on sac_chamados(nf_id, data_contato desc);

alter table sac_chamados enable row level security;

create policy "auth_all_sac_chamados" on sac_chamados for all to authenticated using (true) with check (true);
create policy "service_all_sac_chamados" on sac_chamados for all to service_role using (true) with check (true);

grant select, insert, update, delete on table sac_chamados to authenticated, service_role;
