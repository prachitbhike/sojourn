export type ChipSelectProps = {
  value: string | undefined;
  options: readonly string[];
  onChange: (next: string | undefined) => void;
};

export function ChipSelect({ value, options, onChange }: ChipSelectProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? undefined : opt)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 999,
              border: `1px solid ${active ? '#7eb8ff' : '#3a3a3a'}`,
              background: active ? '#1f3a5e' : 'transparent',
              color: active ? '#cfe3ff' : '#bbb',
              cursor: 'pointer',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
