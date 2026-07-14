export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <span className="font-mono text-xs uppercase tracking-widest text-accent">
        Fase 0 — Fundação
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-text-primary">
        Ilha Prospect
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        Sistema Operacional de Prospecção Comercial da Ilha Sites. Ambiente base
        configurado e rodando. As telas do produto serão construídas nas
        próximas fases.
      </p>

      <div className="mt-8 rounded-card border border-border-subtle bg-surface-1 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Status da fundação
        </p>
        <ul className="mt-3 space-y-2 text-sm text-text-secondary">
          <li>Next.js 14 (App Router) + TypeScript strict</li>
          <li>Tailwind CSS com tokens do Blueprint (tema escuro)</li>
          <li>Estrutura de pastas por domínio</li>
          <li>Client Supabase preparado (via variáveis de ambiente)</li>
        </ul>
      </div>
    </main>
  );
}
