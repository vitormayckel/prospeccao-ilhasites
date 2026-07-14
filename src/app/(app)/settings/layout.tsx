import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Perfis de pesquisa, integrações, score e preferências."
      />
      <SettingsNav />
      <div className="pt-2">{children}</div>
    </div>
  );
}
