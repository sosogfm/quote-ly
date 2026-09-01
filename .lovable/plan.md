# IA gratuita sem travar: fallback automático com Gemini (Google AI Studio)

## Objetivo
Parar de receber "Limite gratuito do provedor atingido" ao aplicar/testar/gerar propostas. Hoje toda chamada de IA usa só a Groq (plano gratuito), e quando ela bate no limite de requisições por minuto (429) a operação inteira falha. A solução é ter um **segundo provedor gratuito (Gemini via Google AI Studio)** que assume automaticamente quando a Groq recusa, sem nunca cobrar créditos da usuária.

## O que você precisa fazer (1 passo, fora do app)
1. Criar uma chave gratuita em https://aistudio.google.com/apikey (login com conta Google, sem cartão).
2. Me enviar a chave quando eu pedir pela ferramenta de secrets — ela fica salva no servidor, nunca no código nem no navegador.

## Cadeia de provedores (todos gratuitos; Lovable só como último recurso pago)
1. **Groq** (primário — rápido, já configurado)
2. **Gemini via Google AI Studio** (fallback gratuito — assume quando a Groq devolver 429)
3. **Lovable AI Gateway** (último recurso — só se nenhum dos dois estiver configurado; usa créditos)

Toda chamada de IA percorre essa cadeia automaticamente: tenta o 1º, se rate-limitar tenta o 2º, e só vai ao 3º se os gratuitos não existirem.

## O que vou implementar

### 1. Secret
- Adicionar `GOOGLE_AI_API_KEY` (server-side, via ferramenta de secrets). Nada de chave em código/`.env`/localStorage.

### 2. Camada de provedor compartilhada (`supabase/functions/_shared/ai-provider.ts`)
- Adicionar Gemini usando o endpoint OpenAI-compatível do Google (`https://generativelanguage.googleapis.com/v1beta/openai`, modelo `gemini-2.5-flash`, header `Authorization: Bearer <key>`).
- Manter `getChatModel()` atual (retorna um único provedor) para compatibilidade.
- Novo helper `getProviderChain()` → lista de provedores ativos na ordem de prioridade.
- Novo helper `generateWithFallback(...)`: executa `generateText`/`streamText` no 1º provedor; se capturar 429 (ou 401/403 de um provedor só), refaz a mesma chamada no próximo provedor; só lança o erro se todos falharem.
- `getAiProviderInfo()` passa a reportar a cadeia (ex.: "Groq + Gemini (grátis)").

### 3. Streaming do chat (`supabase/functions/chat/index.ts`)
- Trocar `streamText` direto por um wrapper que tenta o 1º provedor; se o stream falhar com 429 **antes de enviar qualquer chunk**, reinicia com o próximo provedor. Nenhum conteúdo parcial é enviado ao cliente.
- Mantém memória, tool `remember` e trim de histórico intactos.

### 4. Funções de evolução (não-streaming, fallback simples)
Migrar para `generateWithFallback`:
- `evolution-propose` (geração estruturada com Zod)
- `evolution-test` (revisão estática determinística)
- `evolution-fix` (reescrita de patches)
- `evolution-apply` → `resolveContent` (uma chamada de IA por arquivo; com fallback, se a Groq rate-limitar no meio, o próximo arquivo usa Gemini sem abortar o PR todo)
- `ai-content` (melhoria de seção de proposta)

### 5. Indicador na interface
- `ai-status` reporta cadeia ativa.
- Selo no workspace: "IA: Groq + Gemini (grátis)" quando ambos configurados; "IA: Groq (grátis)" se só Groq; "IA: Lovable (créditos)" se só Lovable.

### 6. Verificação
- Testar ponta a ponta: gerar proposta, rodar testes, corrigir com IA e **aplicar via GitHub** — confirmar que opera sem pedir créditos e sem o erro de limite.
- Confirmar que ao exceder a Groq o app continua funcionando (caindo no Gemini).
- Checar logs de build e erros de runtime.

## Limites (alinhando expectativas)
- Gemini gratuito tem limites de req/min e req/dia; Groq também. Com os dois em cadeia, o limite real vira a soma dos dois — uso pessoal moderado não deve bater.
- Se ambos esgotarem no mesmo minuto, a mensagem amigável aparece (aguarde e tente de novo). Não cai em crédito pago a menos que você queira.

## Fora de escopo
- Seletor de modelo na UI, múltiplos provedores simultâneos além da cadeia, Ollama local.

## Detalhes técnicos
- O Google expõe endpoint compatível com OpenAI (`/v1beta/openai/chat/completions`), então o `@ai-sdk/openai-compatible` já funciona apontando o `baseURL` para o Google com sua chave.
- Gemini suporta `response_format` json_schema; se `Output.object` falhar com `structuredOutputs: true` no Gemini, uso `structuredOutputs: false` (json mode) nesse provedor — validado em teste.
- `LOVABLE_API_KEY` permanece como último recurso.
