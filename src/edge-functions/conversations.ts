import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "https://api.example.com";

const uuidV4Regex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Edge function handling CRUD operations for conversations.
 *
 * - GET    /api/conversations                → list conversations
 * - POST   /api/conversations                → create a new conversation
 * - PATCH  /api/conversations/:id            → update a conversation
 * - DELETE /api/conversations/:id            → delete a conversation
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const apiUrl = `${API_BASE_URL}${url.pathname}${url.search}`;

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const apiUrl = `${API_BASE_URL}${url.pathname}${url.search}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: await req.text(),
    cache: "no-store",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function PATCH(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop() ?? "";

  // Validação básica de UUID (versão 4) para garantir que o ID seja bem‑formado
  if (!uuidV4Regex.test(id)) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid conversation ID format" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiUrl = `${API_BASE_URL}/conversations/${id}`;
  const response = await fetch(apiUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: await req.text(),
    cache: "no-store",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop() ?? "";

  // Validação básica de UUID (versão 4) para garantir que o ID seja bem‑formado
  if (!uuidV4Regex.test(id)) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid conversation ID format" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiUrl = `${API_BASE_URL}/conversations/${id}`;
  const response = await fetch(apiUrl, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
