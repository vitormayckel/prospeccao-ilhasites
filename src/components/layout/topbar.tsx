"use client";

import { useRouter } from "next/navigation";
import {
  Menu,
  Search,
  ChevronDown,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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

/** Cabeçalho fixo — busca global e perfil (Blueprint §12.1). */
function Topbar({ onOpenMobileNav }: TopbarProps) {
  const router = useRouter();

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

      <form
        className="relative w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("q");
          const q = typeof value === "string" ? value.trim() : "";
          router.push(
            q
              ? `/opportunities?search=${encodeURIComponent(q)}`
              : "/opportunities",
          );
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          type="search"
          name="q"
          placeholder="Buscar empresa por nome..."
          className="pl-9"
          aria-label="Busca global"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
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
