"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MoreVertical,
  Pencil,
  Copy,
  Play,
  Pause,
  History,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  EditSearchProfileDialog,
  type EditableProfile,
} from "@/features/searches/components/edit-search-profile-dialog";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import {
  duplicateSearchProfileAction,
  deleteSearchProfileAction,
  toggleSearchProfileStatusAction,
} from "@/server/actions/search-profiles";
import type { SearchProfileStatus } from "@/types/domain";

/** Menu de ações do perfil (Sprint §1): editar, duplicar, pausar/ativar,
 *  ver histórico e excluir (com confirmação). */
export function ProfileActionsMenu({
  profile,
}: {
  profile: EditableProfile & { status: SearchProfileStatus };
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { isPending, run } = useAsyncAction();
  const active = profile.status === "active";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ações do perfil"
            disabled={isPending}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => run(() => duplicateSearchProfileAction(profile.id))}
          >
            <Copy />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              run(() =>
                toggleSearchProfileStatusAction(profile.id, profile.status),
              )
            }
          >
            {active ? <Pause /> : <Play />}
            {active ? "Pausar" : "Ativar"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/settings/searches/${profile.id}`}>
              <History />
              Ver histórico
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-danger focus:text-danger"
          >
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditSearchProfileDialog
        profile={profile}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir perfil</DialogTitle>
            <DialogDescription>
              O perfil “{profile.name}” será removido. O histórico de execuções é
              preservado. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() =>
                run(() => deleteSearchProfileAction(profile.id), {
                  onSuccess: () => setDeleteOpen(false),
                })
              }
            >
              <Trash2 />
              Excluir perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
