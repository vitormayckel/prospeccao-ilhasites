import {
  LayoutDashboard,
  Building2,
  KanbanSquare,
  MessageSquare,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Prefixos adicionais que também marcam este item como ativo. */
  matchPrefixes?: string[];
}

/** Navegação principal — Blueprint §11.1. */
export const mainNav: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Oportunidades",
    href: "/opportunities",
    icon: Building2,
    matchPrefixes: ["/opportunities"],
  },
  { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  {
    label: "Mensagens",
    href: "/messages",
    icon: MessageSquare,
    matchPrefixes: ["/messages"],
  },
  {
    label: "Relatórios",
    href: "/reports",
    icon: BarChart3,
    matchPrefixes: ["/reports"],
  },
  {
    label: "Configurações",
    href: "/settings/searches",
    icon: Settings,
    matchPrefixes: ["/settings"],
  },
];

/** Subnavegação de Configurações — Blueprint §11.2. */
export const settingsNav = [
  { label: "Pesquisas", href: "/settings/searches" },
  { label: "Integrações", href: "/settings/integrations" },
  { label: "Score", href: "/settings/scoring" },
  { label: "Saúde do Sistema", href: "/settings/health" },
  { label: "Geral", href: "/settings/general" },
];

/** Retorna true se a rota atual corresponde ao item de navegação. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.matchPrefixes?.some((p) => pathname.startsWith(p))) return true;
  return pathname === item.href;
}
