-- Devoluções de produto são um dos indicadores de prejuízo mais importantes
-- do pós-venda e não tinham nenhum lugar pra viver no schema. O Omie já
-- marca isso por pedido (infoCadastro.devolvido / devolvido_parcial, via
-- ConsultarPedido) — só nunca era capturado. sync-faturamento passa a
-- gravar aqui na mesma passada que já consulta o pedido pra checar
-- faturamento, sem chamada extra à API do Omie.
ALTER TABLE sac_notas_fiscais
  ADD COLUMN IF NOT EXISTS devolvido BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS devolvido_parcial BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sac_nf_devolvido ON sac_notas_fiscais(devolvido) WHERE devolvido = true;
CREATE INDEX IF NOT EXISTS idx_sac_nf_devolvido_parcial ON sac_notas_fiscais(devolvido_parcial) WHERE devolvido_parcial = true;
