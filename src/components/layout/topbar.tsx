"use client";

import {
  Menu,
  Search,
  ChevronDown,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface TopbarProps {
  onOpenMobileNav: () => void;
}

/** Cabeçalho fixo — busca global, status e perfil (Blueprint §12.1). */
function Topbar({ onOpenMobileNav }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-background px-4">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Abrir menu"
        className="flex size-9 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary lg:hidden"
      >
        <Menu className="size-[18px]" />
      </button>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          type="search"
          placeholder="Buscar empresa, telefone, cidade..."
          className="pl-9"
          aria-label="Busca global"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Badge variant="success" className="hidden sm:inline-flex">
          <span className="size-1.5 rounded-full bg-success" />
          Busca concluída
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-accent/40 flex items-center gap-2 rounded-control py-1 pl-1 pr-2 text-sm text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-text-primary">
                OP
              </span>
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Operador</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings />
              Preferências
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export { Topbar };
