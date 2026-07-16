import * as React from "react";
import { fieldClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Select nativo com a mesma pele dos demais campos. Para formulários que
 * enviam via FormData — o Select do Radix não posta valor sozinho.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldClassName, "h-9 cursor-pointer px-3", className)}
    {...props}
  />
));
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
