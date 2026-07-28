// Sincroniza NFs/pedidos do Omie -> sac_notas_fiscais + sac_clientes.
// Chamada a cada 1 min via pg_cron (janela rolante dos últimos 3 dias) e,
// manualmente, para o backfill histórico via ?data_de=DD/MM/YYYY&data_ate=DD/MM/YYYY.
// Autenticação própria (x-sync-token) em vez do gateway JWT do Supabase — a função
// roda com verify_jwt=false; ver migration app_internal_secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OMIE_APP_KEY = Deno.env.get("OMIE_APP_KEY") ?? "";
const OMIE_APP_SECRET = Deno.env.get("OMIE_APP_SECRET") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function classificarABC(valor: number) {
  if (valor >= 50000) return "A";
  if (valor >= 10000) return "B";
  return "C";
}

function parseDateBR(d?: string | null) {
  if (!d || typeof d !== "string" || !d.includes("/")) return null;
  const [dd, mm, yyyy] = d.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function addDiasBR(dataBR: string, dias: number) {
  const [d, m, y] = dataBR.split("/").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
}

function hojeBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function omieCall(endpoint: string, call: string, param: Record<string, unknown>) {
  const r = await fetch(`https://app.omie.com.br/api/v1/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: OMIE_APP_KEY, app_secret: OMIE_APP_SECRET, param: [param] }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.faultstring) {
    throw new Error(`Omie ${call}: ${data.faultstring || `HTTP ${r.status}`}`);
  }
  return data;
}

// deno-lint-ignore no-explicit-any
async function ingerirNF(nfData: any) {
  const nfNumeroBruto = String(nfData.compl?.nNumNF || nfData.ide?.nNF || "?");
  const nfNumero = /^\d+$/.test(nfNumeroBruto) ? String(Number(nfNumeroBruto)) : nfNumeroBruto;
  const chaveNFe = nfData.compl?.cChaveNFe || null;
  const dataEmissao = parseDateBR(nfData.ide?.dEmi) || new Date().toISOString().slice(0, 10);
  const valorTotal = Number(nfData.total?.ICMSTot?.vNF ?? nfData.total?.vNF ?? 0);
  const classeAbc = classificarABC(valorTotal);
  const cnpjRaw = String(nfData.nfDestInt?.cnpj_cpf || nfData.nfDestInt?.cCPFCNPJ || "").replace(/\D/g, "");
  const razaoSocial = nfData.nfDestInt?.cRazao || nfData.nfDestInt?.cNome || "—";
  const codigoOmie = nfData.nfDestInt?.nCodCli || null;
  const transportadora = nfData.transp?.transporta?.xNome || null;
  const codigoPedido = nfData.compl?.nIdPedido ? Number(nfData.compl.nIdPedido) : null;

  if (!cnpjRaw) throw new Error(`NF ${nfNumero} sem CNPJ do destinatário`);

  const { data: cli, error: cliErr } = await sb
    .from("sac_clientes")
    .upsert(
      {
        cnpj: cnpjRaw,
        razao_social: razaoSocial,
        classe_abc: classeAbc,
        codigo_omie: codigoOmie,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cnpj" },
    )
    .select("id")
    .single();
  if (cliErr) throw new Error(`upsert sac_clientes: ${cliErr.message}`);
  const clienteId = cli?.id ?? null;

  const { data: existing } = await sb
    .from("sac_notas_fiscais")
    .select("id, codigo_rastreio, numero_pedido_omie, previsao_entrega")
    .eq("nf_numero", nfNumero)
    .eq("cnpj_cliente", cnpjRaw)
    .maybeSingle();

  let codigoRastreio = existing?.codigo_rastreio ?? null;
  let numeroPedidoOmie = existing?.numero_pedido_omie ?? null;
  let previsaoEntrega = existing?.previsao_entrega ?? null;

  // Completa dados de expedição via ConsultarPedido só quando ainda faltam
  // (evita 1 chamada extra por NF em toda janela quando já está tudo preenchido).
  if (codigoPedido && (!codigoRastreio || !numeroPedidoOmie)) {
    try {
      const pedidoResp = await omieCall("produtos/pedido", "ConsultarPedido", { codigo_pedido: codigoPedido });
      const pedido = pedidoResp.pedido_venda_produto;
      if (pedido?.cabecalho) {
        numeroPedidoOmie = String(pedido.cabecalho.numero_pedido ?? codigoPedido);
        codigoRastreio = pedido.frete?.codigo_rastreio || codigoRastreio;
        previsaoEntrega = parseDateBR(pedido.frete?.previsao_entrega) || previsaoEntrega;
      }
    } catch (e) {
      console.error(`ConsultarPedido(${codigoPedido}):`, (e as Error).message);
    }
  }

  const nfBody = {
    nf_numero: nfNumero,
    chave_nfe: chaveNFe,
    cliente_id: clienteId,
    cnpj_cliente: cnpjRaw,
    razao_social_cliente: razaoSocial,
    classe_abc: classeAbc,
    data_emissao: dataEmissao,
    faturado: true,
    data_faturamento: dataEmissao,
    valor_total: valorTotal,
    transportadora,
    codigo_rastreio: codigoRastreio,
    previsao_entrega: previsaoEntrega,
    codigo_pedido_omie: codigoPedido,
    numero_pedido_omie: numeroPedidoOmie,
    dados_omie: nfData,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    // Não inclui status_entrega/status_pos_venda — não sobrescreve progresso já
    // registrado manualmente (ex.: ENTREGUE) a cada nova varredura da janela.
    const { error } = await sb.from("sac_notas_fiscais").update(nfBody).eq("id", existing.id);
    if (error) throw new Error(`update sac_notas_fiscais: ${error.message}`);
  } else {
    const { error } = await sb.from("sac_notas_fiscais").insert({ ...nfBody, status_entrega: "EMITIDA" });
    if (error) throw new Error(`insert sac_notas_fiscais: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
      return new Response(
        JSON.stringify({ ok: false, error: "OMIE_APP_KEY/OMIE_APP_SECRET não configurados nos secrets da função" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const token = req.headers.get("x-sync-token");
    const { data: secretRow } = await sb
      .from("app_internal_secrets")
      .select("value")
      .eq("key", "omie_sync_token")
      .maybeSingle();
    if (!secretRow || !token || token !== secretRow.value) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const dataDeParam = url.searchParams.get("data_de");
    const dataAteParam = url.searchParams.get("data_ate");
    const maxPaginas = Number(url.searchParams.get("max_paginas") ?? "10");

    const hoje = hojeBR();
    const dataDe = dataDeParam || addDiasBR(hoje, -3);
    const dataAte = dataAteParam || hoje;

    let pagina = 1;
    let totalPaginas = 1;
    const stats = { total: 0, processed: 0, errors: [] as Array<{ nf: string; error: string }> };

    while (pagina <= totalPaginas && pagina <= maxPaginas) {
      const data = await omieCall("produtos/nfconsultar", "ListarNF", {
        pagina,
        registros_por_pagina: 100,
        dEmiInicial: dataDe,
        dEmiFinal: dataAte,
        tpNF: "1",
        filtrar_por_status: "N",
      });
      totalPaginas = data.total_de_paginas ?? data.nTotPag ?? 1;
      const nfs = data.nfCadastro ?? data.nfsCadastro ?? [];

      for (const nf of nfs) {
        stats.total++;
        const nfNum = String(nf.compl?.nNumNF || nf.ide?.nNF || "?");
        try {
          await ingerirNF(nf);
          stats.processed++;
        } catch (e) {
          stats.errors.push({ nf: nfNum, error: (e as Error).message });
        }
      }
      pagina++;
    }

    return new Response(JSON.stringify({ ok: true, data_de: dataDe, data_ate: dataAte, ...stats }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
