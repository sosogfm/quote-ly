# Memória por conta + Modo Desenvolvimento no chat existente

## 1. Análise do que já existe

1. **Página de chat**: `src/pages/Workspace.tsx`, rotas `/workspace` e `/workspace/:threadId` em `src/App.tsx`. Sidebar: `src/components/workspace/WorkspaceSidebar.tsx`.
2. **Armazenamento das mensagens**: tabelas `threads` e `chat_messages` no banco (Lovable Cloud), com RLS por usuário. As mensagens são salvas como `parts` (formato AI SDK `UIMessage`) quando o streaming termina.
3. **Estado global**: React Query (provider já montado), `AuthContext` para sessão/role/organização, e `useChat` do AI SDK para o estado da conversa. Não há Redux/Zustand.
4. **Autenticação/permissões**: `AuthProvider` + `ProtectedRoute`; papéis em `user_roles` (`admin`/`manager`/`agent`) via `has_role`. A função de borda `chat` valida o JWT antes de responder.
5. **Reutilizáveis**: componentes AI Elements (`conversation`, `message`, `prompt-input`, `code-block`, `tool`, `shimmer`), e shadcn `tabs`, `resizable`, `sheet`, `switch`, `select`, `badge`, `accordion`, `alert-dialog`, `progress`, `scroll-area`.
6. **Arquivos a modificar**: `Workspace.tsx` (painel + toggle do modo dev), `WorkspaceSidebar.tsx` (nada estrutural, só link de memória), `supabase/functions/chat/index.ts` (injeção de memória + ferramentas de plano).
7. **Novos componentes necessários**: painel lateral com abas, cards de tarefa dentro da mensagem, visualizador de diff, e as interfaces de integração.

Nada da aplicação atual é substituído; tudo é incremental.

## 2. Memória por conta (primeira entrega)

- Nova tabela `user_memories`: tipo (`preference`, `style`, `fact`, `correction`), conteúdo, origem (thread), pontuação de relevância, `user_id` com RLS estrita.
- Nova tabela `user_profile_summary`: um resumo contínuo por conta (estilo de escrita, contexto, preferências), atualizado após as conversas.
- A função `chat` passa a: carregar o resumo + memórias mais relevantes do usuário e injetá-las no prompt do sistema, e expor uma ferramenta `remember` que o modelo chama quando você declara uma preferência ou faz uma correção.
- Também injeta um breve resumo das conversas anteriores da conta (títulos + últimos tópicos), para haver continuidade entre threads.
- Tela de gestão em Configurações: ver, editar e apagar memórias (sem isso, memória vira caixa-preta).

## 3. Modo Desenvolvimento (segunda entrega)

### Interface
- Um `Switch` "Modo Desenvolvimento" ao lado do campo de mensagem, dentro do rodapé do prompt já existente.
- Ativo: barra compacta com repositório, branch, ambiente, status da tarefa e seletor de modo de alteração (Conservador padrão / Equilibrado / Refatoração).
- Desktop: painel retrátil e redimensionável à direita via `ResizablePanelGroup`; o chat nunca é escondido. Mobile: `Sheet` (gaveta) com botão de voltar ao chat.
- Abas: Plano, Alterações, Testes, Preview, Deploy, Logs.

### Cards na conversa
Cards renderizados a partir de partes de ferramenta da mensagem (padrão AI Elements `Tool`), para: plano proposto (Aprovar plano / Solicitar ajustes / Cancelar), progresso, resumo de diff, resultado de testes, alertas de segurança, link de preview, pull request, confirmação de deploy, resultado e rollback.

### Regras de fluxo
- Nenhuma alteração antes de "Aprovar plano". O estado da tarefa segue a máquina de estados pedida (Analisando → Aguardando aprovação → … → Revertida), persistida em novas tabelas `dev_tasks`, `dev_task_events` e `dev_task_files`.
- Botão de deploy desabilitado enquanto: plano não aprovado, testes obrigatórios reprovados, build com erro, alteração perigosa não confirmada, ou usuário sem papel de admin.
- Ações sensíveis (banco, auth, pagamentos, infraestrutura, exclusão) exigem confirmação extra via `AlertDialog`.
- Toda ação vai para uma trilha de auditoria (`dev_task_events` + `audit_logs` existente).

### Integrações
Interfaces em `src/lib/devmode/`: `GitProvider`, `CodeAgent`, `SandboxRunner`, `TestRunner`, `PreviewProvider`, `DeploymentProvider`, `AuditLogger`.

Sem credenciais reais de Git/CI/deploy, essas integrações entram como **adaptadores simulados**, marcados de forma visível na interface com um badge "Demonstração", e nenhum resultado de teste é apresentado como aprovado sem execução real — o adaptador simulado declara explicitamente que não executou nada. O real fica plugável trocando o adaptador quando você conectar GitHub e um provedor de deploy.

## 4. Ordem de execução

1. Migração de banco (memórias + tarefas de dev) e ajuste da função `chat` para usar a memória.
2. Gestão de memórias em Configurações.
3. Painel lateral com abas + toggle do modo dev (só leitura, estados vazios).
4. Cards de plano/aprovação na conversa e a máquina de estados.
5. Visualizador de diff, painel de testes, preview, deploy com bloqueios e auditoria.
6. Testes (vitest) para a máquina de estados, regras de bloqueio de deploy e seleção de memórias.

## 5. Riscos conhecidos

- Sem GitHub/CI conectados, o ciclo de código/deploy permanece simulado de ponta a ponta.
- Injeção de memória aumenta o tamanho do prompt; será limitada por relevância e quantidade.
- Conteúdo de repositório é tratado como não confiável (isolado em blocos de dados no prompt) para reduzir prompt injection.
