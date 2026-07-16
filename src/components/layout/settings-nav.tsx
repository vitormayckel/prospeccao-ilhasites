"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { settingsNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Subnavegação horizontal das Configurações. */
function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border-subtle">
      {settingsNav.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-meta font-medium transition-colors",
              "focus-visible:ring-accent/40 focus-visible:outline-none focus-visible:ring-2",
              active
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted hover:border-border hover:text-text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { SettingsNav };
