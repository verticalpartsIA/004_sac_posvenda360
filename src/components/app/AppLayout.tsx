import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, PlusCircle, Ticket, Smile, Package, Building2,
  BarChart3, MessageCircle, Settings, Bell, Search, LogOut, ChevronDown, Headphones, History,
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";


type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles?: ("operador" | "gestor" | "admin")[] };
type NavGroup = { title: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    title: "Operação",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/nova-ocorrencia", label: "Nova Ocorrência", icon: PlusCircle },
      { to: "/ocorrencias", label: "Ocorrências", icon: FileText },
      { to: "/tickets-internos", label: "Tickets Internos", icon: Ticket },
      { to: "/meus-tickets", label: "Meus Tickets", icon: Ticket },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { to: "/produtos", label: "Produtos", icon: Package },
      { to: "/clientes", label: "Clientes", icon: Building2 },
    ],
  },
  {
    title: "Análise",
    items: [
      { to: "/nps/dashboard", label: "NPS", icon: Smile },
      { to: "/gestor/kpis", label: "KPIs Gestor", icon: BarChart3, roles: ["gestor", "admin"] },
    ],
  },
  {
    title: "SAC",
    items: [
      { to: "/sac", label: "SAC", icon: Headphones },
    ],
  },
  {
    title: "Comunicação",
    items: [
      { to: "/whatsapp-threads", label: "WhatsApp", icon: MessageCircle },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/admin/usuarios", label: "Usuários", icon: Settings, roles: ["admin"] },
      { to: "/admin/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
      { to: "/admin/audit-log", label: "Histórico de Alterações", icon: History, roles: ["admin"] },
    ],
  },
];

export function AppLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, roles, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const visible = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r))),
    }))
    .filter((g) => g.items.length > 0);

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar fixa sempre expandida */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:flex w-[240px]">
        <div className="flex w-full flex-col overflow-hidden bg-[#141416] text-white ring-1 ring-white/5">
          <div className="flex flex-col items-center gap-2 px-4 pb-3 pt-5">
            <img
              src="https://sfpnjwllcmentoocylow.supabase.co/storage/v1/object/public/avatars/avatars/CINZA%20E%20AMARELO.png"
              alt="VerticalParts"
              className="h-11 w-auto object-contain"
            />
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">Pós-Venda</span>
              <span className="text-[11px] font-bold text-gold">360°</span>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
            {visible.map((g) => (
              <div key={g.title} className="mb-4">
                <div className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                  {g.title}
                </div>
                <div className="space-y-1">
                  {g.items.map((n) => {
                    const active = path === n.to || path.startsWith(n.to + "/");
                    const Icon = n.icon;
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-white/[0.06] text-white ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            : "text-white/60 hover:bg-white/[0.04] hover:text-white",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{n.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-white/5 p-3">
            <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-black text-[11px] font-bold">{initials}</div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium text-white">{user?.email}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/45">{roles.join(" · ") || "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-black px-4 py-3 lg:hidden">
        <Logo />
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md border border-sidebar-border p-2 text-white hover:text-gold hover:border-gold"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", menuOpen && "rotate-180")} />
        </button>
      </header>
      {menuOpen && (
        <div className="lg:hidden border-b bg-background p-3 space-y-3">
          {visible.map((g) => (
            <div key={g.title}>
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{g.title}</div>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((n) => {
                  const Icon = n.icon;
                  const active = path === n.to || path.startsWith(n.to + "/");
                  return (
                    <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)}
                      className={cn("flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium",
                        active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}>
                      <Icon className="h-3.5 w-3.5" />{n.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border py-2 text-sm font-medium">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      )}

      <main className="lg:pl-[240px]">
        <div className="sticky top-0 z-20 hidden items-center justify-between border-b bg-background/80 px-8 py-4 backdrop-blur lg:flex">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input placeholder="Buscar ticket, cliente, peça..." className="w-80 bg-transparent outline-none placeholder:text-muted-foreground/60" />
          </div>
          <div className="flex items-center gap-3" ref={userMenuRef}>
            <button className="rounded-md p-2 hover:bg-muted"><Bell className="h-4 w-4" /></button>
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-xs font-medium hover:bg-muted"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">{initials}</span>
                <span className="max-w-[140px] truncate">{user?.email?.split("@")[0] ?? "Usuário"}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", userMenuOpen && "rotate-180")} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-elegant)] animate-fade-in">
                  <div className="border-b px-3 py-2.5">
                    <div className="truncate text-xs font-medium">{user?.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(roles.length ? roles : ["—"]).map((r) => (
                        <span key={r} className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-foreground">{r}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={async () => { setUserMenuOpen(false); await signOut(); navigate({ to: "/login" }); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-destructive hover:bg-destructive/5"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>

        <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
