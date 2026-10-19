export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function fail(status: number, code: string): never { throw new ApiError(status, code); }
export async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') fail(415, 'json_required');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'missing_body');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 16384) { await reader.cancel(); fail(413, 'body_too_large'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'invalid_body');
  return Object.fromEntries(Object.entries(data));
}
export function exact(data: Record<string, unknown>, keys: string[], optional: string[] = []) {
  if (Object.keys(data).some(k => !keys.includes(k) && !optional.includes(k)) || keys.some(k => !(k in data))) fail(400, 'unexpected_fields');
}
