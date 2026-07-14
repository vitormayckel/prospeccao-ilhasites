"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { NavLinks } from "@/components/layout/nav-links";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Sidebar fixa do desktop — 232px expandida / 64px recolhida (Blueprint §13.4). */
function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border-subtle bg-background lg:flex",
        collapsed ? "w-16" : "w-[232px]",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-border-subtle px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Brand collapsed={collapsed} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks collapsed={collapsed} />
      </div>

      <div
        className={cn(
          "border-t border-border-subtle p-3",
          collapsed && "flex justify-center",
        )}
      >
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              className={cn(
                "flex h-9 items-center gap-3 rounded-control px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary",
                collapsed ? "w-9 justify-center px-0" : "w-full",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[18px]" />
              ) : (
                <>
                  <PanelLeftClose className="size-[18px]" />
                  <span>Recolher</span>
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed ? (
            <TooltipContent side="right">Expandir menu</TooltipContent>
          ) : null}
        </Tooltip>
      </div>
    </aside>
  );
}

export { Sidebar };
