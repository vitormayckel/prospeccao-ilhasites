"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainNav, isNavItemActive } from "@/lib/navigation";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavLinksProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Lista de links da navegação principal, reutilizada na sidebar e no menu mobile. */
function NavLinks({ collapsed = false, onNavigate }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {mainNav.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;

        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-8 items-center gap-2.5 rounded-control px-2.5 text-meta font-medium transition-colors",
              "focus-visible:ring-accent/40 focus-visible:outline-none focus-visible:ring-2",
              collapsed && "justify-center px-0",
              active
                ? "bg-surface-2 text-text-primary"
                : "text-text-muted hover:bg-surface-1 hover:text-text-primary",
            )}
          >
            {/* Régua dourada: o item ativo se anuncia sem pintar o bloco. */}
            {active ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent",
                  collapsed && "left-0",
                )}
              />
            ) : null}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-accent" : "text-text-muted",
              )}
              strokeWidth={active ? 2 : 1.75}
            />
            {!collapsed ? <span>{item.label}</span> : null}
          </Link>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.href} delayDuration={0}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        }

        return link;
      })}
    </nav>
  );
}

export { NavLinks };
