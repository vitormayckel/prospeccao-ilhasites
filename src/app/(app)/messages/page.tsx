import Link from "next/link";
import { LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { MessagesBoard } from "@/features/messages/components/messages-board";
import { createServerContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { repositories } = await createServerContext();
  const rows = await repositories.messages.listContactBoard();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Central de abordagens"
        title="Mensagens"
        description="Cada empresa em contato, pelo estado atual. Preparada não significa enviada — a confirmação é sempre manual."
        actions={
          <Button variant="secondary" asChild>
            <Link href="/messages/templates">
              <LibraryBig />
              Templates
            </Link>
          </Button>
        }
      />

      <MessagesBoard rows={rows} />
    </div>
  );
}
