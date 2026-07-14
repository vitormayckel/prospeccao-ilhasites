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
              "group flex h-9 items-center gap-3 rounded-control px-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-surface-2 text-text-primary"
                : "text-text-secondary hover:bg-surface-1 hover:text-text-primary",
            )}
          >
            <Icon className="size-[18px] shrink-0" />
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
