import { useState } from 'react';
import type { PoseName } from '@sojourn/shared';

export type AddPosePickerProps = {
  available: PoseName[];
  onAdd: (name: PoseName) => void;
  busy: boolean;
};

export function AddPosePicker({ available, onAdd, busy }: AddPosePickerProps) {
  const [choice, setChoice] = useState<PoseName | ''>('');

  const submit = () => {
    if (!choice) return;
    onAdd(choice);
    setChoice('');
  };

  if (available.length === 0) {
    return (
      <div
        style={{
          width: 120,
          padding: 10,
          background: '#161616',
          border: '1px dashed #2c2c2c',
          borderRadius: 6,
          color: '#555',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        all poses added
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        background: '#161616',
        border: '1px dashed #3a3a3a',
        borderRadius: 6,
        width: 120,
      }}
    >
      <div style={{ fontSize: 12, color: '#888' }}>+ add pose</div>
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value as PoseName | '')}
        disabled={busy}
        style={{
          padding: '4px 6px',
          fontSize: 12,
          background: '#0e0e0e',
          color: '#ddd',
          border: '1px solid #2c2c2c',
          borderRadius: 4,
        }}
      >
        <option value="">— pick —</option>
        {available.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={!choice || busy}
        style={{
          padding: '4px 8px',
          fontSize: 11,
          background: choice && !busy ? '#1f3a5e' : 'transparent',
          color: choice && !busy ? '#cfe3ff' : '#555',
          border: '1px solid #3a3a3a',
          borderRadius: 4,
          cursor: choice && !busy ? 'pointer' : 'not-allowed',
        }}
      >
        {busy ? 'adding…' : 'add'}
      </button>
    </div>
  );
}
