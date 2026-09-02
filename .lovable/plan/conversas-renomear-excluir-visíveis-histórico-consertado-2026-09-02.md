# Conversas: renomear/excluir visíveis + histórico consertado

## 1. Renomear e excluir não aparecem

As opções existem, mas o botão de três pontinhos só surge quando o mouse passa por cima do item (está invisível por padrão). Em tela menor ou no toque, ele nunca aparece.

Correção:
- Deixar o botão de opções sempre visível em cada conversa da barra lateral (sem depender de hover).
- Manter o menu com "Renomear" e "Excluir" (com diálogo de confirmação, como já está).
- Adicionar também um botão de limpeza: "Excluir conversas vazias", que remove de uma vez as conversas sem nenhuma mensagem.

## 2. Histórico vazio em algumas conversas

Verificação no banco: das 25 conversas mais recentes, 12 têm zero mensagens salvas — são restos do bug antigo em que cada mensagem criava uma nova conversa. As mensagens ficaram numa conversa e o título ficou em outra, vazia. Não há como recuperar o conteúdo dessas vazias, porque nunca foi gravado.

Além disso, encontrei mensagens duplicadas na mesma conversa (o mesmo identificador gravado duas vezes), o que explica históricos que aparecem repetidos ou fora de ordem.

Correções:
- Garantir que cada mensagem seja gravada uma única vez por conversa (chave única + gravação idempotente), eliminando duplicatas futuras.
- Limpar as duplicatas já existentes no banco, mantendo a primeira cópia de cada mensagem.
- Gravar a mensagem do usuário assim que ela é enviada (não só ao fim da resposta), para que nada se perca se a resposta falhar ou a página for fechada.
- Ordenar o histórico de forma estável para as mensagens gravadas no mesmo instante.
- As conversas vazias antigas ficam no seu controle: apagáveis individualmente ou com o botão de limpeza.

## Detalhes técnicos

- `src/components/workspace/WorkspaceSidebar.tsx`: remover `opacity-0/group-hover:opacity-100` do gatilho do menu; novo botão "Excluir conversas vazias" no rodapé da lista, com `AlertDialog`.
- `src/pages/Workspace.tsx`: substituir o `insert` de `chat_messages` por `upsert` com `onConflict: 'thread_id,sdk_message_id'`; persistir a mensagem do usuário no `handleSubmit`; carregar histórico com `order('created_at').order('id')`; handler de exclusão em massa das threads sem mensagens.
- Migração: remoção das linhas duplicadas de `chat_messages` (mantendo a mais antiga por `thread_id, sdk_message_id`) e índice único `(thread_id, sdk_message_id)` onde `sdk_message_id` não é nulo.
- Sem mudanças em RLS: as políticas por usuário já cobrem leitura, escrita e exclusão.
