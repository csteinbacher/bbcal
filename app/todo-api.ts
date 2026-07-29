const TODO_SUPABASE_URL = "https://eiqdwusgajcefvblqria.supabase.co";
const TODO_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1MPDETD3DhRW2HKbOpD9AQ_FRo0vlsH";
const TODO_API_URL = `${TODO_SUPABASE_URL}/rest/v1`;

type TodoApiOptions = { method?: "GET" | "PATCH"; body?: Record<string, unknown> };

export async function todoApi<T>(path: string, options: TodoApiOptions = {}) {
  const response = await fetch(`${TODO_API_URL}/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: TODO_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(details?.message || `Todo request failed (${response.status}).`);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}
