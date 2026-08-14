import { sbFetch, erpFetch, evoSendText, _enc, _digits, _mascaraDoc, ANTHROPIC_KEY, CLAUDE_MODEL } from "../http.mjs";
import { omieCall } from "../integrations/omie.mjs";
import { holidaysFor } from "../../../src/lib/domain/feriados.js";
import { BUSINESS_HOURS, prazoUtilMs } from "../../../src/lib/domain/prazo.js";

// Data/hora atual no fuso de São Paulo
function nowSaoPaulo() {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "long", hour12: false,
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value;
  const y = +g("year"), mo = +g("month"), da = +g("day");
  return {
    year: y, monthDay: `${g("month")}-${g("day")}`, hour: +g("hour"), minute: +g("minute"),
    dow: new Date(Date.UTC(y, mo - 1, da)).getUTCDay(), weekdayName: g("weekday"),
    dateStr: `${g("day")}/${g("month")}/${g("year")}`, timeStr: `${g("hour")}h${g("minute")}`,
  };
}

const HORARIO_TXT = "Segunda a Quinta das 07h às 18h; Sexta das 07h às 17h. Fechado aos sábados, domingos e feriados.";

// Bloco dinâmico injetado a cada resposta: sabe a data/hora e se está aberto/feriado
function atendimentoContexto() {
  const n = nowSaoPaulo();
  const hol = holidaysFor(n.year)[n.monthDay];
  const hours = BUSINESS_HOURS[n.dow];
  let status;
  if (hol) status = `Hoje é FERIADO (${hol}) — nossos atendentes não estão disponíveis hoje.`;
  else if (!hours) status = "Hoje é fim de semana — nossos atendentes não estão disponíveis.";
  else {
    const aberto = n.hour >= hours[0] && n.hour < hours[1];
    status = aberto
      ? "AGORA estamos DENTRO do horário de atendimento."
      : "AGORA estamos FORA do horário de atendimento (nossos atendentes retornam no próximo horário comercial).";
  }
  const lista = Object.entries(holidaysFor(n.year))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, nome]) => `${d.slice(3)}/${d.slice(0, 2)} ${nome}`)
    .join("; ");
  return `CONTEXTO DE HOJE (fuso de São Paulo):\n` +
    `- Agora: ${n.weekdayName}, ${n.dateStr}, ${n.timeStr}\n` +
    `- Horário comercial: ${HORARIO_TXT}\n` +
    `- ${status}\n` +
    `- Feriados de ${n.year} (Nacional + SP + Guarulhos): ${lista}`;
}

const CLAUDE_BASE_PROMPT =
`Você é a Verti, atendente virtual de pós-venda da VerticalParts, empresa especializada em peças para elevadores, escadas rolantes e esteiras (importações e produtos nacionais). Marcas principais: BST, Monarch, Fermator. Você atende clientes via WhatsApp.
- Na primeira mensagem de uma conversa, apresente-se: "Olá, eu sou a Verti, da VerticalParts! 👋". Não fique repetindo o nome a cada mensagem.
- ABERTURA — ENTENDA ANTES DE FALAR: NÃO comece a conversa falando de marcas (BST/Monarch/Fermator) nem de produtos. Primeiro pergunte e ENTENDA o OBJETIVO do cliente ("Como posso te ajudar? O que você procura?"). Só mencione marcas/peças se for pertinente para resolver o que ele pediu. Atenda o cliente primeiro.

COMUNICAÇÃO:
- Mensagens curtas e objetivas (máx. 3-4 linhas por mensagem).
- Português brasileiro correto, tom profissional e cordial. Emojis com moderação.
- Nunca use markdown, só texto simples (é WhatsApp).
- PERSONA (secretária de verdade): humanizada, DIRETA ao ponto, sem burocratizar a vida do cliente. Acolhedora, com um toque de carinho — mas profissional e SEM bajulação nem puxa-saquismo (nada de elogios exagerados tipo "que prazer enorme falar com você", "estou às ordens sempre"). Calorosa e objetiva.

TOM — NÃO IRRITAR O CLIENTE (de-escalonamento):
- Sempre acolha o sentimento antes de resolver ("Entendo sua preocupação", "Sinto muito pelo transtorno").
- Nunca culpe o cliente, nunca discuta nem seja defensivo. Seja paciente mesmo se ele for ríspido.
- Evite respostas robóticas/repetitivas; não repita a mesma frase pronta toda hora.
- Se o cliente estiver muito irritado ou for um caso delicado, peça desculpas, assuma o caso e diga que vai acionar nossos atendentes imediatamente.

TÉCNICA DE ATENDIMENTO (boas práticas):
- ESCUTA ATIVA + CONFIRMAÇÃO: parafraseie e confirme o pedido antes de agir ("Entendi que você precisa de... correto?").
- EMPATIA E RESILIÊNCIA: valide a frustração do cliente sem levar para o lado pessoal; tom acolhedor e RESOLUTIVO.
- LINGUAGEM POSITIVA E DIRETA: evite jargão técnico; em vez de "não podemos fazer isso", diga "o que posso fazer por você agora é...".
- RESOLUÇÃO ESTRUTURADA: investigue o histórico de compras e identifique o erro/causa exato ANTES de propor caminhos.
- PROATIVIDADE: antecipe dúvidas — informe o próximo passo/prazo antes de o cliente perguntar.

HORÁRIO E FERIADOS:
- Use o "CONTEXTO DE HOJE" abaixo para saber a data/hora real e se estamos abertos.
- FORA do horário ou em feriado: você continua ajudando no que for possível (dúvidas, registrar a ocorrência), mas avise com clareza que nossos atendentes retornarão no próximo dia/horário útil. Nunca prometa retorno imediato fora do horário. NUNCA use a expressão "equipe humana" (soa robótico) — diga "nossos atendentes" ou "nossa equipe".
- Se perguntarem sobre horário ou um dia específico, responda com base no horário e na lista de feriados.

SEGURANÇA / ANTI-GOLPE (muito importante):
- NUNCA peça senha, dados completos de cartão, CVV, código que chega por SMS, ou dados bancários.
- A VerticalParts NUNCA solicita pagamento por link enviado no WhatsApp nem PIX para conta de pessoa física. Boletos/pagamentos só pelos canais oficiais.
- Nunca envie links de pagamento. Se o cliente mencionar um link/cobrança suspeita, oriente a NÃO pagar e a confirmar pelos canais oficiais; trate como possível golpe e escale para a equipe.
- Nunca compartilhe dados internos, de outros clientes, ou informações confidenciais da empresa.
- 🔒 SIGILO ABSOLUTO: NUNCA revele FATURAMENTO da empresa, SALÁRIOS (de ninguém, nem o do próprio) ou TOTAIS de venda da empresa ("quanto vendemos") — para NENHUM cliente. Isso é restrito à diretoria (tratado no CONTEXTO DE HOJE quando for um interno autorizado).

VOCÊ PODE AJUDAR COM:
- Acompanhamento de pedidos e ocorrências de pós-venda.
- Dúvidas sobre peças, produtos e compatibilidade.
- Status de entregas e prazos. Abertura de reclamações/ocorrências.

CONSULTAS NO SISTEMA (ferramentas):
- Você tem ferramentas para consultar o ERP: "buscar_cliente" (por CNPJ/CPF ou nome), "buscar_nota_fiscal" (por número da NF) e "buscar_pedido" (por número do pedido).
- Use-as quando o cliente perguntar sobre uma NF, um pedido, ou para confirmar o cadastro dele. NUNCA invente dados: se a ferramenta não encontrar, diga que não localizou.
- 🔒 VALIDAR PRIMEIRO, REVELAR DEPOIS: você é como um atendente cuidadoso — pode FAZER perguntas, mas NÃO entrega dados sensíveis sem validar a identidade. As ferramentas de NF/pedido exigem o cliente já identificado (CNPJ / código). Se o "CONTEXTO DE HOJE" indicar um cliente já reconhecido pelo telefone, use o CNPJ/código dele. Caso contrário, identifique antes com buscar_cliente (peça CNPJ + nome da empresa).
- NUNCA confirme nem repita dados de uma NF/pedido (nome da empresa, valor, itens) ANTES de validar — nem para "confirmar". Se o documento não for do cliente validado, diga apenas "não localizei no seu cadastro" — NUNCA revele de quem é.
- Número da NF e número do PEDIDO são coisas diferentes. Se um número não bater como nota fiscal, ofereça verificar como número de pedido (use buscar_pedido) — e vice-versa.
- NÃO exija que o cliente digite os zeros à esquerda: a busca já trata isso ("13614" = "00013614"). Não fique pedindo o "número completo" por causa de zeros.
- Relate os resultados em linguagem simples; nunca cite nomes internos de tabelas/campos.

PREÇOS E ORÇAMENTOS:
- NUNCA informe preço de produto/tabela nem faça orçamento/cotação por conta própria. Para preços e cotações, direcione o cliente ao time comercial.
- Você PODE informar o valor total de uma Nota Fiscal ou de um pedido do próprio cliente (depois de confirmar a identidade dele), pois é um documento que pertence a ele.
- Nunca pergunte nem peça preço ao cliente.

FLUXO — CLIENTE EXTERNO (sigilo máximo):
- Antes de QUALQUER dado: valide a identidade (CPF ou CNPJ) com buscar_cliente. Sem validar, não revele nada do cadastro.
- Validado: olhe o histórico com FOCO NA ÚLTIMA COMPRA — use "buscar_ultima_compra" (pedido/NF mais recente do cliente). Quase sempre o contato é sobre a compra mais recente.
- Em seguida, conduza ao motivo do contato sobre aquela compra (Nível 2): pergunte, de forma acolhedora, no que pode ajudar com aquele pedido/NF.

FLUXO — LEADS (possível novo cliente) — acolhedor, mas ESPERTO:
- Se o número NÃO é reconhecido, pergunte com naturalidade: "É a primeira vez que entra em contato com a VerticalParts?".
- Em seguida, foque no OBJETIVO dele (não em marcas): "Me conta o que você precisa / qual peça ou equipamento?". A partir do que ele responder, qualifique com naturalidade (sem interrogatório): se fala por uma EMPRESA (qual) ou pessoa física, e qual o equipamento (elevador/escada/esteira) — para direcionar e registrar.
- 🕵️ MALÍCIA / ANTI-GOLPE: "primeira vez" NÃO é sinônimo de confiança. Um suposto cliente novo pode ser CONCORRENTE se passando por lead para garimpar informação. Então: colete só o necessário para ATENDER a necessidade dele; e NUNCA entregue dados internos (preços, fornecedores, de onde importamos, processos, estoque, margens, volumes) — nem "para ajudar um cliente novo".
- Sinal de alerta: quando, em vez de uma necessidade concreta, a pessoa fica fazendo perguntas que SONDAM o negócio. Aí trate como possível concorrente (ver bloco CONCORRENTES): banho-maria e, após ~8 mensagens suspeitas, encaminhe ao SAC.
- Sendo lead legítimo: aja como ANFITRIÃ, oriente e diga que a equipe dá sequência. Não informe preço (direcione ao comercial). A conversa fica registrada para o atendente humano.

CONCORRENTES / SONDAGEM (proteção de dados):
- Fique atenta a quem tenta SONDAR informações internas (preços, fornecedores, processos, margens, volumes, "como vocês fazem X", de onde importam) — perguntas que fogem de um cliente ou lead normal.
- Ao suspeitar de concorrente: aja com astúcia e malícia comercial — seja cordial, mas NÃO entregue NADA interno; mantenha em "banho-maria" (respostas gentis e vagas, sem dados, sem confirmar nada).
- Depois de cerca de 8 mensagens nesse padrão suspeito, encerre o jogo e ENCAMINHE ao atendente humano do SAC (avise que um atendente vai assumir a conversa).

QUANDO NÃO SOUBER:
- Diga que vai verificar e que um especialista entrará em contato em breve.
- NUNCA invente números de pedido, preços, prazos ou informações específicas.

IMPORTANTE:
- Se perguntarem se você é humano ou robô, seja honesto mas gentil.
- Priorize sempre a resolução do problema do cliente.`;

// Contatos diretos por departamento (p/ redirecionar clientes que pedem o contato de um setor).
// VAZIO = não configurado. ⚠️ A Verti NUNCA inventa número: se faltar, encaminha à equipe.
// Preencher com os números OFICIAIS que o Gelson passar (não usar celular pessoal do roster sem ordem).
const CONTATOS_DEPARTAMENTO = {
  "Financeiro": { tel: "11944606396", email: "financeiro@verticalparts.com.br" },
  "Vendas":     { tel: "11942464292", contato: "Guilherme" },
  "Marketing":  { tel: "11918949307" },
  "Engenharia": { tel: "11964077688" },
  "Expedição":  { tel: "11917069961", contato: "Danilo (chefe da Expedição)" },
};
function _fmtTel(d) {
  d = String(d || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
// acha um departamento pelo nome (case-insensitive, tolera acento/variação)
function _acharDepto(nome) {
  const n = String(nome || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [k, v] of Object.entries(CONTATOS_DEPARTAMENTO)) {
    const kn = k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (kn === n || kn.includes(n) || n.includes(kn)) return { depto: k, ...v };
  }
  return null;
}
function blocoContatosDepto() {
  const ents = Object.entries(CONTATOS_DEPARTAMENTO);
  let s = `\n\nCONTATOS POR DEPARTAMENTO (quando o cliente pedir o contato direto de um setor):`;
  s += ents.length
    ? ents.map(([d, v]) => `\n- ${d}: ${_fmtTel(v.tel)}${v.contato ? ` (falar com ${v.contato})` : ""}${v.email ? ` · e-mail: ${v.email}` : ""}`).join("")
    : `\n- (Nenhum número configurado ainda.)`;
  s += `\nREGRA INVIOLÁVEL: forneça APENAS um número que esteja listado acima. Se o setor pedido NÃO estiver na lista, é PROIBIDO inventar — diga que vai encaminhar a solicitação ao setor e que a equipe retorna o contato. NUNCA deixe o cliente sem resposta.`;
  s += `\nAVISAR O SETOR: quando o assunto for de outro setor (ex.: nova venda/peça fora do pós-venda), OFEREÇA avisar o responsável. Com a concordância do cliente e o nome dele, use a ferramenta "avisar_departamento" para mandar um WhatsApp ao responsável com o assunto + nome + telefone do cliente. NÃO faça isso para concorrente suspeito.`;
  return s;
}
function buildSystemPrompt() {
  return CLAUDE_BASE_PROMPT + "\n\n" + atendimentoContexto() + blocoContatosDepto();
}

// ─── Contatos internos (corporativos) — tratamento VIP ────────────────────────
// FONTE PRIMÁRIA: tabela Supabase `public.internal_contacts` (editável sem deploy).
// O objeto abaixo é apenas FALLBACK, usado se o Supabase falhar/voltar vazio.
// Chave = telefone só dígitos, DDD + número (sem o 55).
// OBS: a linha 11997663780 é a do BOT/Evolution (atendente Jéssica), não é cliente — não consta aqui.
const INTERNAL_CONTACTS_FALLBACK = {
  "11973479910": { nome: "Thiago Petricio",     cargo: "Assistente de Almoxarifado",        dept: "Almoxarifado" },
  "11975246576": { nome: "Brayan Gomes Souza",  cargo: "Técnico Mecatrônico",               dept: "Automação" },
  "11942464292": { nome: "Guilherme Garcia",    cargo: "Líder Comercial",                   dept: "Comercial" },
  "11998981275": { nome: "Marcus Augusto Braz", cargo: "Gerente Comercial",                 dept: "Comercial" },
  "11912314738": { nome: "Patricia Mariano",    cargo: "Consultor Comercial",               dept: "Comercial" },
  "11999520472": { nome: "Rafael Nunes Neves",  cargo: "Consultor Comercial",               dept: "Comercial" },
  "11951640001": { nome: "Vagner Gianini",      cargo: "Vendedor",                          dept: "Comercial" },
  "11995578519": { nome: "Victoria Martins",    cargo: "Assistente Comercial PL",           dept: "Comercial" },
  "11955997597": { nome: "Albimar Silveira Jr", cargo: "Analista de Importação/Exportação Jr", dept: "Compras" },
  "11974808436": { nome: "Andreia Oliveira",    cargo: "Auxiliar de Compras",               dept: "Compras" },
  "11992042442": { nome: "Bianca Maeno",        cargo: "Compras Nacionais",                 dept: "Compras" },
  "11934095836": { nome: "Diego Maeno",         cargo: "CEO",                               dept: "Diretoria", nivel: "diretoria" },
  "12992004047": { nome: "Gelson Simões",       cargo: "Consultor Téc Estratégico",         dept: "Engenharia", nivel: "diretoria" },
  "11974769151": { nome: "Gelson Simões",       cargo: "Consultor Téc Estratégico",         dept: "Engenharia", nivel: "diretoria" }, // 2º aparelho do Gelson (16/06)
  "11974913360": { nome: "Juliana",             cargo: "Diretoria",                         dept: "Diretoria", nivel: "diretoria" },
  "11942501627": { nome: "Alexandre Schmidt",   cargo: "Supervisor de Engenharia",          dept: "Engenharia" },
  "11975269475": { nome: "Felipe Camargo",      cargo: "Jovem Aprendiz",                    dept: "Engenharia" },
  "11999516411": { nome: "Vinicius Ramos Leite", cargo: "Analista de Projetos Sr",          dept: "Engenharia" },
  "11971810361": { nome: "Matheus Rocha",       cargo: "Assistente de Expedição",           dept: "Expedição" },
  "11944606396": { nome: "Maximira Ribeiro",    cargo: "Assistente Financeiro",             dept: "Financeiro" },
  "11955887575": { nome: "Karla Ayres",         cargo: "Analista de RH",                    dept: "Gente e Gestão" },
  "11975341398": { nome: "Neyla Araujo",        cargo: "Assistente de Departamento Pessoal", dept: "Gente e Gestão" },
  "11918949307": { nome: "Amanda Sales",        cargo: "Estagiária",                        dept: "Marketing" },
  "11937258080": { nome: "Giovanna Maeno",      cargo: "Gerente de Marketing",              dept: "Marketing/TI" },
  "11916220666": { nome: "Mauricio Sanchez",    cargo: "Supervisor de Instalação e Montagem", dept: "Montagem" },
  "11972026426": { nome: "Edmilson de Jesus",   cargo: "Motorista",                         dept: "Motorista" },
  "11951641767": { nome: "Gesse Batista",       cargo: "Motorista",                         dept: "Motorista" },
  "11964077688": { nome: "Arilene Avila",       cargo: "Gestora de Operações",              dept: "Operações" },
  "11955988424": { nome: "Magda Torres",        cargo: "Assistente de PCP",                 dept: "PCP" },
  "11996246582": { nome: "Jessica Santos",      cargo: "Atendente de Pós-Venda (SAC)",      dept: "Pós-Venda" },
  "11944931971": { nome: "Caio Richard",        cargo: "Analista de Qualidade Pleno",       dept: "Qualidade" },
  "11910280566": { nome: "Fernanda Freires",    cargo: "Analista de Suporte de TI Jr",      dept: "TI" },
};

// Cache em memória dos contatos internos. Fonte: tabela Supabase `internal_contacts`.
// Recarrega após CONTACTS_TTL_MS; em falha/vazio usa INTERNAL_CONTACTS_FALLBACK.
const CONTACTS_TTL_MS = 5 * 60 * 1000;
let _contactsCache = null;
let _contactsCacheAt = 0;
async function getInternalContacts() {
  if (_contactsCache && (Date.now() - _contactsCacheAt) < CONTACTS_TTL_MS) return _contactsCache;
  try {
    const r = await sbFetch("/rest/v1/internal_contacts?select=phone,nome,cargo,dept,nivel&ativo=eq.true");
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) {
        const map = {};
        for (const x of rows) {
          const k = String(x.phone || "").replace(/\D/g, "");
          if (!k) continue;
          map[k] = { nome: x.nome, cargo: x.cargo, dept: x.dept, ...(x.nivel ? { nivel: x.nivel } : {}) };
        }
        _contactsCache = map;
        _contactsCacheAt = Date.now();
        console.log(`[verti] internal_contacts: ${rows.length} carregados do Supabase`);
        return map;
      }
    }
    console.warn("[verti] internal_contacts: resposta vazia/erro — usando fallback do código");
  } catch (e) {
    console.error("[verti] getInternalContacts:", e.message, "— usando fallback");
  }
  return INTERNAL_CONTACTS_FALLBACK;
}

// Número local (DDD + número), sem o código do país (55)
function _phoneLocal(remoteJid) {
  let d = _digits(remoteJid);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d;
}

// Descobre QUEM está falando: interno (VIP), cliente do cadastro (por telefone) ou desconhecido
async function resolveQuemFala(remoteJid) {
  const local = _phoneLocal(remoteJid);
  const contacts = await getInternalContacts();
  if (contacts[local]) return { tipo: "interno", ...contacts[local] };
  try {
    if (local.length >= 10) {
      const ddd = local.slice(0, 2);
      const num = local.slice(2);
      const last8 = num.slice(-8);
      const seg = num.length >= 9 ? `${num.slice(0,5)}-${num.slice(5)}` : `${num.slice(0,4)}-${num.slice(4)}`;
      const r = await erpFetch(`/PN_Omie?select=codigo_cliente_omie,razao_social,nome_fantasia,cnpj_cpf,contato,telefone,cidade,estado&telefone=ilike.*${_enc(seg)}*&limit=8`);
      if (r.ok) {
        const rows = await r.json();
        const match = rows.find((x) => { const td = _digits(x.telefone || ""); return td.endsWith(last8) && td.includes(ddd); });
        if (match) return { tipo: "cliente", ...match };
      }
    }
  } catch (e) { console.error("[verti] resolveQuemFala:", e.message); }
  return { tipo: "desconhecido" };
}

// Bloco de contexto injetado no prompt conforme quem está falando
function contextoQuemFala(quem, isFirst) {
  if (quem.tipo === "interno") {
    const primeiro = quem.nome.split(" ")[0];
    const ehDiretoria = quem.nivel === "diretoria";
    const ehVendedor = /vendedor|comercial/i.test(quem.cargo || "") || /comercial/i.test(quem.dept || "");
    let s = `QUEM ESTÁ FALANDO: ${quem.nome} — ${quem.cargo}${quem.dept ? `, ${quem.dept}` : ""} da VerticalParts. É um contato INTERNO da equipe (NÃO é cliente externo). Seja aberto, direto e prestativo; NÃO peça CNPJ nem trate como cliente a validar.\n` +
      `PODE consultar PEDIDOS (andamento/faturado/previsão — use a ferramenta "consultar_pedido_ao_vivo", que lê o Omie em TEMPO REAL; não use o cadastro). Relate os campos com clareza (etapa/etapa_descricao, previsão, valor, se está bloqueado); não invente — se o Omie não retornar, diga que não localizou.\n` +
      `ESTOQUE: se perguntarem se há um produto e quantos, use a ferramenta "consultar_estoque" (quantidade vem do Omie em TEMPO REAL). Informe físico/disponível/reservado; se houver vários produtos parecidos, peça o código. NUNCA invente quantidade.\n` +
      `🔒 SIGILO TOTAL (regra inviolável): NUNCA revele FATURAMENTO da empresa, SALÁRIOS (de ninguém — NEM o salário da própria pessoa que está perguntando), nem TOTAIS de venda da empresa (ex.: "quanto vendemos ontem/este mês"). `;
    if (ehDiretoria) {
      s += `EXCEÇÃO: esta pessoa é da DIRETORIA autorizada — com ela você PODE tratar de faturamento, salários e totais de venda.`;
    } else {
      s += `Esta pessoa NÃO é autorizada a esses dados. Se perguntarem sobre faturamento, salários ou total vendido, RECUSE com educação: é informação restrita à diretoria. `;
      if (ehVendedor) s += `Por ser do comercial, pode saber quanto ELE MESMO vendeu (apenas as vendas dele — nunca de outros, nunca o total da empresa), e só se houver certeza de que a venda é dele.`;
    }
    if (isFirst) s += `\nEsta é a PRIMEIRA mensagem: cumprimente de forma calorosa mas DIRETA, ex.: "Oi ${primeiro}! Sou a Verti 😊 No que posso ajudar?". Sem bajulação nem exageros. Só na primeira mensagem.`;
    return s;
  }
  if (quem.tipo === "cliente") {
    const ident = quem.razao_social || quem.nome_fantasia || "(empresa do cadastro)";
    let s = `QUEM ESTÁ FALANDO: número RECONHECIDO no cadastro — empresa ${ident}` +
      (quem.cnpj_cpf ? ` (CNPJ ${quem.cnpj_cpf})` : "") +
      (quem.contato ? `, contato cadastrado: ${quem.contato}` : "") + `.\n` +
      `IDENTIDADE PRÉ-VALIDADA pelo telefone: você PODE consultar e informar NF/pedido DESTE cliente (CNPJ ${quem.cnpj_cpf || "?"}) — e somente dele. Ao consultar NF use cnpj_cliente="${quem.cnpj_cpf || ""}" e ao consultar pedido use codigo_cliente_omie=${quem.codigo_cliente_omie ?? "?"}.\n` +
      `FOCO NA ÚLTIMA COMPRA: use "buscar_ultima_compra" (codigo_cliente_omie=${quem.codigo_cliente_omie ?? "?"}) para puxar a compra mais recente — quase sempre o contato é sobre ela — e conduza ao motivo do contato (Nível 2).`;
    if (isFirst) s += `\nEsta é a PRIMEIRA mensagem: cumprimente reconhecendo a empresa, ex.: "Olá! 😊 Encontrei seu número no nosso cadastro — você fala pela ${ident}, certo? Como posso te chamar?" e ofereça o menu de opções.`;
    return s;
  }
  let s = `QUEM ESTÁ FALANDO: número NÃO reconhecido no cadastro. Pode ser um CLIENTE (a validar) ou um LEAD (novo).`;
  if (isFirst) s += `\nEsta é a PRIMEIRA mensagem: apresente-se brevemente, pergunte "É a primeira vez que entra em contato com a VerticalParts?" e ENTENDA O OBJETIVO dele primeiro ("Como posso ajudar? O que você procura?"). NÃO abra falando de marcas/produtos.\n` +
    `• Se JÁ é cliente / tem compra: para tratar de pedido/NF, valide a identidade pedindo o CNPJ (ou CPF) e o nome da empresa, e use buscar_cliente.\n` +
    `• Se for LEAD (primeira vez): acolha como ANFITRIÃ e foque na necessidade dele; qualifique com naturalidade (é empresa? qual? qual equipamento?), sem interrogatório. MAS seja ESPERTA: "primeira vez" não é confiança — pode ser concorrente disfarçado. Colete só o necessário para atender e NUNCA entregue dados internos (preços/fornecedores/de onde importamos/processos/estoque). A conversa fica registrada para um atendente humano. Não informe preço (direcione ao comercial).`;
  s += `\nNÃO revele dados de NF/pedido sem antes validar o CNPJ com buscar_cliente. Se perceber SONDAGEM de concorrente (perguntas sobre preços/fornecedores/processos internos), mantenha em banho-maria (cordial, sem entregar nada) e, após ~8 mensagens suspeitas, encaminhe ao atendente do SAC.`;
  return s;
}

// Ferramentas que o atendente pode usar para consultar o ERP
const ATENDENTE_TOOLS = [
  {
    name: "buscar_cliente",
    description: "Busca um cliente da VerticalParts no ERP por CNPJ/CPF ou por nome (razão social ou nome fantasia). Use para confirmar o cadastro do cliente.",
    input_schema: {
      type: "object",
      properties: {
        cnpj_cpf: { type: "string", description: "CNPJ ou CPF, com ou sem pontuação" },
        nome: { type: "string", description: "Parte do nome / razão social / nome fantasia" },
      },
    },
  },
  {
    name: "buscar_nota_fiscal",
    description: "Busca uma Nota Fiscal de venda pelo número da NF, RESTRITA ao cliente informado (segurança). Só retorna a nota se ela pertencer ao CNPJ do cliente. Exige o CNPJ do cliente já validado.",
    input_schema: {
      type: "object",
      properties: {
        numero_nf: { type: "string", description: "Número da nota fiscal (pode vir sem os zeros à esquerda)" },
        cnpj_cliente: { type: "string", description: "CNPJ do cliente JÁ validado (do cadastro reconhecido ou confirmado via buscar_cliente). Obrigatório." },
      },
      required: ["numero_nf", "cnpj_cliente"],
    },
  },
  {
    name: "buscar_pedido",
    description: "Busca um pedido de venda pelo número, RESTRITO ao cliente informado (segurança). Só retorna se o pedido pertencer àquele cliente. Exige o código do cliente já validado.",
    input_schema: {
      type: "object",
      properties: {
        numero_pedido: { type: "string", description: "Número do pedido de venda" },
        codigo_cliente_omie: { type: "integer", description: "Código do cliente (codigo_cliente_omie) já validado, obtido em buscar_cliente ou no cadastro reconhecido. Obrigatório." },
      },
      required: ["numero_pedido", "codigo_cliente_omie"],
    },
  },
  {
    name: "consultar_pedido_ao_vivo",
    description: "APENAS para colaboradores INTERNOS (equipe VerticalParts): consulta um pedido de venda DIRETO no Omie, em tempo real (dado mais fresco que o cadastro). Use quando QUEM ESTÁ FALANDO é um contato interno/da equipe e pergunta sobre andamento, etapa, faturamento ou previsão de um pedido. NUNCA use para cliente externo.",
    input_schema: {
      type: "object",
      properties: {
        numero_pedido: { type: "string", description: "Número do pedido de venda" },
      },
      required: ["numero_pedido"],
    },
  },
  {
    name: "consultar_estoque",
    description: "APENAS para colaboradores INTERNOS: consulta o ESTOQUE de um produto (se há e quantos). Busca o produto por CÓDIGO (ex.: VPER-879) ou por parte do NOME/descrição; a QUANTIDADE vem do Omie em TEMPO REAL. Se aparecer mais de um produto parecido, peça ao colaborador para escolher pelo código. NUNCA use para cliente externo.",
    input_schema: {
      type: "object",
      properties: {
        produto: { type: "string", description: "Código do produto (ex.: VPER-879) ou parte do nome/descrição" },
      },
      required: ["produto"],
    },
  },
  {
    name: "buscar_ultima_compra",
    description: "Busca a ÚLTIMA compra (pedidos mais recentes) de um cliente JÁ VALIDADO, pelo código do cliente. Use logo após validar a identidade do cliente externo, para focar o atendimento na compra mais recente. Só para cliente cuja identidade já foi confirmada.",
    input_schema: {
      type: "object",
      properties: {
        codigo_cliente_omie: { type: "integer", description: "Código do cliente já validado (de buscar_cliente ou do cadastro reconhecido)." },
      },
      required: ["codigo_cliente_omie"],
    },
  },
  {
    name: "avisar_departamento",
    description: "Envia um aviso por WhatsApp ao responsável de um DEPARTAMENTO (Financeiro/Vendas/Expedição/Marketing/Engenharia) sobre a solicitação de um cliente, para agilizar o retorno. Use APÓS o cliente concordar em deixar o contato. NUNCA use para concorrente suspeito. O telefone do cliente é pego automaticamente da conversa.",
    input_schema: {
      type: "object",
      properties: {
        departamento: { type: "string", description: "Departamento a avisar (ex.: Vendas, Financeiro, Expedição, Marketing, Engenharia)." },
        assunto: { type: "string", description: "Resumo curto do que o cliente precisa." },
        nome_cliente: { type: "string", description: "Nome do cliente, como ele se apresentou." },
      },
      required: ["departamento", "assunto"],
    },
  },
];

async function execAtendenteTool(name, input = {}, remoteJid = null) {
  try {
    if (name === "avisar_departamento") {
      const dep = _acharDepto(input.departamento);
      if (!dep || !dep.tel) return { erro: `Departamento '${input.departamento}' não tem contato cadastrado — não posso avisar; encaminhe internamente.` };
      const isLid = String(remoteJid || "").endsWith("@lid");
      const foneCliente = remoteJid && !isLid ? _digits(remoteJid).replace(/^55/, "") : null;
      const texto = `🔔 *Verti — Pós-Venda 360*\n` +
        `Um cliente consultou o setor *${dep.depto}*.\n` +
        `• Assunto: ${input.assunto}\n` +
        `• Cliente: ${input.nome_cliente || "(não informado)"}\n` +
        `• WhatsApp: ${foneCliente ? _fmtTel(foneCliente) : "(não identificado)"}\n\n` +
        `Aviso automático — favor retornar ao cliente.`;
      const numeroDestino = dep.tel.startsWith("55") ? dep.tel : "55" + dep.tel;
      const sent = await evoSendText(numeroDestino, texto);
      if (!sent.ok) return { erro: `falha ao enviar o aviso (${sent.error})` };
      // registra o handoff p/ o gatilho de 2h úteis cobrar o resultado depois
      const prazo = new Date(prazoUtilMs(Date.now(), 120)).toISOString();
      await sbFetch("/rest/v1/handoffs", {
        method: "POST",
        body: JSON.stringify({
          departamento: dep.depto, responsavel_tel: dep.tel, assunto: input.assunto,
          cliente_nome: input.nome_cliente || null, cliente_jid: remoteJid || null,
          status: "aguardando", prazo_em: prazo,
        }),
      }).catch((e) => console.error("[handoff] insert:", e.message));
      return { avisado: true, departamento: dep.depto, responsavel: dep.contato || _fmtTel(dep.tel), prazo_cobranca: "2h úteis" };
    }
    if (name === "buscar_cliente") {
      let filtro;
      const mask = _mascaraDoc(input.cnpj_cpf);
      if (mask) filtro = `cnpj_cpf=eq.${_enc(mask)}`;
      else if (input.cnpj_cpf) filtro = `cnpj_cpf=ilike.*${_enc(input.cnpj_cpf)}*`;
      else if (input.nome) filtro = `or=(razao_social.ilike.*${_enc(input.nome)}*,nome_fantasia.ilike.*${_enc(input.nome)}*)`;
      else return { erro: "Informe cnpj_cpf ou nome." };
      const r = await erpFetch(`/PN_Omie?select=codigo_cliente_omie,razao_social,nome_fantasia,cnpj_cpf,cidade,estado,telefone,email,situacao,faturamento_bloqueado&${filtro}&limit=5`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, clientes: rows } : { encontrado: false };
    }
    if (name === "buscar_nota_fiscal") {
      // SEGURANÇA: só consulta NF restrita ao CNPJ do cliente já validado.
      const mask = _mascaraDoc(input.cnpj_cliente);
      if (!mask) return { erro: "Para consultar a NF, confirme primeiro o CNPJ do cliente (use buscar_cliente ou o cadastro reconhecido)." };
      // NFs de venda reais estão em omie_nfe_itens (tipo=S), nível item — agregamos por NF.
      // numero_nfe é texto com zeros à esquerda; o cliente pode digitar sem os zeros.
      const core = _digits(input.numero_nf).replace(/^0+/, "") || _digits(input.numero_nf);
      const r = await erpFetch(`/omie_nfe_itens?select=numero_nfe,tipo,data_emissao,nome_parceiro,cnpj_parceiro,chave_nfe,descricao,quantidade,valor_total&tipo=eq.S&cnpj_parceiro=eq.${_enc(mask)}&or=(numero_nfe.eq.${_enc(input.numero_nf)},numero_nfe.ilike.*${_enc(core)})&limit=80`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      if (!rows.length) return { encontrado: false, motivo: "Nenhuma nota com esse número no cadastro deste cliente." };
      const byNf = {};
      for (const it of rows) {
        const k = it.numero_nfe;
        if (!byNf[k]) byNf[k] = { numero_nf: k, data_emissao: it.data_emissao, cliente: it.nome_parceiro, cnpj_cliente: it.cnpj_parceiro, chave_nfe: it.chave_nfe, valor_total: 0, itens: [] };
        byNf[k].valor_total += Number(it.valor_total) || 0;
        byNf[k].itens.push({ descricao: it.descricao, quantidade: it.quantidade, valor_total: it.valor_total });
      }
      const notas = Object.values(byNf).map((n) => ({ ...n, valor_total: Math.round(n.valor_total * 100) / 100, qtd_itens: n.itens.length }));
      return { encontrado: true, notas };
    }
    if (name === "buscar_pedido") {
      // SEGURANÇA: só consulta pedido restrito ao cliente já validado.
      const cod = parseInt(input.codigo_cliente_omie, 10);
      if (!cod) return { erro: "Para consultar o pedido, confirme primeiro o cliente (use buscar_cliente ou o cadastro reconhecido) e passe o codigo_cliente_omie." };
      const r = await erpFetch(`/omie_orders?select=numero_pedido,etapa,status,numero_nf,chave_nfe,valor_total_pedido,data_previsao,data_inclusao,codigo_cliente_omie,observacao&codigo_cliente_omie=eq.${cod}&or=(numero_pedido.eq.${_enc(input.numero_pedido)},numero_pedido.ilike.*${_enc(_digits(input.numero_pedido))})&limit=5`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, pedidos: rows } : { encontrado: false, motivo: "Nenhum pedido com esse número para este cliente." };
    }
    if (name === "buscar_ultima_compra") {
      // Última compra do cliente JÁ VALIDADO (foco no atendimento da compra mais recente).
      const cod = parseInt(input.codigo_cliente_omie, 10);
      if (!cod) return { erro: "Confirme o cliente primeiro (codigo_cliente_omie)." };
      const r = await erpFetch(`/omie_orders?select=numero_pedido,etapa,numero_nf,chave_nfe,valor_total_pedido,data_previsao,data_inclusao&codigo_cliente_omie=eq.${cod}&order=data_inclusao.desc&limit=3`);
      if (!r.ok) return { erro: `falha na consulta (${r.status})` };
      const rows = await r.json();
      return rows.length ? { encontrado: true, ultimas_compras: rows } : { encontrado: false, motivo: "Sem compras registradas para este cliente." };
    }
    if (name === "consultar_estoque") {
      // INTERNOS: acha o produto no espelho (busca por código/nome) e pega a QUANTIDADE ao vivo no Omie.
      const termo = String(input.produto || "").trim();
      if (!termo) return { erro: "Informe o produto (código ou nome)." };
      const r = await erpFetch(`/Produtos_VP?select=codigo_produto,codigo,descricao,unidade&or=(codigo.ilike.*${_enc(termo)}*,descricao.ilike.*${_enc(termo)}*)&limit=8`);
      if (!r.ok) return { erro: `falha na busca de produto (${r.status})` };
      const prods = await r.json();
      if (!prods.length) return { encontrado: false, motivo: "Nenhum produto com esse código/nome." };
      if (prods.length > 1) {
        return { encontrado: true, multiplos: true,
          produtos: prods.map((p) => ({ codigo: p.codigo, descricao: p.descricao, unidade: p.unidade })),
          instrucao: "Há mais de um produto. Peça ao colaborador para escolher pelo código e consulte de novo." };
      }
      const p = prods[0];
      const dataBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      let pos;
      try {
        pos = await omieCall("estoque/consulta", "PosicaoEstoque",
          { codigo_local_estoque: 0, id_prod: p.codigo_produto, cod_int: "", data: dataBR });
      } catch (e) { return { erro: `Omie indisponível: ${e.message}` }; }
      if (pos?.faultstring) return { encontrado: true, produto: p.descricao, codigo: p.codigo, motivo: `Estoque indisponível no Omie: ${pos.faultstring}` };
      return {
        encontrado: true, fonte: "Omie ao vivo",
        codigo: p.codigo, produto: p.descricao, unidade: p.unidade,
        em_estoque_fisico: pos?.fisico, disponivel: pos?.saldo, reservado: pos?.reservado,
        estoque_minimo: pos?.estoque_minimo,
      };
    }
    if (name === "consultar_pedido_ao_vivo") {
      // INTERNOS: consulta o pedido DIRETO no Omie (tempo real). Sem trava de cliente —
      // colaboradores da equipe são confiáveis (a trava existe p/ cliente externo).
      const num = String(input.numero_pedido || "").replace(/\D/g, "");
      if (!num) return { erro: "Informe o numero_pedido." };
      let resp;
      try {
        resp = await omieCall("produtos/pedido", "ConsultarPedido", { numero_pedido: num });
      } catch (e) { return { erro: `Omie indisponível: ${e.message}` }; }
      const pv = resp?.pedido_venda_produto;
      if (!pv || resp?.faultstring) return { encontrado: false, motivo: resp?.faultstring || "Pedido não encontrado no Omie." };
      const cab = pv.cabecalho || {};
      const inf = pv.informacoes_adicionais || {};
      const tot = pv.total_pedido || {};
      let cliente = null;
      try {
        const c = await omieCall("geral/clientes", "ConsultarCliente", { codigo_cliente_omie: cab.codigo_cliente });
        cliente = c?.razao_social || c?.nome_fantasia || null;
      } catch { /* nome do cliente é opcional */ }
      // Legenda de etapas (PADRÃO Omie — CONFIRMAR com Gelson p/ esta conta).
      const LEGENDA = { "00": "Em aberto (não faturado)", "10": "Em aberto (não faturado)",
        "20": "A faturar", "50": "Em separação / a faturar", "60": "A faturar (liberado)",
        "70": "Faturado (NF emitida)" };
      return {
        encontrado: true, fonte: "Omie ao vivo",
        numero_pedido: cab.numero_pedido, codigo_pedido: cab.codigo_pedido,
        cliente, codigo_cliente: cab.codigo_cliente,
        etapa: cab.etapa, etapa_descricao: LEGENDA[String(cab.etapa)] || `etapa ${cab.etapa} (significado a confirmar)`,
        bloqueado: cab.bloqueado, data_previsao: cab.data_previsao,
        valor_total: tot.valor_total_pedido, quantidade_itens: cab.quantidade_itens,
        codigo_vendedor: inf.codVend,
      };
    }
    return { erro: "ferramenta desconhecida" };
  } catch (e) {
    return { erro: e.message };
  }
}

// MEMÓRIA DE LONGO PRAZO do contato: a Verti "nunca esquece" quem já falou com ela.
// Usa os tickets anteriores deste mesmo WhatsApp (nome, motivo, status, data) — é o histórico
// do próprio contato (mesmo número), então pode ser referenciado sem ferir validação/sigilo.
async function historicoContato(remoteJid) {
  try {
    const r = await sbFetch(`/rest/v1/tickets?select=code,reason,status,created_at,customer&whatsapp_thread_id=eq.${encodeURIComponent(remoteJid)}&order=created_at.desc&limit=6`);
    if (!r.ok) return "";
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length <= 1) return ""; // só o contato atual (ou nenhum) → sem histórico
    const nome = (rows.find((t) => t.customer) || {}).customer || null;
    const passados = rows.slice(1).map((t) =>
      `• ${(t.created_at || "").slice(0, 10)} — "${(t.reason || "").slice(0, 90)}" (status: ${t.status || "?"}, ticket ${t.code || "?"})`
    ).join("\n");
    return `\n\nMEMÓRIA DESTE CONTATO — você JÁ o atendeu antes${nome ? ` (é ${nome})` : ""}. Atendimentos anteriores:\n${passados}\n` +
      `Você NUNCA esquece quem já te procurou: cumprimente pelo NOME, demonstre que se lembra e — quando fizer sentido — pergunte se o assunto do último contato foi RESOLVIDO e retome o porquê de ele ter procurado naquele dia. Não trate como estranho.`;
  } catch { return ""; }
}

// ─── Robustez: chamada à Anthropic com retry em sobrecarga/timeout (429/5xx/abort) ──
async function anthropicCall(payload, { tries = 3 } = {}) {
  const apiKey = ANTHROPIC_KEY();
  if (!apiKey) return null;
  let lastErr = "sem tentativa";
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      });
      if (r.ok) return await r.json();
      const status = r.status;
      lastErr = `HTTP ${status}`;
      console.error("[claude] HTTP", status, (await r.text().catch(() => "")).slice(0, 300));
      // só vale repetir em sobrecarga/erro de servidor; 4xx (exceto 429) é definitivo
      if (status !== 429 && status < 500) return null;
    } catch (e) {
      lastErr = e.message;
      console.error(`[claude] erro de rede (tentativa ${i + 1}/${tries}):`, e.message);
    }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  console.error("[claude] falhou após", tries, "tentativas:", lastErr);
  return null;
}

// A API da Anthropic — e o opus-4-8 em especial, que NÃO aceita prefill de assistant — exige que o
// array de mensagens COMECE e TERMINE com o papel "user". O histórico vem do WhatsApp e pode terminar
// numa fala do bot (resposta, eco de envio ou fallback) → "must end with a user message" (HTTP 400).
// Normalizamos: (1) tira assistants presos no começo; (2) tira assistants presos no fim;
// (3) funde turnos consecutivos do mesmo papel (blinda contra qualquer regra de alternância).
function normalizeForAnthropic(history) {
  const msgs = history.slice();
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else merged.push({ role: m.role, content: m.content });
  }
  return merged;
}

async function callClaudeWithHistory(remoteJid) {
  const apiKey = ANTHROPIC_KEY();
  if (!apiKey) return null;

  // Busca últimas 20 mensagens do contato
  let history = [];
  try {
    const r = await sbFetch(
      `/rest/v1/whatsapp_messages?select=body,from_me,raw&remote_jid=eq.${encodeURIComponent(remoteJid)}&order=created_at.asc&limit=20`,
    );
    if (r.ok) {
      const rows = await r.json();
      history = (rows || [])
        // Descarta as mensagens automáticas de espera (fallback): NÃO são turnos reais da Verti
        // e, sendo do bot (assistant), empurram o histórico a terminar em "assistant" — o que o
        // opus-4-8 rejeita (HTTP 400 "must end with a user message") e reinicia o loop de fallback.
        .filter((m) => !(m.from_me && m.raw && m.raw.fallback))
        .filter((m) => m.body && m.body.trim())
        .map((m) => ({
          role: m.from_me ? "assistant" : "user",
          content: m.body,
        }));
    }
  } catch (e) { console.error("[claude] history fetch error:", e.message); }

  history = normalizeForAnthropic(history);
  if (history.length === 0) return null;

  // Quem está falando (interno/cliente reconhecido/desconhecido) + se é a 1ª mensagem
  const quem = await resolveQuemFala(remoteJid);
  const isFirst = !history.some((m) => m.role === "assistant");
  const memoria = await historicoContato(remoteJid);
  const sysPrompt = buildSystemPrompt() + "\n\n" + contextoQuemFala(quem, isFirst) + memoria;

  const messages = history;
  // Loop de tool use: Claude pode consultar o ERP antes de responder
  for (let turn = 0; turn < 5; turn++) {
    const data = await anthropicCall({
      model: CLAUDE_MODEL(),
      max_tokens: 1500,
      system: sysPrompt,
      tools: ATENDENTE_TOOLS,
      messages,
    });
    if (!data) return null; // falha dura (já tentou com retry) → automateIncoming envia o fallback

    const blocks = data.content || [];

    if (data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: blocks });
      const toolResults = [];
      for (const b of blocks) {
        if (b.type === "tool_use") {
          const result = await execAtendenteTool(b.name, b.input || {}, remoteJid);
          console.log(`[claude] tool ${b.name}`, JSON.stringify(b.input || {}));
          toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue; // próxima volta: Claude usa os resultados das consultas
    }

    // Resposta final em texto
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) return text;

    // Resposta cortada no limite de tokens sem texto útil: pede uma versão curta e fecha o turno
    if (data.stop_reason === "max_tokens") {
      console.warn("[claude] resposta cortada (max_tokens) — pedindo versão curta");
      messages.push({ role: "assistant", content: "..." });
      messages.push({ role: "user", content: "Responda ao cliente agora, de forma curta e direta, sem usar ferramentas." });
      continue;
    }
    return null;
  }
  console.error("[claude] limite de turnos de tool_use atingido");
  return null;
}

export {
  nowSaoPaulo,
  atendimentoContexto,
  HORARIO_TXT,
  buildSystemPrompt,
  callClaudeWithHistory,
};
