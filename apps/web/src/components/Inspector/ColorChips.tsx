import { useEffect, useRef, useState } from 'react';

export type ColorChipsProps = {
  value: string[] | undefined;
  onChange: (next: string[]) => void;
};

const DEFAULT_NEW = '#888888';

// Native <input type="color"> fires onChange continuously while the user drags
// the picker. Without this debounce, every tick would PATCH the server.
const COMMIT_DEBOUNCE_MS = 300;

export function ColorChips({ value, onChange }: ColorChipsProps) {
  const [palette, setPalette] = useState<string[]>(value ?? []);
  const pickerRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  // True while we have local edits that haven't been flushed upstream yet.
  const dirtyRef = useRef(false);

  // Sync from props when external value changes and we have no pending edits.
  useEffect(() => {
    if (!dirtyRef.current) setPalette(value ?? []);
  }, [value]);

  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  const flushNow = (next: string[]) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dirtyRef.current = false;
    onChange(next);
  };

  const scheduleFlush = (next: string[]) => {
    dirtyRef.current = true;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      dirtyRef.current = false;
      onChange(next);
    }, COMMIT_DEBOUNCE_MS);
  };

  const remove = (idx: number) => {
    const next = palette.slice();
    next.splice(idx, 1);
    setPalette(next);
    flushNow(next);
  };

  const updateAt = (idx: number, color: string) => {
    const next = palette.slice();
    next[idx] = color;
    setPalette(next);
    scheduleFlush(next);
  };

  const addNew = (color: string) => {
    const next = [...palette, color];
    setPalette(next);
    flushNow(next);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {palette.map((color, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 4px 2px 2px',
            background: '#222',
            border: '1px solid #3a3a3a',
            borderRadius: 4,
          }}
        >
          <input
            type="color"
            value={color}
            onChange={(e) => updateAt(idx, e.target.value)}
            style={{
              width: 22,
              height: 22,
              border: 'none',
              padding: 0,
              background: 'transparent',
              cursor: 'pointer',
            }}
            aria-label={`color ${idx + 1}`}
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            aria-label={`remove color ${idx + 1}`}
            style={{
              background: 'transparent',
              color: '#888',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={pickerRef}
        type="color"
        defaultValue={DEFAULT_NEW}
        onChange={(e) => {
          addNew(e.target.value);
          // Reset so picking the same color twice still adds.
          if (pickerRef.current) pickerRef.current.value = DEFAULT_NEW;
        }}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => pickerRef.current?.click()}
        style={{
          padding: '4px 10px',
          fontSize: 12,
          background: 'transparent',
          color: '#bbb',
          border: '1px dashed #555',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        + add color
      </button>
    </div>
  );
}
