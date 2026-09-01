# IA gratuita sem travar: fallback OpenRouter + batching do apply

## Objetivo
Parar de receber "Limite gratuito do provedor atingido" ao abrir PR / testar / gerar propostas. O Google AI Studio (Gemini) está **bloqueado no Brasil**, então a alternativa gratuita e acessível daqui é o **OpenRouter** (modelos gratuitos, sem cartão, endpoint compatível com OpenAI). Além disso, o gatilho real do erro é o `evolution-apply` fazer **uma chamada de IA por arquivo** ao abrir o PR — vou consolidar isso em **uma única chamada**, reduzindo drasticamente as requisições.

## Cadeia de provedores (todos gratuitos; Lovable só como último recurso pago)
1. **Groq** (primário — já configurado, rápido)
2. **OpenRouter free** (fallback — acessível do Brasil, sem cartão) — modelo `meta-llama/llama-3.3-70b-instruct:free`
3. **Lovable AI Gateway** (último recurso — só se nenhum dos dois existir; usa créditos)

Toda chamada percorre a cadeia: tenta o 1º, se rate-limitar (429) ou falhar (401/403 de um provedor só) refaz no 2º; só vai ao 3º se os gratuitos não existirem. Nunca cobra créditos sem os dois gratuitos falharem.

## O que você precisa fazer (1 passo, fora do app)
1. Criar uma chave gratuita em https://openrouter.ai/keys (login com Google/GitHub, sem cartão).
2. Me enviar a chave quando eu pedir pela ferramenta de secrets — fica salva no servidor, nunca no código/navegador.

## O que vou implementar

### 1. Secret
- Adicionar `OPENROUTER_API_KEY` (server-side, via ferramenta de secrets). Nada de chave em código/`.env`/localStorage.

### 2. Camada de provedor compartilhada (`supabase/functions/_shared/ai-provider.ts`)
- Adicionar OpenRouter usando `createOpenAICompatible` com `baseURL: "https://openrouter.ai/api/v1"`, header `Authorization: Bearer <key>`, e os headers opcionais `HTTP-Referer`/`X-Title` do OpenRouter.
- Modelo free: `meta-llama/llama-3.3-70b-instruct:free` (validar disponibilidade ao implementar; fallback de modelo: `meta-llama/llama-3.1-8b-instruct:free`).
- Manter `getChatModel()` atual (retorna o provedor primário) para compatibilidade.
- Novo helper `getProviderChain()` → lista de provedores ativos na ordem de prioridade (Groq → OpenRouter → Lovable).
- Novo helper `generateWithFallback({ prompt, system, messages, output, ... })`: executa `generateText`/`streamText` no 1º provedor; se capturar 429 (ou 401/403 isolado), refaz a mesma chamada no próximo; só lança se todos falharem. Para OpenRouter, `supportsStructuredOutputs: false` (json mode) — `evolution-propose` já tem fallback de parse via `NoObjectGeneratedError`.
- `getAiProviderInfo()` passa a reportar a cadeia (ex.: "Groq + OpenRouter (grátis)").

### 3. Streaming do chat (`supabase/functions/chat/index.ts`)
- Trocar `streamText` direto por um wrapper que tenta o 1º provedor; se o stream falhar com 429 **antes de enviar qualquer chunk**, reinicia com o próximo provedor. Nenhum conteúdo parcial é enviado ao cliente.
- Mantém memória, tool `remember` e trim de histórico intactos.

### 4. Funções de evolução (não-streaming, fallback simples)
Migrar para `generateWithFallback`:
- `evolution-propose` (geração estruturada com Zod — json mode no OpenRouter + parse fallback)
- `evolution-test` (revisão estática determinística)
- `evolution-fix` (reescrita de patches)
- `evolution-apply` → `resolveContent` (ver item 5)
- `ai-content` (melhoria de seção de proposta)

### 5. Batching do `evolution-apply` (correção principal do erro de PR)
> Por que o PR estoura o limite: `evolution-apply` chama a IA **uma vez por arquivo** para converter o patch no conteúdo final antes de commitar. Vários arquivos = várias chamadas seguidas = a Groq gratuita barra com 429 e o PR nem abre.
- Refatorar `resolveContent` para um `resolveAllContents(files, currentContents)` que faz **uma única chamada de IA** recebendo a lista de arquivos e devolvendo o conteúdo final de todos de uma vez (resposta estruturada/JSON: `{ "caminho": "conteúdo", ... }`).
- Reduz N chamadas → 1 chamada ao aplicar. Combinado com o fallback, o PR abre sem travar e sem custos.
- Persistir `new_content` de cada arquivo após resolver (já faz hoje), de forma que um re-apply não precise chamar IA de novo.

### 6. Indicador na interface
- `ai-status` reporta cadeia ativa.
- Selo no workspace: "IA: Groq + OpenRouter (grátis)" quando ambos configurados; "IA: Groq (grátis)" se só Groq; "IA: Lovable (créditos)" se só Lovable.

### 7. Verificação
- Testar ponta a ponta: gerar proposta, rodar testes, corrigir com IA e **aplicar via GitHub** — confirmar que opera sem pedir créditos e sem o erro de limite.
- Confirmar que ao exceder a Groq o app continua funcionando (caindo no OpenRouter).
- Checar logs de build e erros de runtime.

## Limites (alinhando expectativas)
- Groq free: ~30 req/min + limite diário. OpenRouter free: modelos `:free` têm limites de req/min e podem recusar quando sobrecarregados. Com os dois em cadeia, o limite real vira a soma dos dois — uso pessoal moderado não deve bater.
- Se ambos esgotarem no mesmo minuto, a mensagem amigável aparece (aguarde e tente de novo). Não cai em crédito pago a menos que você queira.

## Fora de escopo
- Seletor de modelo na UI, múltiplos provedores simultâneos além da cadeia, Ollama local.

## Detalhes técnicos
- OpenRouter expõe endpoint compatível com OpenAI (`/api/v1/chat/completions`), então `@ai-sdk/openai-compatible` já funciona apontando o `baseURL` para o OpenRouter com sua chave.
- Free variants: anexar `:free` ao model id. Modelos free não garantem `json_schema` estrito — usar json mode e validar/fazer parse fallback.
- `LOVABLE_API_KEY` permanece como último recurso.
