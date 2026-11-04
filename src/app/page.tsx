export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl space-y-4">
        <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground">
          MeetWise AI — Fundação Técnica v1.1
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          MEETWISE AI
        </h1>
        <p className="text-lg text-muted-foreground">
          Plataforma SaaS Multi-Tenant de Inteligência Artificial para Reuniões.
          Arquitetura independente, RLS ativo, isolamento de organizações e modelo financeiro verificado.
        </p>
      </div>
    </main>
  );
}
