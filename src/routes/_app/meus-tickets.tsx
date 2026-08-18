import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/types";
import { Ticket as TicketIcon, MessageCircle, Headphones, FileEdit } from "lucide-react";

export const Route = createFileRoute("/_app/meus-tickets")({ component: MyTickets });

function MyTickets() {
  const { tickets, globalSearchQuery } = useStore();
  const { user } = useAuth();
  const email = user?.email ?? "";
  const query = globalSearchQuery.trim().toLowerCase();

  const mine = tickets.filter((t) => t.assignee && t.assignee === user?.id);

  const matchesQuery = (t: (typeof tickets)[number]) =>
    `${t.code} ${t.customer} ${t.part} ${t.partCode}`.toLowerCase().includes(query);

  const filtered = query ? mine.filter(matchesQuery) : mine;

  // Quando a busca não encontra nada na fila pessoal, procura na base geral
  // para diferenciar "não existe" de "existe, mas não é atribuído a você".
  const foundElsewhere = query && filtered.length === 0 ? tickets.find(matchesQuery) : undefined;

  const countSac = mine.filter((t) => t.sacNfId).length;
  const countWhatsapp = mine.filter((t) => t.channel === "whatsapp" && !t.sacNfId).length;
  const countManual = mine.filter((t) => t.channel === "manual" && !t.sacNfId).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Minha fila</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Minha fila de trabalho</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Somente ocorrências com <strong>você</strong> ({email || "—"}) como responsável. Ocorrências criadas por
          você, mas atribuídas a outra pessoa, não aparecem aqui — veja em{" "}
          <Link to="/ocorrencias" className="text-gold hover:underline">Ocorrências</Link>.
        </p>
        {mine.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Headphones className="h-3.5 w-3.5" /> {countSac} via SAC</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {countWhatsapp} via WhatsApp</span>
            <span className="inline-flex items-center gap-1"><FileEdit className="h-3.5 w-3.5" /> {countManual} manual</span>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <TicketIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          {query ? (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum item atribuído a você corresponde a "{globalSearchQuery.trim()}".
              </p>
              {foundElsewhere && (
                <p className="mt-2 text-sm">
                  Encontramos <strong>{foundElsewhere.roNumber ?? foundElsewhere.code}</strong> na lista geral, mas
                  não está atribuído a você.{" "}
                  <Link
                    to="/ocorrencia/$ro"
                    params={{ ro: foundElsewhere.roNumber ?? foundElsewhere.code }}
                    className="font-medium text-gold hover:underline"
                  >
                    Abrir ocorrência →
                  </Link>
                </p>
              )}
              <Link to="/ocorrencias" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">
                Ver na lista geral →
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">Nenhum ticket atribuído a você no momento.</p>
              <Link to="/ocorrencias" className="mt-4 inline-block text-sm font-medium text-gold hover:underline">
                Ver todas as ocorrências →
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">RO</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/ocorrencia/$ro" params={{ ro: t.roNumber ?? t.code }} className="hover:text-gold">
                      {t.roNumber ?? t.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{t.customer}</td>
                  <td className="px-4 py-3">{STATUS_LABEL[t.status]}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(t.updatedAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
