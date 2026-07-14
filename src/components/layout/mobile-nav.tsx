"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { NavLinks } from "@/components/layout/nav-links";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Menu de navegação para telas pequenas (sheet lateral). */
function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-border bg-background p-0 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden">
          <DialogPrimitive.Title className="sr-only">
            Navegação
          </DialogPrimitive.Title>
          <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
            <Brand />
            <DialogPrimitive.Close
              className="rounded-control p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
              aria-label="Fechar menu"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavLinks onNavigate={() => onOpenChange(false)} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { MobileNav };
