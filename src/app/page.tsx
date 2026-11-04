'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';

export default function LandingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const faqs = [
    {
      q: 'Como garante o MEETWISE AI que a IA não inventa decisões (alucinações)?',
      a: 'Ao contrário de assistentes genéricos, o MEETWISE AI aplica a arquitetura Verbatim Grounding: cada decisão, tarefa ou ponto-chave de ata está obrigatoriamente ancorado num extrato literal da transcrição e no carimbo temporal exato da reunião. Se não existir evidência verificável no áudio, a plataforma sinaliza explicitamente como não comprovado.',
    },
    {
      q: 'Como é assegurado o isolamento de dados entre diferentes empresas?',
      a: 'Utilizamos uma infraestrutura multi-tenant com Row-Level Security (RLS) nativo no PostgreSQL. Cada consulta e mutação de base de dados valida a identidade criptográfica e a pertença à organização do utilizador. Nenhuma organização consegue visualizar ou modificar dados de outra.',
    },
    {
      q: 'Os ficheiros de áudio e atas são utilizados para treinar modelos públicos?',
      a: 'Não. Os dados da sua organização nunca são utilizados para treinar modelos públicos de inteligência artificial. Mantemos acordos estritos de processamento de dados (DPA) em conformidade com o RGPD/GDPR europeu.',
    },
    {
      q: 'Que línguas e dialetos de português são suportados?',
      a: 'O motor de transcrição e diarização foi calibrado especialmente para Português Europeu (PT-PT), Português de Angola (PT-AO), Português do Brasil (PT-BR) e mais de 30 línguas internacionais com deteção automática de idioma.',
    },
    {
      q: 'Posso experimentar sem introduzir cartão de crédito?',
      a: 'Sim! O plano gratuito inclui 45 minutos de processamento mensal permanente, sem necessidade de cartão de crédito para registo. Pode testar todas as funcionalidades nucleares imediatamente.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-brand-blue selection:text-white transition-colors duration-200">
      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group focus:outline-none">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-deep via-brand-blue to-brand-violet flex items-center justify-center shadow-md shadow-brand-blue/20 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-brand-deep to-brand-blue dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                MEETWISE<span className="text-brand-blue ml-0.5">AI</span>
              </span>
              <span className="text-[9px] text-slate-500 tracking-wider font-semibold uppercase">
                Inteligência de Reuniões
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#funcionalidades" className="hover:text-brand-blue dark:hover:text-brand-blue transition-colors">Funcionalidades</a>
            <a href="#como-funciona" className="hover:text-brand-blue dark:hover:text-brand-blue transition-colors">Como Funciona</a>
            <a href="#precos" className="hover:text-brand-blue dark:hover:text-brand-blue transition-colors">Preços</a>
            <a href="#seguranca" className="hover:text-brand-blue dark:hover:text-brand-blue transition-colors">Segurança</a>
            <a href="#faq" className="hover:text-brand-blue dark:hover:text-brand-blue transition-colors">Perguntas Frequentes</a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button variant="brand" size="sm">Começar Grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue dark:text-blue-400 text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
            Nova Geração: Transcrição com Evidência Verbatim e Diarização
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl mx-auto leading-[1.15]">
            Transforme reuniões em{' '}
            <span className="bg-gradient-to-r from-brand-blue via-brand-violet to-brand-deep bg-clip-text text-transparent">
              decisões, tarefas e atas profissionais
            </span>{' '}
            com inteligência artificial
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Elimine notas manuais e decisões perdidas. O MEETWISE AI transcreve com identificação de oradores, resume deliberações e ancora cada compromisso na transcrição exata, protegido por isolamento multi-tenant de nível empresarial.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto">
              <Button variant="brand" size="lg" className="w-full sm:w-auto shadow-lg shadow-brand-blue/25 text-base px-8">
                Começar Grátis (45 min/mês)
              </Button>
            </Link>
            <a href="#demonstracao" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base">
                Ver Demonstração Visual
              </Button>
            </a>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">✓ Sem cartão de crédito</span>
            <span className="flex items-center gap-1.5">✓ RGPD & RLS PostgreSQL</span>
            <span className="flex items-center gap-1.5">✓ Suporte PT-PT, PT-AO e PT-BR</span>
          </div>
        </div>

        {/* Visual Dashboard Preview (Marked as Visual Demo) */}
        <div id="demonstracao" className="mt-14 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-2xl p-2 bg-gradient-to-b from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900 shadow-2xl border border-slate-300/60 dark:border-slate-700/60">
            {/* Header badge indicator */}
            <div className="absolute -top-3.5 right-6 z-10">
              <Badge variant="purple" className="shadow-md font-semibold text-xs tracking-wide">
                Demonstração Visual da Plataforma
              </Badge>
            </div>

            <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {/* Mock Dashboard Topbar */}
              <div className="h-12 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="ml-3 text-xs font-medium text-slate-500">app.meetwise.ai/reunioes/alinhamento-trimestral-q1</span>
                </div>
                <Badge variant="success" className="text-[10px]">Atas & Decisões Validadas</Badge>
              </div>

              {/* Mock Dashboard Content Area */}
              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
                {/* Left col: Meeting Details & Grounded Decisions */}
                <div className="lg:col-span-7 space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">Comité de Direção</Badge>
                      <span className="text-xs text-slate-400">04 de Novembro • 42 min</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Alinhamento Estratégico Q1 & Lançamento de Produto
                    </h3>
                  </div>

                  {/* Summary card */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-blue mb-2">Resumo Executivo</h4>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      A equipa aprovou o orçamento de 15.000€ para a campanha internacional de Q1, definiu a data limite de 15 de Dezembro para o congelamento de código e nomeou a Engenheira Teresa Ferreira como responsável de conformidade técnica.
                    </p>
                  </div>

                  {/* Verbatim Grounded Decisions */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Decisões Verificáveis com Ancoragem Verbatim
                    </h4>

                    <div className="space-y-3">
                      <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-950/80 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-emerald-800 dark:text-emerald-300">Decisão Aprovada #1</span>
                          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">Timestamp [14:22]</span>
                        </div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          Alocação orçamental de 15.000€ aprovada por unanimidade para o plano de marketing Q1.
                        </p>
                        <div className="mt-2 text-[11px] text-slate-500 italic bg-white/70 dark:bg-slate-900/60 p-2 rounded border border-slate-200/50 dark:border-slate-800">
                          &quot;Fica então aprovada por todos a verba de 15 mil euros para o marketing digital de lançamento.&quot; — <strong>Pedro Henriques (CEO)</strong>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-950/80 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-emerald-800 dark:text-emerald-300">Decisão Aprovada #2</span>
                          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">Timestamp [28:40]</span>
                        </div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          Fixação de 15 de Dezembro como data estrita de congelamento de funcionalidades da versão 2.0.
                        </p>
                        <div className="mt-2 text-[11px] text-slate-500 italic bg-white/70 dark:bg-slate-900/60 p-2 rounded border border-slate-200/50 dark:border-slate-800">
                          &quot;A partir do dia 15 de Dezembro ninguém mexe no backend, foco total em auditoria e testes.&quot; — <strong>Teresa Ferreira (CTO)</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right col: Action Items & Transcript Snippet */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Action items */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center justify-between">
                      <span>Tarefas Identificadas (3)</span>
                      <span className="text-[10px] text-brand-blue font-semibold">100% Atribuídas</span>
                    </h4>

                    <div className="space-y-2.5">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-900 dark:text-white">Finalizar plano de contingência</p>
                          <span className="text-[10px] text-slate-500">Resp: Teresa Ferreira • Prazo: 10 Nov</span>
                        </div>
                        <Badge variant="warning" className="text-[10px]">Pendente</Badge>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-900 dark:text-white">Contratar agência de design</p>
                          <span className="text-[10px] text-slate-500">Resp: Carlos Ramos • Prazo: 18 Nov</span>
                        </div>
                        <Badge variant="default" className="text-[10px]">Em curso</Badge>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-900 dark:text-white">Submeter relatório de despesas Q3</p>
                          <span className="text-[10px] text-slate-500">Resp: Ana Dias • Prazo: 06 Nov</span>
                        </div>
                        <Badge variant="success" className="text-[10px]">Concluído</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Diarization snippet */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      Extrato da Transcrição com Oradores
                    </h4>
                    <div className="space-y-3 font-mono text-[11px]">
                      <div>
                        <div className="flex items-center gap-1.5 text-brand-blue font-bold">
                          <span>[14:15] Pedro Henriques (Orador 1):</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 pl-2 border-l border-brand-blue/30 mt-0.5">
                          Temos de fechar a rubrica de aquisição de tráfego. O que acham dos 15 mil?
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-brand-violet font-bold">
                          <span>[14:20] Carlos Ramos (Orador 2):</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 pl-2 border-l border-brand-violet/30 mt-0.5">
                          De acordo. Cobre os canais principais e mantém a reserva de segurança.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Features Section */}
      <section id="funcionalidades" className="py-20 bg-white dark:bg-slate-900/50 border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-blue mb-2">Recursos Profissionais</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Tudo o que a sua organização precisa para reuniões produtivas
            </p>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Construído de raiz com foco em rigor, integridade de informação e conformidade estrita de privacidade corporativa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-brand-blue flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Transcrição Fiel & Oradores</CardTitle>
                <CardDescription>
                  Diarização inteligente que separa quem disse o quê, com suporte nativo a múltiplos dialetos e carimbos temporais precisos.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Decisões com Evidência Verbatim</CardTitle>
                <CardDescription>
                  Proteção anti-alucinação: cada decisão acordada remete para a frase exata pronunciada na reunião com prova de contexto.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-brand-violet flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Tarefas com Donos e Prazos</CardTitle>
                <CardDescription>
                  Deteção automática de itens de ação, datas de entrega e responsáveis, prontos para sincronização ou acompanhamento.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Chat Contextual IA</CardTitle>
                <CardDescription>
                  Faça perguntas em linguagem natural sobre o histórico de qualquer reunião e obtenha respostas imediatas com citação de fonte.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Exportação Executiva</CardTitle>
                <CardDescription>
                  Gere atas formais em formato DOCX, PDF e Markdown em apenas um clique, prontas para aprovação formal de administração.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Isolamento Multi-Tenant RLS</CardTitle>
                <CardDescription>
                  Separação estrita de dados no PostgreSQL com políticas de segurança ao nível da linha (RLS), RBAC e proteção de dados corporativos.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* 4. How It Works Section */}
      <section id="como-funciona" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-blue mb-2">Fluxo Simples & Eficiente</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Como funciona o MEETWISE AI em 3 passos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center">
              <div className="w-12 h-12 rounded-full bg-brand-blue/10 text-brand-blue font-bold text-xl flex items-center justify-center mx-auto mb-4">
                1
              </div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Carregar Gravação</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Faça o upload do ficheiro de áudio ou vídeo (MP3, WAV, MP4, M4A) ou integre a sua plataforma de videoconferência.
              </p>
            </div>

            <div className="relative p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center">
              <div className="w-12 h-12 rounded-full bg-brand-violet/10 text-brand-violet font-bold text-xl flex items-center justify-center mx-auto mb-4">
                2
              </div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Processamento Inteligente</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                O motor IA transcreve, identifica os intervenientes e extrai deliberações com fundamentação literal imediata.
              </p>
            </div>

            <div className="relative p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xl flex items-center justify-center mx-auto mb-4">
                3
              </div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Rever, Exportar & Agir</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Valide as atas com a sua equipa, atribua tarefas e exporte documentos executivos em PDF ou Word com um clique.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Pricing Section */}
      <section id="precos" className="py-20 bg-white dark:bg-slate-900/50 border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-blue mb-2">Planos Transparentes</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Preços dimensionados para equipas de qualquer dimensão
            </p>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
              Sem custos ocultos ou cobranças inesperadas. Escolha o plano ideal para a sua cadência de reuniões.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Free */}
            <Card className="flex flex-col justify-between">
              <CardHeader>
                <Badge variant="outline" className="w-fit mb-2">Gratuito</Badge>
                <CardTitle className="text-2xl font-bold">0 €</CardTitle>
                <span className="text-xs text-slate-500">Para sempre / sem cartão</span>
                <CardDescription className="mt-3">
                  Ideal para testar a inteligência de atas em pequenas reuniões individuais.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                  Inclui:
                </div>
                <div className="flex items-center gap-2">✓ <strong>45 minutos</strong>/mês</div>
                <div className="flex items-center gap-2">✓ 1 utilizador</div>
                <div className="flex items-center gap-2">✓ Atas com evidência básica</div>
                <div className="flex items-center gap-2">✓ Retenção de 30 dias</div>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button variant="outline" className="w-full">Criar Conta Grátis</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Pro */}
            <Card className="flex flex-col justify-between">
              <CardHeader>
                <Badge variant="default" className="w-fit mb-2 bg-slate-800 text-white">Profissional</Badge>
                <CardTitle className="text-2xl font-bold">19 €<span className="text-sm font-normal text-slate-500"> /mês</span></CardTitle>
                <span className="text-xs text-slate-500">Faturação mensal</span>
                <CardDescription className="mt-3">
                  Perfeito para consultores, gestores de projeto e equipas pequenas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                  Tudo do Gratuito e ainda:
                </div>
                <div className="flex items-center gap-2">✓ <strong>600 minutos</strong>/mês (10h)</div>
                <div className="flex items-center gap-2">✓ Até 3 membros de equipa</div>
                <div className="flex items-center gap-2">✓ Oradores ilimitados</div>
                <div className="flex items-center gap-2">✓ Chat contextual IA</div>
                <div className="flex items-center gap-2">✓ Exportação DOCX e PDF</div>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button variant="brand" className="w-full">Subscrever Pro</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Business (Popular) */}
            <Card className="flex flex-col justify-between border-2 border-brand-blue relative shadow-xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="purple" className="shadow-md">Mais Popular</Badge>
              </div>
              <CardHeader>
                <Badge variant="outline" className="w-fit mb-2 border-brand-blue text-brand-blue">Empresarial</Badge>
                <CardTitle className="text-2xl font-bold">79 €<span className="text-sm font-normal text-slate-500"> /mês</span></CardTitle>
                <span className="text-xs text-slate-500">Faturação mensal</span>
                <CardDescription className="mt-3">
                  Para empresas com reuniões regulares, conselhos de administração e auditoria.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                  Tudo do Pro e ainda:
                </div>
                <div className="flex items-center gap-2">✓ <strong>2.500 minutos</strong>/mês (~42h)</div>
                <div className="flex items-center gap-2">✓ Membros ilimitados</div>
                <div className="flex items-center gap-2">✓ Gestão de papéis RBAC avançada</div>
                <div className="flex items-center gap-2">✓ Auditoria de decisões e revisão</div>
                <div className="flex items-center gap-2">✓ Suporte prioritário 24/7</div>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button variant="brand" className="w-full shadow-md shadow-brand-blue/30">Escolher Business</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Enterprise */}
            <Card className="flex flex-col justify-between">
              <CardHeader>
                <Badge variant="outline" className="w-fit mb-2">Corporativo</Badge>
                <CardTitle className="text-2xl font-bold">Sob Medida</CardTitle>
                <span className="text-xs text-slate-500">Contrato anual</span>
                <CardDescription className="mt-3">
                  Para grandes organizações com requisitos estritos de segurança, SLA e infraestrutura.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                  Tudo do Business e ainda:
                </div>
                <div className="flex items-center gap-2">✓ Minutos e retenção à medida</div>
                <div className="flex items-center gap-2">✓ Autenticação SSO/SAML empresarial</div>
                <div className="flex items-center gap-2">✓ Instância ou VPC dedicada</div>
                <div className="flex items-center gap-2">✓ SLA 99.9% com gestor dedicado</div>
                <div className="flex items-center gap-2">✓ Formação presencial da equipa</div>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button variant="outline" className="w-full">Falar com Vendas</Button>
                </Link>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* 6. Security & Multi-tenant Callout */}
      <section id="seguranca" className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-tr from-brand-deep via-slate-900 to-brand-blue p-8 sm:p-12 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-2xl space-y-4">
              <Badge variant="outline" className="text-white border-white/30 bg-white/10">
                Segurança Corporativa Garantida
              </Badge>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Os seus dados pertencem à sua organização. Ponto final.
              </h3>
              <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                Cada consulta na base de dados é isolada criptograficamente através de Row-Level Security no PostgreSQL. Não partilhamos instâncias com outros serviços, não vendemos dados e os seus ficheiros nunca alimentam modelos de terceiros.
              </p>
            </div>
            <div className="shrink-0">
              <Link href="/register">
                <Button size="lg" className="bg-white text-brand-deep hover:bg-slate-100 font-bold px-8 shadow-lg">
                  Criar Espaço Seguro
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section id="faq" className="py-20 bg-white dark:bg-slate-900/50 border-t border-slate-200/80 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-blue mb-2">Dúvidas Frequentes</h2>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Tudo o que precisa de saber antes de começar
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 font-semibold text-slate-900 dark:text-white hover:text-brand-blue dark:hover:text-brand-blue transition-colors"
                >
                  <span className="text-sm sm:text-base">{faq.q}</span>
                  <span className="text-slate-400 font-mono text-lg shrink-0">
                    {openFaqIndex === idx ? '−' : '+'}
                  </span>
                </button>
                {openFaqIndex === idx && (
                  <div className="px-6 pb-4 pt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/80">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="w-full bg-slate-900 text-slate-400 py-12 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-brand-deep via-brand-blue to-brand-violet flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </div>
              <span className="font-bold text-base text-white">MEETWISE AI</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Plataforma SaaS independente de inteligência artificial para reuniões com fundamentação verbatim e isolamento multi-tenant.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white uppercase tracking-wider mb-3">Produto</h4>
            <ul className="space-y-2">
              <li><a href="#funcionalidades" className="hover:text-white transition-colors">Funcionalidades</a></li>
              <li><a href="#precos" className="hover:text-white transition-colors">Planos e Preços</a></li>
              <li><a href="#demonstracao" className="hover:text-white transition-colors">Demonstração Visual</a></li>
              <li><Link href="/login" className="hover:text-white transition-colors">Acesso ao Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white uppercase tracking-wider mb-3">Segurança & Legal</h4>
            <ul className="space-y-2">
              <li><span className="text-slate-400">Isolamento PostgreSQL RLS</span></li>
              <li><span className="text-slate-400">Conformidade RGPD/GDPR</span></li>
              <li><span className="text-slate-400">Política de Retenção de Dados</span></li>
              <li><span className="text-slate-400">Termos de Serviço</span></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white uppercase tracking-wider mb-3">Início Rápido</h4>
            <p className="mb-3 text-slate-400">
              Registe a sua organização hoje e comece a transcrever reuniões com precisão executiva.
            </p>
            <Link href="/register">
              <Button variant="brand" size="sm" className="w-full">Criar Conta Gratuita</Button>
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <p>© {new Date().getFullYear()} MEETWISE AI. Todos os direitos reservados. Projeto SaaS 100% independente.</p>
          <div className="flex gap-4">
            <span>Versão 2.0</span>
            <span>•</span>
            <span>Ambiente Seguro</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
