import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AuthCtx } from '../api/client.js';

export function useEditKey(): AuthCtx {
  const [searchParams] = useSearchParams();
  const ref = useRef<AuthCtx | null>(null);
  if (ref.current === null) {
    ref.current = { editKey: searchParams.get('key') };
  }
  return ref.current;
}
