import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MEETWISE AI — Inteligência Artificial para Reuniões',
  description: 'Transforme gravações de reuniões em atas executivas, decisões e tarefas verificáveis.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt">
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
