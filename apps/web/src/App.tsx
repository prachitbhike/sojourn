import { useEffect, useState } from 'react';
import { DevStagePage } from './routes/dev/stage.js';

type Health = { status: string; env: string; time: string };

export function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/dev/stage') {
    return <DevStagePage />;
  }
  return <HomeView />;
}

function HomeView() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`api ${res.status}`);
        const json = (await res.json()) as Health;
        setHealth(json);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem',
        color: '#222',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <h1 style={{ marginBottom: '0.25rem' }}>Sojourn</h1>
      <p style={{ marginTop: 0, color: '#666' }}>
        Phase 0 scaffold. Real UI lands in slices 3 &amp; 4.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>API health</h2>
        {error ? (
          <pre style={{ color: '#b00', whiteSpace: 'pre-wrap' }}>{error}</pre>
        ) : health ? (
          <pre style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: 4 }}>
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : (
          <p>checking…</p>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Stub assets</h2>
        <p>
          Served by the API at <code>/api/stubs/v1/*</code> via the Vite proxy.
        </p>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <figure style={{ margin: 0 }}>
            <img
              src="/api/stubs/v1/portrait.png"
              alt="Stub portrait"
              width={128}
              height={128}
              style={{ display: 'block', border: '1px solid #ddd' }}
            />
            <figcaption style={{ fontSize: 12, color: '#666' }}>portrait.png</figcaption>
          </figure>
          {(['idle', 'walk', 'attack', 'cast'] as const).map((name) => (
            <figure key={name} style={{ margin: 0 }}>
              <img
                src={`/api/stubs/v1/${name}.png`}
                alt={`Stub ${name} sheet`}
                style={{
                  display: 'block',
                  border: '1px solid #ddd',
                  imageRendering: 'pixelated',
                }}
              />
              <figcaption style={{ fontSize: 12, color: '#666' }}>{name}.png</figcaption>
            </figure>
          ))}
        </div>
        <p style={{ marginTop: '1.25rem' }}>
          See <a href="/dev/stage">/dev/stage</a> for the Phaser sprite-stage demo.
        </p>
      </section>
    </main>
  );
}
