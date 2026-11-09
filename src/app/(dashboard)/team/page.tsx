'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export default function TeamPage() {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [rbacCollapsed, setRbacCollapsed] = useState(true);

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSuccess(true);
    setTimeout(() => {
      setInviteSuccess(false);
      setInviteModalOpen(false);
      setInviteEmail('');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Equipa & Membros
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gerencie os utilizadores com acesso ao espaço de trabalho da organização.
          </p>
        </div>

        <Button
          variant="brand"
          size="sm"
          onClick={() => setInviteModalOpen(true)}
          className="flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <span>Convidar Membro</span>
        </Button>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base">Membros Ativos (1)</CardTitle>
          <CardDescription className="text-xs">
            Utilizadores autorizados sob controlo de acesso RBAC e RLS.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Utilizador</th>
                  <th className="py-3 px-4">Papel / Função</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                <tr>
                  <td className="py-3 px-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-deep text-white font-bold flex items-center justify-center text-xs">
                      U
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white block">Utilizador Atual (Você)</span>
                      <span className="text-[10px] text-slate-400">admin@meetwise.ai</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="purple">Owner (Proprietário)</Badge>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Ativo
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[11px] text-slate-400 italic">Último Proprietário</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* RBAC Info Card (Collapsible) */}
      <Card className="bg-slate-50/50 dark:bg-slate-900/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Matriz de Papéis & Permissões (RBAC)</CardTitle>
              <CardDescription className="text-xs">
                Estrutura hierárquica implementada na base de dados PostgreSQL.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setRbacCollapsed((prev) => !prev)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            >
              {rbacCollapsed ? '➕ Expandir Colunas RBAC' : '➖ Colapsar Colunas RBAC'}
            </button>
          </div>
        </CardHeader>
        {!rbacCollapsed && (
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-2">
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Owner</span>
              <p className="text-[11px] text-slate-500">Acesso absoluto, faturação e eliminação da organização.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Admin</span>
              <p className="text-[11px] text-slate-500">Gestão de membros, reuniões e atas sem privilégios de faturação.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Manager</span>
              <p className="text-[11px] text-slate-500">Criação, edição e aprovação de atas e reuniões.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Member</span>
              <p className="text-[11px] text-slate-500">Upload de reuniões e consulta com chat contextual.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Viewer</span>
              <p className="text-[11px] text-slate-500">Acesso estrito de leitura às atas e tarefas atribuídas.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Convidar Membro para a Organização"
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          {inviteSuccess ? (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs text-center font-medium">
              ✓ Convite registado com sucesso!
            </div>
          ) : (
            <>
              <Input
                id="inviteEmail"
                type="email"
                label="Email Profissional *"
                placeholder="colega@empresa.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />

              <Select
                id="inviteRole"
                label="Papel / Permissões"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                options={[
                  { value: 'admin', label: 'Admin (Administrador)' },
                  { value: 'manager', label: 'Manager (Gestor de Atas)' },
                  { value: 'member', label: 'Member (Membro Padrão)' },
                  { value: 'viewer', label: 'Viewer (Apenas Leitura)' },
                ]}
              />

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setInviteModalOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="brand" size="sm" type="submit">
                  Enviar Convite
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
