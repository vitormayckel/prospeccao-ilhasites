import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * A escala tipográfica do produto usa nomes semânticos (text-heading, text-kpi).
 * Sem registrá-los aqui, o tailwind-merge os classificaria como cor de texto e
 * descartaria o tamanho ao encontrar um text-* de cor na mesma lista.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "kpi",
            "kpi-sm",
            "title",
            "heading",
            "body",
            "meta",
            "micro",
            "label",
          ],
        },
      ],
    },
  },
});

/** Combina classes condicionais e resolve conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
