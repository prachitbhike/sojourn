import { useRef } from 'react';

export type ColorChipsProps = {
  value: string[] | undefined;
  onChange: (next: string[]) => void;
};

const DEFAULT_NEW = '#888888';

export function ColorChips({ value, onChange }: ColorChipsProps) {
  const palette = value ?? [];
  const pickerRef = useRef<HTMLInputElement>(null);

  const remove = (idx: number) => {
    const next = palette.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const updateAt = (idx: number, color: string) => {
    const next = palette.slice();
    next[idx] = color;
    onChange(next);
  };

  const addNew = (color: string) => {
    onChange([...palette, color]);
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
