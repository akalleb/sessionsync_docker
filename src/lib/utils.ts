import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "@/integrations/supabase/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rawBackendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;

const BASE_URL =
  rawBackendUrl && !rawBackendUrl.startsWith(':')
    ? rawBackendUrl.replace(/\/$/, '')
    : (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const apiCall = async (
  endpoint: string,
  body?: Record<string, unknown>,
  method = 'POST',
) => {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;

  // Se o token expira em menos de 60 segundos (ou já expirou), força o refresh
  if (session?.expires_at) {
    const expiresAtMs = session.expires_at * 1000;
    if (expiresAtMs - Date.now() < 60_000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
  }

  const token = session?.access_token;
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };

  if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    const text = await response.text();
    let errorData: Record<string, unknown> = {};
    try {
        errorData = JSON.parse(text);
    } catch {
        // Se não for JSON, provavelmente é HTML de erro (404/500) ou o endpoint não existe
        throw new Error(`Erro de conexão com o servidor (${response.status} ${response.statusText}). Se o problema persistir, verifique se o backend está rodando.`);
    }
    const errorMessage =
      typeof (errorData as { error?: unknown }).error === 'string'
        ? (errorData as { error?: string }).error
        : undefined;
    throw new Error(errorMessage || `Error calling ${endpoint}: ${response.statusText}`);
  }

  return await response.json();
};

export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    return response.ok;
  } catch (e) {
    return false;
  }
};
