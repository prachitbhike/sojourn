import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createCharacter } from '../api/client.js';

export function LandingPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createCharacter(trimmed);
      navigate(`/c/${res.character.slug}/edit?key=${encodeURIComponent(res.editKey)}`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'failed';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '64px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 22 }}>sojourn</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--sj-muted)', fontSize: 13 }}>
          describe a character. we'll generate a sprite you can share.
        </p>
      </header>
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="a hooded ranger with a glowing bow…"
          rows={4}
          style={{
            padding: 10,
            fontSize: 14,
            background: '#0e0e0e',
            color: '#ddd',
            border: '1px solid var(--sj-border)',
            borderRadius: 6,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={!prompt.trim() || submitting}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            background: prompt.trim() && !submitting ? 'var(--sj-accent-bg)' : '#1a1a1a',
            color: prompt.trim() && !submitting ? '#cfe3ff' : '#666',
            border: '1px solid var(--sj-border)',
            borderRadius: 6,
            cursor: prompt.trim() && !submitting ? 'pointer' : 'not-allowed',
            alignSelf: 'flex-start',
          }}
        >
          {submitting ? 'creating…' : 'create character'}
        </button>
      </form>
      {error && (
        <div
          role="alert"
          style={{
            background: '#3a0e0e',
            color: '#ff8a8a',
            border: '1px solid #5c1f1f',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
