'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding } from '@/modules/organizations/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function OnboardingPage() {
  const router = useRouter();

  // Wizard state (steps 1 to 5)
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [locale, setLocale] = useState<'pt' | 'pt-BR' | 'en' | 'es' | 'fr'>('pt');
  const [roleTitle, setRoleTitle] = useState('Gestor de Projeto');

  const [organizationName, setOrganizationName] = useState('');
  const [hasInvite, setHasInvite] = useState(false);
  const [inviteToken, setInviteToken] = useState('');

  const [transcriptionDialect, setTranscriptionDialect] = useState('pt-PT');
  const [minuteTemplate, setMinuteTemplate] = useState('executive');
  const [timezone, setTimezone] = useState('Europe/Lisbon');

  // Slug preview
  const slugPreview = organizationName
    ? organizationName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : 'minha-empresa';

  const handleNext = () => {
    setErrorMessage(null);
    if (step === 2 && !fullName.trim()) {
      setErrorMessage('Por favor, indique o seu nome completo.');
      return;
    }
    if (step === 3 && !hasInvite && !organizationName.trim()) {
      setErrorMessage('Por favor, indique o nome da sua organização.');
      return;
    }
    if (step === 3 && hasInvite && !inviteToken.trim()) {
      setErrorMessage('Por favor, introduza o código de convite recebido.');
      return;
    }
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setErrorMessage(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = async () => {
    setErrorMessage(null);
    setLoading(true);

    try {
      const result = await completeOnboarding({
        fullName: fullName.trim() || 'Utilizador MeetWise',
        locale,
        roleTitle,
        organizationName: organizationName.trim() || 'Minha Organização',
        transcriptionDialect,
        minuteTemplate,
        timezone,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Falha ao guardar configuração.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado durante a ativação.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  const stepTitles = [
    'Boas-vindas',
    'O seu Perfil',
    'Organização',
    'Preferências',
    'Conclusão',
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 transition-colors duration-200">
      {/* Top bar */}
      <header className="w-full max-w-3xl mx-auto flex items-center justify-between pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-deep via-brand-blue to-brand-violet flex items-center justify-center shadow-md text-white font-bold">
            M
          </div>
          <div>
            <h1 className="font-bold text-base">MEETWISE AI</h1>
            <p className="text-[11px] text-slate-500">Configuração Inicial do Espaço de Trabalho</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main wizard container */}
      <main className="w-full max-w-2xl mx-auto my-auto">
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-brand-blue dark:text-blue-400">
              Passo {step} de 5: {stepTitles[step - 1]}
            </span>
            <span className="text-xs font-mono text-slate-400">
              {Math.round((step / 5) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-blue to-brand-violet transition-all duration-300 rounded-full"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
          >
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <Card className="shadow-xl">
            <CardHeader className="text-center pt-8 pb-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-blue/10 text-brand-blue mx-auto flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <CardTitle className="text-2xl font-bold">Bem-vindo ao MEETWISE AI</CardTitle>
              <CardDescription className="text-sm max-w-md mx-auto mt-2">
                A sua plataforma inteligente para transformar reuniões áudio e vídeo em decisões claras, tarefas e atas executivas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <div className="font-semibold text-xs text-brand-blue mb-1">✓ Transcrição com Diarização</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Separação rigorosa de oradores e tempos milissegundo a milissegundo.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <div className="font-semibold text-xs text-emerald-600 mb-1">✓ Evidência Verbatim</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Cada decisão ancorada no áudio original para eliminar alucinações.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <div className="font-semibold text-xs text-brand-violet mb-1">✓ Isolamento Multi-tenant</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Segurança de base de dados PostgreSQL RLS garantida por organização.</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                  <div className="font-semibold text-xs text-amber-600 mb-1">✓ Plano Free Ativo</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">45 minutos de processamento incluídos sem custos adicionais.</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-4 flex justify-end">
              <Button variant="brand" onClick={handleNext} className="px-6">
                Começar Configuração →
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 2: Profile */}
        {step === 2 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">O seu Perfil Profissional</CardTitle>
              <CardDescription>
                Como prefere ser identificado pelos colegas e nas atas geradas?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                id="fullName"
                label="Nome Completo *"
                placeholder="Ex: Dra. Teresa Ferreira"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />

              <Select
                id="roleTitle"
                label="Cargo / Função Principal"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                options={[
                  { value: 'CEO / Diretor Executivo', label: 'CEO / Diretor Executivo' },
                  { value: 'Gestor de Projeto', label: 'Gestor de Projeto' },
                  { value: 'Diretor de Tecnologia / Engenharia', label: 'Diretor de Tecnologia / Engenharia' },
                  { value: 'Consultor / Assessor', label: 'Consultor / Assessor' },
                  { value: 'Advogado / Assuntos Jurídicos', label: 'Advogado / Assuntos Jurídicos' },
                  { value: 'Outro', label: 'Outro' },
                ]}
              />

              <Select
                id="locale"
                label="Idioma da Interface"
                value={locale}
                onChange={(e) => setLocale(e.target.value as 'pt' | 'pt-BR' | 'en' | 'es' | 'fr')}
                options={[
                  { value: 'pt', label: 'Português (Portugal)' },
                  { value: 'pt-BR', label: 'Português (Brasil)' },
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Español' },
                ]}
              />
            </CardContent>
            <CardFooter className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}>
                ← Voltar
              </Button>
              <Button variant="brand" onClick={handleNext}>
                Próximo Passo →
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 3: Organization */}
        {step === 3 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Espaço de Trabalho & Organização</CardTitle>
              <CardDescription>
                Crie um novo espaço multi-tenant ou junte-se a uma organização existente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setHasInvite(false)}
                  className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                    !hasInvite
                      ? 'border-brand-blue text-brand-blue'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Criar Nova Organização
                </button>
                <button
                  type="button"
                  onClick={() => setHasInvite(true)}
                  className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                    hasInvite
                      ? 'border-brand-blue text-brand-blue'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Tenho um Código de Convite
                </button>
              </div>

              {!hasInvite ? (
                <div className="space-y-4">
                  <Input
                    id="orgName"
                    label="Nome da Organização ou Empresa *"
                    placeholder="Ex: Acrópole Soluções Lda"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                  />

                  <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 block mb-1">Identificador Único (Slug do Espaço):</span>
                    <code className="text-brand-blue font-mono font-semibold">
                      meetwise.ai/org/{slugPreview}-[random]
                    </code>
                    <p className="mt-1 text-[11px] text-slate-500">
                      O seu papel inicial será <strong>Proprietário (Owner)</strong> com controlo total de membros e faturação.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Input
                    id="inviteToken"
                    label="Código de Convite *"
                    placeholder="Ex: inv_9f2a7b..."
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    required
                  />
                  <p className="text-xs text-slate-500">
                    O código foi-lhe enviado por email pelo administrador da organização.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}>
                ← Voltar
              </Button>
              <Button variant="brand" onClick={handleNext}>
                Próximo Passo →
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 4: Preferences */}
        {step === 4 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Preferências de Inteligência de Reunião</CardTitle>
              <CardDescription>
                Personalize o modelo de transcrição e a formatação das atas da sua organização.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                id="transcriptionDialect"
                label="Dialeto Principal de Transcrição"
                value={transcriptionDialect}
                onChange={(e) => setTranscriptionDialect(e.target.value)}
                options={[
                  { value: 'pt-PT', label: 'Português de Portugal (PT-PT)' },
                  { value: 'pt-AO', label: 'Português de Angola (PT-AO)' },
                  { value: 'pt-BR', label: 'Português do Brasil (PT-BR)' },
                  { value: 'en-US', label: 'Inglês (Internacional / US)' },
                  { value: 'es-ES', label: 'Espanhol (ES)' },
                ]}
              />

              <Select
                id="minuteTemplate"
                label="Estilo Padrão de Atas Executivas"
                value={minuteTemplate}
                onChange={(e) => setMinuteTemplate(e.target.value)}
                options={[
                  { value: 'executive', label: 'Executivo Sintético (Decisões & Prazos)' },
                  { value: 'full_deliberations', label: 'Completo com Deliberações e Oradores' },
                  { value: 'technical_tasks', label: 'Técnico com Matriz de Tarefas' },
                ]}
              />

              <Select
                id="timezone"
                label="Fuso Horário Padrão"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                options={[
                  { value: 'Europe/Lisbon', label: 'Lisboa (GMT / WET)' },
                  { value: 'Atlantic/Madeira', label: 'Madeira (WET)' },
                  { value: 'Atlantic/Azores', label: 'Açores (AZOT)' },
                  { value: 'Africa/Luanda', label: 'Luanda (WAT)' },
                  { value: 'Africa/Maputo', label: 'Maputo (CAT)' },
                  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
                ]}
              />
            </CardContent>
            <CardFooter className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack}>
                ← Voltar
              </Button>
              <Button variant="brand" onClick={handleNext}>
                Rever Configuração →
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* STEP 5: Final Review & Launch */}
        {step === 5 && (
          <Card className="shadow-xl">
            <CardHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <CardTitle className="text-xl">Tudo Pronto para Começar!</CardTitle>
              <CardDescription>
                Confirme o resumo das suas configurações antes de aceder ao painel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2 text-xs">
                <div className="flex justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                  <span className="text-slate-500">Utilizador:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{fullName || 'Utilizador'} ({roleTitle})</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                  <span className="text-slate-500">Organização:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{organizationName || 'Minha Organização'}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                  <span className="text-slate-500">Plano Ativo:</span>
                  <Badge variant="outline">Gratuito (45 min/mês)</Badge>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                  <span className="text-slate-500">Dialeto STT:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{transcriptionDialect}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fuso Horário:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{timezone}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-brand-blue flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>A infraestrutura multi-tenant criará a sua organização com isolamento seguro PostgreSQL RLS.</span>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between pt-4">
              <Button variant="ghost" onClick={handleBack} disabled={loading}>
                ← Voltar
              </Button>
              <Button
                variant="brand"
                onClick={handleFinish}
                isLoading={loading}
                className="px-6 shadow-md shadow-brand-blue/20"
              >
                Ativar Espaço & Abrir Dashboard
              </Button>
            </CardFooter>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-xs text-slate-400 dark:text-slate-600 pt-6">
        MEETWISE AI — Onboarding Seguro Multi-tenant
      </footer>
    </div>
  );
}
