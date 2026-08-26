import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, FileCode } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PatchFile = {
  id: string;
  path: string;
  change_type: string;
  reason: string | null;
  language: string | null;
  patch: string | null;
};

function lineClass(line: string) {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return "text-muted-foreground";
  }
  if (line.startsWith("+")) return "bg-primary/10 text-primary";
  if (line.startsWith("-")) return "bg-destructive/10 text-destructive";
  return "text-foreground/80";
}

export function DiffViewer({ files }: { files: PatchFile[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (file: PatchFile) => {
    await navigator.clipboard.writeText(file.patch ?? "");
    setCopied(file.id);
    toast.success("Diff copiado");
    setTimeout(() => setCopied(null), 2000);
  };

  if (!files.length) {
    return <p className="text-sm text-muted-foreground">Nenhum arquivo afetado nesta proposta.</p>;
  }

  return (
    <div className="space-y-4">
      {files.map((file) => (
        <div key={file.id} className="overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-xs">{file.path}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {file.change_type}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 text-xs"
              onClick={() => copy(file)}
            >
              {copied === file.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copiar
            </Button>
          </div>
          {file.reason && (
            <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
              {file.reason}
            </p>
          )}
          <pre className="max-h-96 overflow-auto bg-card p-3 text-xs leading-5">
            {(file.patch ?? "").split("\n").map((line, i) => (
              <div key={i} className={cn("whitespace-pre px-1 font-mono", lineClass(line))}>
                {line || " "}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
