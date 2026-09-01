"""Utility for PDF generation and manipulation using reportlab, pypdf, and pdfplumber.

Este script fornece funções básicas para criar PDFs e pode ser estendido para
edição, extração de texto e outras operações avançadas.
"""

import sys
from pathlib import Path

# Bibliotecas externas (deve estar no requirements.txt)
from reportlab.pdfgen import canvas
# from pypdf import PdfReader, PdfWriter  # Futuras funcionalidades
# import pdfplumber                     # Futuras funcionalidades


def create_pdf(output_path: str, content: str) -> None:
    """Cria um PDF simples contendo o texto fornecido.

    Args:
        output_path: Caminho completo onde o PDF será salvo.
        content: Texto a ser inserido no PDF.
    """
    c = canvas.Canvas(output_path)
    c.setFont("Helvetica", 12)
    c.drawString(100, 750, content)
    c.showPage()
    c.save()


def main() -> None:
    if len(sys.argv) != 3:
        print("Uso: python pdf_processor.py <caminho_saida.pdf> <texto>")
        sys.exit(1)

    output_path = sys.argv[1]
    content = sys.argv[2]

    # Garante que o diretório de destino exista
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    create_pdf(output_path, content)
    print(f"PDF criado com sucesso em {output_path}")


if __name__ == "__main__":
    main()
