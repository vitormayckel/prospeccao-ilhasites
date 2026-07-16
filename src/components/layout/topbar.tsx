"use client";

import { Menu, ChevronDown, User, Settings, LogOut } from "lucide-react";
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

/** Cabeçalho fixo — navegação e perfil. */
function Topbar({ onOpenMobileNav }: TopbarProps) {
  return (
    <header className="bg-background/95 h-14 shrink-0 border-b border-border-subtle backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-8 xl:px-12">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Abrir menu"
          className="flex size-9 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary lg:hidden"
        >
          <Menu className="size-[18px]" />
        </button>

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
      </div>
    </header>
  );
}

export { Topbar };
