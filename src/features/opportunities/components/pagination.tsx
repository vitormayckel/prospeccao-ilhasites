"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
}

export function Pagination({ page, pageCount, total }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function goTo(target: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(target));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-text-muted">
        {total} {total === 1 ? "empresa" : "empresas"} · página {page} de{" "}
        {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goTo(page + 1)}
        >
          Próxima
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
