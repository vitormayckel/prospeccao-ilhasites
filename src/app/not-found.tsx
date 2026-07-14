import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        action={
          <Button asChild>
            <Link href="/">Voltar ao início</Link>
          </Button>
        }
        className="border-none"
      />
    </div>
  );
}
