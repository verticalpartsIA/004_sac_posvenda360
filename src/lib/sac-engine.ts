import { createClient } from "@supabase/supabase-js";
import { classificarABC, parseDateBR, type OmiePedido, type OmieCliente } from "./omie-client";

const SB_URL = process.env.SUPABASE_URL ?? "https://jkbklzlbhhfnamaeislb.supabase.co";
const getSb = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não definida");
  return createClient(SB_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const EVO_URL = process.env.EVOLUTION_URL ?? "http://72.61.48.156:8080";
const EVO_KEY = process.env.EVOLUTION_APIKEY ?? (() => { throw new Error("EVOLUTION_APIKEY não definida"); })();
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "pv360";

async function enviarWhatsApp(numero: string, mensagem: string): Promise<boolean> {
  try {
    const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({
        number: numero.replace(/\D/g, ""),
        text: mensagem,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[sac-engine] enviarWhatsApp erro:", err);
    return false;
  }
}

async function registrarLog(
  sb: ReturnType<typeof getSb>,
  nfId: string,
  canal: "WHATSAPP" | "EMAIL",
  tipo: "PRE_ENTREGA" | "POS_ENTREGA" | "PESQUISA" | "ALERTA_ATRASO" | "VIP_FOLLOWUP",
  destinatario: string,
  conteudo: string,
  status: "ENVIADO" | "ERRO"
) {
  await sb.from("sac_logs_comunicacao").insert({
    nf_id: nfId,
    canal,
    tipo_mensagem: tipo,
    status_envio: status,
    destinatario,
    conteudo_mensagem: conteudo,
  });
}

function mensagemVIP(nfNumero: string, cliente: string, rastreio?: string): string {
  return `Olá, ${cliente}! 👋\n\nSou da equipe VerticalParts. Sua NF *${nfNumero}* foi emitida e está sendo preparada para envio.${rastreio ? `\n\n📦 Rastreio: *${rastreio}*` : ""}\n\nEstamos à disposição para qualquer dúvida. Bom dia! 🙂`;
}

function mensagemPesquisa(nfNumero: string, cliente: string, token: string): string {
  const url = `https://posvenda360.vpsistema.com/nps/form/${token}`;
  return `Olá, ${cliente}! 😊\n\nSua entrega referente à NF *${nfNumero}* foi concluída.\n\nGostaríamos muito de saber sua opinião. Leva menos de 1 minuto:\n👉 ${url}\n\nObrigado pela parceria! — VerticalParts`;
}

function mensagemAlertaAtraso(nfNumero: string, cliente: string): string {
  return `Olá, ${cliente}.\n\nIdentificamos que a entrega da NF *${nfNumero}* pode estar com atraso. Nossa equipe já está verificando a situação junto à transportadora e retornaremos em breve.\n\nPedimos desculpas pelo transtorno. — VerticalParts`;
}

export async function triggerPosVendaFlow(nfId: string, classeAbc: "A" | "B" | "C") {
  const sb = getSb();

  const { data: nf } = await sb
    .from("sac_notas_fiscais")
    .select("*, sac_clientes(*)")
    .eq("id", nfId)
    .single();

  if (!nf) return;

  const cliente = (nf as any).sac_clientes;
  const whatsapp = cliente?.whatsapp || cliente?.telefone;
  const nomeCliente = cliente?.nome_fantasia || cliente?.razao_social || "Cliente";

  // DECIDE — Classe A: mensagem VIP imediata
  if (classeAbc === "A" && whatsapp) {
    const msg = mensagemVIP(nf.nf_numero, nomeCliente, nf.codigo_rastreio);
    const ok = await enviarWhatsApp(whatsapp, msg);
    await registrarLog(sb, nfId, "WHATSAPP", "VIP_FOLLOWUP", whatsapp, msg, ok ? "ENVIADO" : "ERRO");
  }

  // DECIDE — Verificar atraso
  if (nf.previsao_entrega && nf.status_entrega !== "ENTREGUE") {
    const hoje = new Date();
    const previsao = new Date(nf.previsao_entrega);
    if (hoje > previsao && whatsapp) {
      await sb.from("sac_notas_fiscais").update({ status_entrega: "ATRASADA" }).eq("id", nfId);
      const msg = mensagemAlertaAtraso(nf.nf_numero, nomeCliente);
      const ok = await enviarWhatsApp(whatsapp, msg);
      await registrarLog(sb, nfId, "WHATSAPP", "ALERTA_ATRASO", whatsapp, msg, ok ? "ENVIADO" : "ERRO");
    }
  }
}

export async function dispararPesquisaSatisfacao(nfId: string) {
  const sb = getSb();

  const { data: nf } = await sb
    .from("sac_notas_fiscais")
    .select("*, sac_clientes(*)")
    .eq("id", nfId)
    .single();

  if (!nf || nf.pesquisa_enviada) return;

  // Criar pesquisa
  const { data: pesquisa } = await sb
    .from("sac_pesquisas")
    .insert({ nf_id: nfId })
    .select("token")
    .single();

  if (!pesquisa?.token) return;

  const cliente = (nf as any).sac_clientes;
  const whatsapp = cliente?.whatsapp || cliente?.telefone;
  const nomeCliente = cliente?.nome_fantasia || cliente?.razao_social || "Cliente";

  if (whatsapp) {
    const msg = mensagemPesquisa(nf.nf_numero, nomeCliente, pesquisa.token);
    const ok = await enviarWhatsApp(whatsapp, msg);
    await registrarLog(sb, nfId, "WHATSAPP", "PESQUISA", whatsapp, msg, ok ? "ENVIADO" : "ERRO");
  }

  await sb
    .from("sac_notas_fiscais")
    .update({ pesquisa_enviada: true, pesquisa_enviada_em: new Date().toISOString() })
    .eq("id", nfId);
}

export async function ingerirNFdoOmie(pedido: OmiePedido, cliente: OmieCliente) {
  const sb = getSb();
  const valorTotal = pedido.total_pedido.valor_total_pedido;
  const classeAbc = classificarABC(valorTotal);
  const cnpj = cliente.cnpj_cpf.replace(/\D/g, "");
  const telefone = cliente.telefone1_ddd && cliente.telefone1_numero
    ? `${cliente.telefone1_ddd}${cliente.telefone1_numero}`.replace(/\D/g, "")
    : null;

  // Upsert cliente
  const { data: clienteDb } = await sb
    .from("sac_clientes")
    .upsert(
      {
        cnpj,
        razao_social: cliente.razao_social,
        nome_fantasia: cliente.nome_fantasia ?? null,
        classe_abc: classeAbc,
        email: cliente.email ?? null,
        telefone,
        whatsapp: telefone,
        contato: cliente.contato ?? null,
        codigo_omie: cliente.codigo_cliente_omie,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cnpj" }
    )
    .select("id")
    .single();

  const clienteId = clienteDb?.id ?? null;

  const dataEmissao = pedido.infoCadastro?.dFat
    ? parseDateBR(pedido.infoCadastro.dFat)
    : new Date().toISOString().slice(0, 10);

  const previsaoEntrega = pedido.frete?.previsao_entrega
    ? parseDateBR(pedido.frete.previsao_entrega)
    : null;

  // Upsert NF
  const { data: nfDb } = await sb
    .from("sac_notas_fiscais")
    .upsert(
      {
        nf_numero: pedido.cabecalho.numero_pedido,
        cliente_id: clienteId,
        cnpj_cliente: cnpj,
        razao_social_cliente: cliente.razao_social,
        classe_abc: classeAbc,
        data_emissao: dataEmissao,
        valor_total: valorTotal,
        transportadora: pedido.frete?.nome_transportador ?? null,
        codigo_rastreio: pedido.frete?.codigo_rastreio ?? null,
        previsao_entrega: previsaoEntrega,
        status_entrega: "EMITIDA",
        codigo_pedido_omie: pedido.cabecalho.codigo_pedido,
        dados_omie: pedido as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "nf_numero" }
    )
    .select("id")
    .single();

  const nfId = nfDb?.id;
  if (nfId) {
    void triggerPosVendaFlow(nfId, classeAbc);
  }

  return { nfId, classeAbc };
}
