const OMIE_URL = process.env.OMIE_API_URL ?? "https://app.omie.com.br/api/v1";
const APP_KEY = process.env.OMIE_APP_KEY ?? "8463170967";
const APP_SECRET = process.env.OMIE_APP_SECRET ?? "69e22b773842044fdb218178521cac59";

async function omieCall<T>(endpoint: string, call: string, param: unknown): Promise<T> {
  const res = await fetch(`${OMIE_URL}/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: APP_KEY, app_secret: APP_SECRET, param: [param] }),
  });
  if (!res.ok) throw new Error(`Omie ${call} HTTP ${res.status}`);
  const json = await res.json() as { faultstring?: string } & T;
  if (json.faultstring) throw new Error(`Omie ${call}: ${json.faultstring}`);
  return json;
}

export type OmiePedido = {
  cabecalho: {
    codigo_pedido: number;
    numero_pedido: string;
    codigo_cliente: number;
    data_previsao: string;
    etapa: string;
  };
  total_pedido: { valor_total_pedido: number };
  frete?: { codigo_rastreio?: string; previsao_entrega?: string; nome_transportador?: string };
  informacoes_adicionais?: { dados_adicionais_nf?: string; [key: string]: unknown };
  observacoes?: { obs_venda?: string };
  infoCadastro?: { faturado?: string; dFat?: string };
  det?: Array<{ produto?: { codigo_produto: number; descricao: string; valor_total: number } }>;
};

export type OmieCliente = {
  codigo_cliente_omie: number;
  razao_social: string;
  nome_fantasia?: string;
  cnpj_cpf: string;
  email?: string;
  telefone1_ddd?: string;
  telefone1_numero?: string;
  contato?: string;
};

export async function listarPedidosFaturados(dataInicio: string, dataFim: string): Promise<OmiePedido[]> {
  // dataInicio/dataFim formato DD/MM/YYYY
  const result = await omieCall<{ pedido_venda_produto: OmiePedido[]; paginacao: { total_registros: number } }>(
    "produtos/pedido",
    "ListarPedidos",
    {
      pagina: 1,
      registros_por_pagina: 100,
      filtrar_por_data_de: dataInicio,
      filtrar_por_data_ate: dataFim,
      apenas_faturado: "S",
    }
  );
  return result.pedido_venda_produto ?? [];
}

export async function consultarPedido(codigoPedido: number): Promise<OmiePedido> {
  const result = await omieCall<{ pedido_venda_produto: OmiePedido }>(
    "produtos/pedido",
    "ConsultarPedido",
    { codigo_pedido: codigoPedido }
  );
  return result.pedido_venda_produto;
}

export async function consultarCliente(codigoCliente: number): Promise<OmieCliente> {
  const result = await omieCall<{ clientes_cadastro: OmieCliente[] }>(
    "geral/clientes",
    "ListarClientes",
    { pagina: 1, registros_por_pagina: 1, filtrar_apenas_omiekey: String(codigoCliente) }
  );
  const cliente = result.clientes_cadastro?.[0];
  if (!cliente) throw new Error(`Cliente Omie ${codigoCliente} não encontrado`);
  return cliente;
}

export function classificarABC(valorTotal: number): "A" | "B" | "C" {
  if (valorTotal >= 50000) return "A";
  if (valorTotal >= 10000) return "B";
  return "C";
}

export function parseDateBR(dateBR: string): string {
  // DD/MM/YYYY → YYYY-MM-DD
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}

export async function incluirAnexoOmie(
  codigoPedido: number,
  nomeArquivo: string,
  mimeType: string,
  base64Conteudo: string,
): Promise<void> {
  await omieCall("geral/anexos", "IncluirAnexo", {
    nCodigo: codigoPedido,
    cTabela: "PC",
    cNome: nomeArquivo,
    cMimeType: mimeType,
    cConteudo: base64Conteudo,
  });
}

export async function alterarObsPedidoFaturado(codigoPedido: number, novaObs: string): Promise<void> {
  // Tenta buscar obs atual para não sobrescrever
  let obsAtual = "";
  try {
    const pedido = await consultarPedido(codigoPedido);
    obsAtual = pedido.observacoes?.obs_venda ?? "";
  } catch {
    // segue sem obs anterior
  }
  const dataHoje = new Date().toLocaleDateString("pt-BR");
  const linha = `PV360 ${dataHoje}: ${novaObs.trim()}`;
  const obsCompleta = obsAtual ? `${obsAtual}\n${linha}` : linha;

  // Tenta wrapper padrão; se falhar, tenta formato plano
  try {
    await omieCall("produtos/pedido", "AlterarPedFaturado", {
      pedido_venda_produto: {
        cabecalho: { codigo_pedido: codigoPedido },
        observacoes: { obs_venda: obsCompleta },
      },
    });
  } catch (e1) {
    await omieCall("produtos/pedido", "AlterarPedFaturado", {
      codigo_pedido: codigoPedido,
      obs_venda: obsCompleta,
    }).catch((e2) => {
      throw new Error(`Omie não aceitou a alteração: ${(e2 as Error).message} (antes: ${(e1 as Error).message})`);
    });
  }
}
