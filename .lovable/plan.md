# Central de Evolução — Etapa 1 (MVP seguro)

## 1. Diagnóstico da arquitetura atual

- **Stack**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui. Backend = Lovable Cloud (Postgres + Auth + Edge Functions em Deno).
- **Autenticação/autorização**: `AuthProvider` (`src/contexts/AuthContext.tsx`) expõe `user`, `role`, `organization`; `ProtectedRoute` protege rotas. Papéis ficam na tabela separada `user_roles` (`admin`/`manager`/`agent`) e são verificados no banco pela função segura `has_role(uuid, app_role)`. Já existe trigger que concede admin ao seu e-mail.
- **IA**: função de borda `chat` já usa o Lovable AI Gateway (AI SDK v7, streaming, ferramentas, memória por conta). A chave da IA vive só no backend — nenhum segredo no navegador.
- **Auditoria**: tabela `audit_logs` já existe (insert/update/delete bloqueados por RLS, gravada por triggers `security definer`).
- **Já no banco, mas sem interface**: `dev_tasks`, `dev_task_events`, `dev_task_files` — criadas numa entrega anterior do "Modo Desenvolvimento" e nunca usadas. Serão **reaproveitadas** como base, não duplicadas.
- **Layouts reutilizáveis**: `DashboardLayout` (área administrativa) e `Workspace` (chat). A Central de Evolução entra no `DashboardLayout`.
- **Sem integração com GitHub/CI hoje** → a Etapa 1 opera obrigatoriamente em **modo patch manual**, deixando explícito na interface que nada foi aplicado.

## 2. Arquivos criados e alterados

Criados:
- `src/pages/Evolution.tsx` — dashboard + lista de propostas com filtros e busca.
- `src/pages/EvolutionProposal.tsx` — detalhe da proposta (diff, riscos, testes, rollback, histórico, ações).
- `src/components/evolution/ProposalCard.tsx`, `RiskBadge.tsx`, `StatusBadge.tsx`, `DiffViewer.tsx`, `ProposalTimeline.tsx`, `NewProposalDialog.tsx`, `ApproveDialog.tsx`.
- `src/lib/evolution/types.ts` — estados, níveis de risco, esquema de validação (zod) da saída do modelo.
- `src/lib/evolution/transitions.ts` — máquina de estados e regras de bloqueio (função pura, testável).
- `src/components/AdminRoute.tsx` — guarda de rota por papel de administrador.
- `supabase/functions/evolution-propose/index.ts` — gera a proposta estruturada.
- `supabase/functions/evolution-action/index.ts` — aprovar/rejeitar/pedir revisão/registrar teste/marcar aplicado/rollback.
- Testes em `src/test/evolution/`: máquina de estados, validação da saída do modelo, regras de bloqueio de aplicação, guarda de acesso.

Alterados:
- `src/App.tsx` — rotas `/evolution` e `/evolution/:id` sob `AdminRoute`.
- `src/components/DashboardLayout.tsx` — item de menu "Central de Evolução" visível só para admin.
- Nenhuma alteração no fluxo de chat, propostas comerciais, clientes ou templates.

## 3. Plano de implementação (Etapa 1)

**Banco (uma migração)** — novas tabelas, todas com RLS restrita a admin:
- `evolution_proposals`: título, problema, evidências, solução, impacto, riscos, `risk_level`, `status`, plano de rollback, testes exigidos, custo estimado, `requires_migration`, autor, `created_at`.
- `evolution_patch_files`: proposta, caminho, tipo de mudança, motivo, diff/patch, aplicado (bool).
- `evolution_test_runs`: proposta, nome do teste, resultado, saída, obrigatório, executado por, quando.
- `evolution_approvals`: proposta, decisão (aprovado/rejeitado/revisão), justificativa, quem decidiu, quando.
- `evolution_events`: trilha de auditoria imutável (sem update/delete) de cada transição e ação.
- `evolution_versions` / `evolution_deployments`: versão anterior registrada, aplicação e rollback.
- `evolution_feedback` e `evolution_error_reports`: fontes de evidência (feedback do usuário e erros), tratadas como dados não confiáveis.

Regras de acesso: leitura e escrita apenas para `has_role(auth.uid(),'admin')`; `evolution_feedback` aceita inserção de qualquer usuário autenticado (é o canal de feedback), leitura só admin; `evolution_events` nunca pode ser editada nem apagada. GRANTs explícitos para `authenticated` e `service_role`.

**Motor de autoaprimoramento** (`evolution-propose`):
- Valida o JWT e confirma o papel admin no banco antes de qualquer coisa.
- Monta o contexto: solicitação do admin, feedbacks e erros selecionados, e um inventário de arquivos permitidos (lista controlada — nunca `.env`, `client.ts`, `types.ts`, `previewAuthStorage.ts`, `config.toml`).
- Chama o Lovable AI Gateway pedindo **saída estruturada** no formato exigido (title, problem, evidence, solution, affectedFiles, patch, riskLevel, risks, tests, rollbackPlan, requiresMigration) e valida com zod. Saída inválida → 400, nada é salvo.
- Grava a proposta sempre em `draft` → `awaiting_review`. **Nunca** aplica nada.
- Feedbacks, erros e conteúdo de arquivos entram no prompt dentro de blocos de dados marcados como não confiáveis; instruções embutidas neles são ignoradas por política explícita do prompt.
- Limite de tamanho de entrada e rate limiting por usuário (contagem de propostas por janela de tempo).

**Ações administrativas** (`evolution-action`):
- Toda transição passa por aqui, com verificação de papel admin no servidor e validação da transição contra a máquina de estados. O frontend só reflete o que o backend permite.
- O autor da proposta gerada pela IA é o sistema; a aprovação exige um admin autenticado e é registrada com identidade e horário. Uma proposta em `awaiting_review` só avança com decisão explícita.
- Aplicação (`ready_to_deploy` → `deployed`) é bloqueada se: não houver aprovação registrada, algum teste obrigatório estiver reprovado ou pendente, ou `requires_migration` sem confirmação adicional.
- Nada de execução de shell, SQL arbitrário ou comandos vindos do cliente: apenas um conjunto fechado de ações nomeadas.

**Interface**:
- Dashboard com contadores: pendentes, aprovadas, implantadas, falhas recentes, rollbacks.
- Lista com filtros de status/risco/data, busca e indicador visual de risco.
- Detalhe com descrição técnica e não técnica, arquivos afetados, diff colorido, testes, riscos, plano de rollback e histórico.
- Ações: aprovar, rejeitar com justificativa, pedir revisão, registrar teste, marcar como aplicado, rollback.
- Diálogo de confirmação antes de aprovar com o texto: "Você está aprovando uma alteração no código do sistema. Revise o diff, os riscos, os testes e o plano de rollback." Risco alto ou crítico exige uma segunda confirmação (digitar a palavra de confirmação).
- Banner permanente em modo manual: o patch **aguarda aplicação manual**, com instruções de aplicação e botão de copiar o diff. Nenhum estado finge que o código mudou.

**Testes (vitest)**: usuário comum sem acesso à Central; admin cria e revisa; proposta não aplicável sem aprovação; saída inválida do modelo recusada; risco alto exige segunda confirmação; teste obrigatório reprovado impede aplicação; rollback restaura versão anterior registrada; nenhum segredo aparece em log ou resposta.

## 4. Riscos e dependências

- **Aplicação real de código**: nem o navegador nem uma função de borda podem escrever no repositório. A Etapa 1 entrega o patch para aplicação manual; a aplicação automática depende da Etapa 2 (GitHub App/token + CI), que exigirá que você configure as credenciais — vou te dar as instruções quando chegarmos lá.
- **Contexto de código para a IA**: sem GitHub, o modelo só vê os arquivos que você colar ou os caminhos que você informar. Em Etapa 1 o campo de contexto é manual; a leitura automática do repositório vem com a integração.
- **Prompt injection** via feedbacks e logs: mitigado por isolamento em blocos de dados e por a IA nunca ter poder de execução.
- **Custo de IA**: cada geração de proposta consome créditos; há rate limiting para conter uso acidental.
- **Escalada de privilégio**: nenhuma ação da Central toca `user_roles`, RLS ou autenticação; propostas que envolvam esses pontos são marcadas como risco crítico e continuam exigindo aprovação humana em duas etapas.

## 5. Etapas seguintes (após aprovação desta)

- **Etapa 2**: integração com GitHub — branch por proposta, commits descritivos, PR vinculado, testes no CI, merge só com aprovação. Requer que você crie um token/GitHub App e o configure como segredo.
- **Etapa 3**: implantação supervisionada, monitoramento pós-implantação e rollback automatizado sempre iniciado por um administrador.
