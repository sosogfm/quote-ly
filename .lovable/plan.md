# Personal AI Workspace Plan

Transform this remixed proposal app into a private, self-improving AI workspace.

## Core Principle

No public LLM updates its own weights in real time. Instead, we build a **personal memory layer** (preferences, facts, chat history, feedback, documents) and feed it back into every model call. The model becomes more useful by seeing better context, not by changing itself. This is the same pattern Claude, Cursor, and ChatGPT use.

## Architecture

```text
+-------------+     +----------------+     +------------------+
| Chat UI     | --> | Edge Function  | --> | Lovable AI       |
| (streaming) |     | (tools, memory,|     | Gateway (GPT-5.6,|
|             | <-- |  system prompt)|     | Gemini, etc.)    |
+-------------+     +----------------+     +------------------+
       |                    |
       v                    v
+-------------+     +----------------+
| Chat history|     | Vector memory  |
| Files       |     | Feedback       |
| Preferences |     | Skills/MCPs    |
+-------------+     +----------------+
```

## Phase 1: Chat Foundation

Build a clean, Claude-like chat interface that replaces the current proposal app.

- **Frontend**: Replace `/dashboard` with a chat workspace. Sidebar for thread history, main area for streaming messages, composer at bottom.
- **Backend**: New Supabase Edge Function `chat` using `streamText` via Lovable AI Gateway (`openai/gpt-5.6-sol` on the Responses API).
- **Persistence**: Store chat threads and messages in new tables (`threads`, `chat_messages`) with RLS.
- **System prompt**: A base persona tuned for document/code/image/helpful assistant work.
- **Deliverable**: A working chat that streams responses and remembers the current conversation.

## Phase 2: Personal Memory

Make the AI remember things across conversations.

- **Preferences table**: User-level facts (writing style, preferred output format, role, tech stack, favorite tools).
- **Memory extraction**: After each turn, ask a small model to extract facts/preferences from the conversation and upsert them.
- **Context injection**: On every chat request, prepend relevant memories and a short user profile to the system prompt.
- **Deliverable**: The AI starts knowing your defaults (e.g., "write Python, not JS", "formal tone", "output PDF").

## Phase 3: RAG and File Uploads

Let the AI learn from your documents, not just chats.

- **Files table**: Upload and store PDFs, images, code files, notes.
- **Embeddings**: Use `text-embedding-3-small` or `google/gemini-embedding-2` to vectorize text and documents.
- **Vector search**: Retrieve relevant chunks before answering.
- **Image understanding**: Send images in chat messages for analysis.
- **Deliverable**: Ask questions about uploaded files, generate content based on them, and have the AI remember project context.

## Phase 4: Tools and Outputs

Give the AI abilities beyond text.

- **PDF generation**: Tool that turns a markdown/conversation output into a PDF (e.g., via `pdf-lib`, `react-pdf`, or a server-side renderer).
- **Code generation**: Tool that returns code blocks, and a UI that can copy/download/insert them into a file editor.
- **Image generation**: Tool that calls an image model (Lovable AI Gateway) when asked.
- **Web search**: Tool that fetches recent pages or uses a search connector (if available).
- **Deliverable**: The assistant can produce documents, code, images, and search the web.

## Phase 5: Site Maker

A Lovable-style tool where you describe a site and the AI builds it, previewed live inside your workspace.

- **Generation**: A `generate-site` tool that produces a self-contained site as structured files (HTML + Tailwind CSS + JS, or a multi-file React bundle) from your prompt.
- **Live preview**: Render the generated site in a sandboxed iframe next to the chat, with desktop/mobile toggles.
- **Iterative editing**: Chat follow-ups ("make the hero darker", "add a pricing section") patch the existing files rather than regenerating from scratch. Every version is saved so you can roll back.
- **Storage**: A `sites` table plus a `site_files` table (path + content + version), with RLS scoped to you.
- **Assets**: Generated or uploaded images are stored in Supabase Storage and referenced by the site.
- **Export & publish**: Download the site as a ZIP, and optionally serve it at a public `/s/:slug` route so you can share it.
- **Style memory**: The site maker reads your stored preferences (fonts, palettes, tone, layout habits) so new sites default to your taste, and learns from the edits you make.
- **Deliverable**: Describe a site in chat, watch it appear, refine it conversationally, then export or share it.

## Phase 6: Feedback Loop and Skills

Close the loop so the AI improves from your corrections.

- **Feedback capture**: Thumbs up/down + edit mode on every assistant message.
- **Feedback storage**: Store original output, user edit, and reason in a `feedback` table.
- **Example injection**: Periodically include top-rated past outputs as few-shot examples in the system prompt.
- **Skills**: A `skills` table of reusable prompt/tool combos (e.g., "Proposal writer", "Code reviewer", "Landing page builder") that the user can create, edit, and invoke.
- **Deliverable**: The AI visibly gets better at your recurring tasks and can adopt new "skills" you define.

## Phase 7: MCPs and Connectors


Connect to external tools and services.

- **MCP client**: Add an MCP client layer to connect to external MCP servers.
- **Connector storage**: Store MCP URLs/credentials securely.
- **Tool fanout**: Let the assistant discover and call tools from connected MCPs.
- **Deliverable**: The AI can use your external tools (GitHub, databases, APIs, etc.).

## Recommended First Step

Start with **Phase 1 only**. Do not build the whole thing at once. A single working chat workspace with history is the foundation everything else depends on. Once it streams and persists, we layer memory, files, tools, and feedback on top.

## Files to Create / Modify

- New Edge Function: `supabase/functions/chat/index.ts`
- New tables: `threads`, `chat_messages`, `memories`, `files`, `feedback`, `skills`, `sites`, `site_files`
- New pages: `src/pages/ChatWorkspace.tsx`, `src/pages/SiteMaker.tsx`, `src/components/ThreadSidebar.tsx`, `src/components/SitePreview.tsx`
- Modify: `src/App.tsx` routes, `src/index.css` for chat styling
- Remove/replace: proposal-focused dashboard routes (later, not in Phase 1)


## Tech Stack

- Lovable AI Gateway via Supabase Edge Functions
- AI SDK (`streamText`, tools, `Output`)
- Supabase Storage for files
- Vector storage via `pgvector` in Supabase
- React + shadcn/ui for chat UI

## Cost and Limits

- Lovable AI Gateway has a free monthly allowance; heavy use will need credits.
- Embeddings and file storage also consume usage.
- We can add a credit-aware pause later (Phase 5).
