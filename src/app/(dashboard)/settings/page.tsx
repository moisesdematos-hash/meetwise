'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';

export default function SettingsPage() {
  const [orgName, setOrgName] = useState('Organização Principal');
  const [dialect, setDialect] = useState('pt-PT');
  const [template, setTemplate] = useState('executive');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Definições da Organização
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Configurações gerais do espaço de trabalho, quotas de IA e gestão de subscrição.
        </p>
      </div>

      {/* 1. General Settings Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Gerais</CardTitle>
          <CardDescription className="text-xs">
            Parâmetros de identificação da empresa e preferências de atas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              ✓ Configurações guardadas com sucesso!
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <Input
              id="orgName"
              label="Nome da Organização"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />

            <Select
              id="dialect"
              label="Dialeto Padrão de Transcrição"
              value={dialect}
              onChange={(e) => setDialect(e.target.value)}
              options={[
                { value: 'pt-PT', label: 'Português de Portugal (PT-PT)' },
                { value: 'pt-AO', label: 'Português de Angola (PT-AO)' },
                { value: 'pt-BR', label: 'Português do Brasil (PT-BR)' },
                { value: 'en-US', label: 'Inglês (Internacional / US)' },
              ]}
            />

            <Select
              id="template"
              label="Estilo Padrão de Atas Executivas"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              options={[
                { value: 'executive', label: 'Executivo Sintético (Decisões & Prazos)' },
                { value: 'full_deliberations', label: 'Completo com Deliberações' },
                { value: 'technical_tasks', label: 'Técnico com Matriz de Tarefas' },
              ]}
            />

            <div className="pt-2">
              <Button type="submit" variant="brand" size="sm">
                Guardar Alterações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Subscription & Usage Quota */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Plano & Quota de Minutos</CardTitle>
            <Badge variant="outline">Plano Gratuito</Badge>
          </div>
          <CardDescription className="text-xs">
            Monitorização de consumo de processamento de áudio com inteligência artificial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex justify-between font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Minutos Utilizados este Mês:</span>
              <span className="text-brand-blue font-bold">0 de 45 minutos (0%)</span>
            </div>
            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-blue rounded-full" style={{ width: '0%' }} />
            </div>
            <p className="text-[11px] text-slate-400">
              A quota mensal renova-se automaticamente no dia 1 de cada mês.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-brand-blue/30 bg-brand-blue/5">
            <div>
              <span className="font-bold text-slate-900 dark:text-white block">Evoluir para o Plano Pro (19 €/mês)</span>
              <span className="text-slate-500 text-[11px]">Obtenha 600 minutos/mês (10h), 3 membros e exportação DOCX/PDF.</span>
            </div>
            <Button variant="brand" size="sm" className="shrink-0">
              Upgrade de Plano
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. Security & Danger Zone */}
      <Card className="border-rose-200 dark:border-rose-950/60">
        <CardHeader>
          <CardTitle className="text-base text-rose-700 dark:text-rose-400">Zona de Perigo</CardTitle>
          <CardDescription className="text-xs">
            Ações irreversíveis protegidas por validação de último proprietário no PostgreSQL.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <p>
            A eliminação da organização removerá permanentemente todas as atas, ficheiros de áudio, transcrições e tarefas associadas.
          </p>
          <p className="font-semibold text-rose-600 dark:text-rose-400">
            Apenas o utilizador com papel de Proprietário (Owner) pode executar esta ação.
          </p>
        </CardContent>
        <CardFooter className="pt-2">
          <Button variant="destructive" size="sm">
            Eliminar Organização
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
