// Client-side extraction of uploaded documents into plain text, so the free
// text-only providers can still "read" files. Images are left untouched and
// forwarded to the model as image parts.

const TEXT_LIKE = /^(text\/|application\/(json|xml|javascript|x-yaml|sql|csv))/i;
const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|toml|xml|html?|css|sql|ts|tsx|js|jsx|py|rb|go|rs|java|sh|env\.example)$/i;

const MAX_CHARS = 40000;

export function isImage(file: File) {
  return file.type.startsWith("image/");
}

function clamp(text: string, name: string) {
  const trimmed = text.trim();
  if (!trimmed) return `[${name}: nenhum texto extraído]`;
  return trimmed.length > MAX_CHARS
    ? `${trimmed.slice(0, MAX_CHARS)}\n\n[...conteúdo truncado]`
    : trimmed;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  const limit = Math.min(doc.numPages, 50);
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ");
    pages.push(`--- página ${i} ---\n${text}`);
  }
  return pages.join("\n\n");
}

/** Returns a text block describing a non-image attachment, or null if unsupported. */
export async function extractFileText(file: File): Promise<string> {
  const name = file.name || "arquivo";
  try {
    if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
      return `### Arquivo enviado: ${name} (PDF)\n${clamp(await extractPdf(file), name)}`;
    }
    if (TEXT_LIKE.test(file.type) || TEXT_EXT.test(name)) {
      return `### Arquivo enviado: ${name}\n${clamp(await file.text(), name)}`;
    }
    return `### Arquivo enviado: ${name} (${file.type || "tipo desconhecido"})\n[Não foi possível extrair o texto deste formato. Formatos suportados: PDF, texto, markdown, CSV, JSON, código e imagens.]`;
  } catch (error) {
    return `### Arquivo enviado: ${name}\n[Falha ao ler o arquivo: ${
      error instanceof Error ? error.message : "erro desconhecido"
    }]`;
  }
}
