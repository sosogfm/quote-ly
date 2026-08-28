# BYOK: IA própria com Gemini grátis (Google AI Studio)

## Objetivo
Parar de depender dos créditos do Lovable AI Gateway para as funções de IA do app. A IA passa a usar a **sua própria chave gratuita do Google AI Studio** (Gemini API), com fallback automático para o gateway da Lovable se a chave não estiver configurada.

## O que você precisa fazer (1 passo, fora do app)
1. Criar uma chave gratuita em https://aistudio.google.com/apikey (login com conta Google, sem cartão).
2. Me enviar a chave quando eu pedir via ferramenta de secrets — ela fica salva no servidor, nunca no código nem no navegador.

## O que eu vou implementar

### 1. Secret e configuração
- Adicionar o secret `GOOGLE_AI_API_KEY` (ferramenta de secrets, server-side).
- Nada de chave em código, `.env` público ou localStorage.

### 2. Camada de provedor compartilhada
- Criar `supabase/functions/_shared/ai-provider.ts`:
  - Se `GOOGLE_AI_API_KEY` existir → chama a **API do Gemini direto** (`generativelanguage.googleapis.com`, modelo `gemini-2.5-flash`, compatível com streaming SSE).
  - Se não existir → usa o caminho atual (Lovable AI Gateway).
- Suporte a: chat em streaming (SSE), geração única com saída estruturada (JSON), e tool calling (necessário para a ferramenta `remember` e futuras).

### 3. Migração das funções existentes
- `chat`: troca a chamada do gateway pelo helper compartilhado, mantendo memória, threads e tool `remember` funcionando.
- `evolution-propose`: idem, mantendo saída estruturada validada com Zod.
- Funções de conteúdo/propostas que usam IA: mesma troca.

### 4. Tratamento de erros claro
- `429` (limite do nível gratuito: requisições/minuto e/dia): mensagem amigável em português ("limite gratuito atingido, tente em X segundos") com backoff limitado.
- `401/403`: mensagem indicando chave inválida (sem vazar a chave).
- Erros de rede/upstream: superfície da mensagem real, sem retry infinito.

### 5. Indicador na interface
- Pequeno selo no workspace: "IA: Gemini (chave própria)" vs "IA: Lovable (créditos)", lendo um endpoint server-side (sem expor a chave).

### 6. Verificação
- Teste real de ponta a ponta: enviar mensagem no chat e confirmar resposta vindo da API do Google (e não do gateway).
- Teste do `evolution-propose` com saída estruturada.
- Checar logs de build e erros de runtime.

## Limites do nível gratuito (para alinhar expectativas)
- O nível gratuito do Gemini tem limites de requisições por minuto/dia. Para uso pessoal moderado costuma bastar; se estourar, o app mostra mensagem clara e você espera o reset ou cria chave em outro projeto Google.
- Geração de imagens e modelos mais pesados podem não estar no gratuito — quando chegarmos nessas fases (imagens, voz), avaliamos caso a caso.

## Fora de escopo (fases futuras)
- Seletor de modelo na UI, múltiplos provedores, Ollama local.
- Mudanças nas fases pendentes da Central de Evolução (continuam de onde paramos).

## Detalhes técnicos
- Gemini API expõe modo compatível com OpenAI (`/v1beta/openai/chat/completions`), então o AI SDK (`@ai-sdk/openai-compatible`) já funciona apontando o `baseURL` para o Google com a sua chave — pouca mudança no fluxo de streaming.
- Streaming obrigatório para chamadas longas (regra da plataforma: chamadas bufferizadas >2 min são cortadas e cobradas).
- `LOVABLE_API_KEY` permanece como fallback e para recursos que só existem no gateway (ex.: alguns modelos de imagem).
