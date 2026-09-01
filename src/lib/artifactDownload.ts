// Turns a stored artifact into a downloadable file in the browser.
export interface ArtifactLike {
  id: string;
  title: string;
  kind: string;
  language: string | null;
  content: string | null;
}

const EXTENSIONS: Record<string, string> = {
  markdown: "md",
  csv: "csv",
  txt: "txt",
  html: "html",
  svg: "svg",
  json: "json",
};

function safeName(title: string) {
  return (title || "arquivo").replace(/[^\w\-. ]+/g, "").trim().replace(/\s+/g, "-") || "arquivo";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CODE_EXT: Record<string, string> = {
  typescript: "ts",
  tsx: "tsx",
  javascript: "js",
  python: "py",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  json: "json",
  css: "css",
  html: "html",
};

export function textExtension(a: ArtifactLike) {
  if (a.kind === "code") return CODE_EXT[(a.language ?? "").toLowerCase()] ?? "txt";
  return EXTENSIONS[a.kind] ?? "txt";
}

export function downloadText(a: ArtifactLike) {
  const ext = textExtension(a);
  triggerDownload(
    new Blob([a.content ?? ""], { type: "text/plain;charset=utf-8" }),
    `${safeName(a.title)}.${ext}`,
  );
}

/** Renders HTML content offscreen at A4 width so it can be rasterized. */
async function renderToCanvas(html: string) {
  const { default: html2canvas } = await import("html2canvas");
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "794px";
  host.style.background = "#ffffff";
  host.style.color = "#111111";
  host.style.padding = "40px";
  host.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
  host.innerHTML = html;
  document.body.append(host);
  try {
    return await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  } finally {
    host.remove();
  }
}

function contentAsHtml(a: ArtifactLike) {
  const content = a.content ?? "";
  if (a.kind === "html" || a.kind === "pdf" || a.kind === "png" || a.kind === "svg") return content;
  return `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px">${content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`;
}

export async function downloadPng(a: ArtifactLike) {
  const canvas = await renderToCanvas(contentAsHtml(a));
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) triggerDownload(blob, `${safeName(a.title)}.png`);
}

export async function downloadPdf(a: ArtifactLike) {
  const [{ default: jsPDF }, canvas] = await Promise.all([
    import("jspdf"),
    renderToCanvas(contentAsHtml(a)),
  ]);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");

  let remaining = imgHeight;
  let offset = 0;
  while (remaining > 0) {
    pdf.addImage(image, "PNG", 0, -offset, pageWidth, imgHeight);
    remaining -= pageHeight;
    offset += pageHeight;
    if (remaining > 0) pdf.addPage();
  }
  pdf.save(`${safeName(a.title)}.pdf`);
}
