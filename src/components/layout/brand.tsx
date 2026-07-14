import { cn } from "@/lib/utils";

/** Marca do produto. O quadrado dourado é o único uso de accent em superfície. */
function Brand({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-accent text-sm font-bold text-black">
        i
      </div>
      {!collapsed ? (
        <span className="text-sm font-semibold tracking-tight text-text-primary">
          Ilha Prospect
        </span>
      ) : null}
    </div>
  );
}

export { Brand };
