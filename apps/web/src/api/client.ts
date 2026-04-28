import type {
  CreateCharacterResponse,
  GeneratePortraitResponse,
  GeneratePoseResponse,
  GetCharacterResponse,
  PatchCharacterRequest,
  PatchCharacterResponse,
  PoseName,
} from '@sojourn/shared';

export type AuthCtx = { editKey: string | null };

type ErrorBody = { error: string; message?: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function buildHeaders(auth?: AuthCtx, hasBody = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (auth?.editKey) headers['X-Edit-Key'] = auth.editKey;
  return headers;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // ignore — non-JSON error body
  }
  const code = body?.error ?? 'unknown';
  const message = body?.message ?? body?.error ?? `request failed (${res.status})`;
  return new ApiError(res.status, code, message);
}

async function request<T>(
  input: string,
  init: RequestInit & { auth?: AuthCtx } = {},
): Promise<T> {
  const { auth, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(input, {
      credentials: 'include',
      ...rest,
      headers: { ...buildHeaders(auth, rest.body != null), ...(rest.headers ?? {}) },
    });
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : 'network failure');
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export function createCharacter(prompt: string): Promise<CreateCharacterResponse> {
  return request<CreateCharacterResponse>('/api/characters', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export function getCharacter(slug: string): Promise<GetCharacterResponse> {
  return request<GetCharacterResponse>(`/api/characters/${encodeURIComponent(slug)}`);
}

export function patchCharacter(
  slug: string,
  body: PatchCharacterRequest,
  auth: AuthCtx,
): Promise<PatchCharacterResponse> {
  return request<PatchCharacterResponse>(`/api/characters/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    auth,
  });
}

export function regeneratePortrait(
  slug: string,
  auth: AuthCtx,
  signal?: AbortSignal,
): Promise<GeneratePortraitResponse> {
  return request<GeneratePortraitResponse>(
    `/api/characters/${encodeURIComponent(slug)}/portrait`,
    { method: 'POST', auth, signal },
  );
}

export function regeneratePose(
  slug: string,
  name: PoseName,
  auth: AuthCtx,
): Promise<GeneratePoseResponse> {
  return request<GeneratePoseResponse>(
    `/api/characters/${encodeURIComponent(slug)}/poses`,
    { method: 'POST', body: JSON.stringify({ name }), auth },
  );
}
