"use client";

import { useTransition } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchProfileStatus } from "@/types/domain";
import { toggleSearchProfileStatusAction } from "@/server/actions/search-profiles";

export function ProfileStatusToggle({
  id,
  status,
}: {
  id: string;
  status: SearchProfileStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await toggleSearchProfileStatusAction(id, status);
      if (!result.ok && result.error) window.alert(result.error);
    });
  }

  return (
    <Button variant="ghost" size="sm" disabled={isPending} onClick={onClick}>
      {status === "active" ? (
        <>
          <Pause />
          Pausar
        </>
      ) : (
        <>
          <Play />
          Ativar
        </>
      )}
    </Button>
  );
}
