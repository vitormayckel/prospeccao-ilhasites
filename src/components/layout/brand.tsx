import { cn } from "@/lib/utils";

/**
 * Marca do produto. O quadrado dourado é o único uso de accent em superfície.
 * O wordmark se distingue da navegação por tracking fechado e peso alto — a
 * mesma lógica óptica dos títulos de página, sem trocar de família.
 */
function Brand({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-accent text-[13px] font-bold leading-none text-black">
        i
      </div>
      {!collapsed ? (
        <span className="text-[15px] font-semibold leading-none tracking-[-0.02em] text-text-primary">
          Ilha Prospect
        </span>
      ) : null}
    </div>
  );
}

export { Brand };
