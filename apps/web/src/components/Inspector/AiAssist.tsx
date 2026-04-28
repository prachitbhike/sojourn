import { useState } from 'react';

export type AiAssistProps = {
  transcript: string[];
  onSubmit: (line: string) => void;
};

export function AiAssist({ transcript, onSubmit }: AiAssistProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const line = draft.trim();
    if (!line) return;
    onSubmit(line);
    setDraft('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        border: '1px solid #2c2c2c',
        borderRadius: 6,
        background: '#161616',
      }}
    >
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        AI assist <span style={{ color: '#444' }}>(stub)</span>
      </div>
      {transcript.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            maxHeight: 96,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {transcript.map((line, idx) => (
            <li key={idx} style={{ fontSize: 12, color: '#aaa', lineHeight: 1.4 }}>
              {line}
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="describe a change…"
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 12,
            background: '#0e0e0e',
            color: '#ddd',
            border: '1px solid #2c2c2c',
            borderRadius: 4,
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: '#1f3a5e',
            color: '#cfe3ff',
            border: '1px solid #2a4d7a',
            borderRadius: 4,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            opacity: draft.trim() ? 1 : 0.5,
          }}
        >
          send
        </button>
      </div>
    </div>
  );
}
