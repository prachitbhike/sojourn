import { useEffect, useRef, useState } from 'react';
import { POSE_NAMES, type PoseManifest, type PoseName } from '@sojourn/shared';
import { SpriteStage, type SpriteStageHandle } from '../../components/SpriteStage/index.js';

type LoadedPose = {
  name: PoseName;
  spriteSheetUrl: string;
  manifest: PoseManifest;
};

async function fetchPose(name: PoseName): Promise<LoadedPose> {
  const res = await fetch(`/api/stubs/v1/${name}.json`);
  if (!res.ok) throw new Error(`manifest ${name} ${res.status}`);
  const manifest = (await res.json()) as PoseManifest;
  return { name, spriteSheetUrl: `/api/stubs/v1/${name}.png`, manifest };
}

export function DevStagePage() {
  const [pose, setPose] = useState<LoadedPose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const stageRef = useRef<SpriteStageHandle>(null);

  useEffect(() => {
    let alive = true;
    fetchPose('idle')
      .then((p) => alive && setPose(p))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const selectPose = async (name: PoseName) => {
    setError(null);
    try {
      const next = await fetchPose(name);
      setPose(next);
      setPaused(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const togglePlayback = () => {
    if (paused) {
      stageRef.current?.play();
      setPaused(false);
    } else {
      stageRef.current?.pause();
      setPaused(true);
    }
  };

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
      <h1 style={{ marginBottom: '0.25rem' }}>SpriteStage demo</h1>
      <p style={{ marginTop: 0, color: '#666' }}>
        Loads stub manifests and sheets from <code>/api/stubs/v1/*</code> and plays them through
        Phaser via the <code>&lt;SpriteStage&gt;</code> component.
      </p>

      <section style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {POSE_NAMES.map((name) => {
          const active = pose?.name === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => selectPose(name)}
              style={{
                padding: '0.4rem 0.9rem',
                border: '1px solid',
                borderColor: active ? '#222' : '#bbb',
                background: active ? '#222' : '#fff',
                color: active ? '#fff' : '#222',
                fontWeight: active ? 600 : 400,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!pose}
          style={{
            padding: '0.4rem 0.9rem',
            border: '1px solid #bbb',
            background: '#fafafa',
            borderRadius: 4,
            cursor: pose ? 'pointer' : 'not-allowed',
            marginLeft: 'auto',
          }}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </section>

      <section
        style={{
          marginTop: '1.5rem',
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ border: '1px solid #ddd', background: '#1a1a1a', padding: 0 }}>
          {pose ? (
            <SpriteStage
              ref={stageRef}
              spriteSheetUrl={pose.spriteSheetUrl}
              manifest={pose.manifest}
              currentPose={pose.name}
            />
          ) : (
            <div
              style={{
                width: 256,
                height: 256,
                display: 'grid',
                placeItems: 'center',
                color: '#888',
                fontSize: 12,
              }}
            >
              {error ? 'failed to load' : 'loading…'}
            </div>
          )}
        </div>

        <div style={{ fontSize: 13, color: '#444', minWidth: 220 }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Manifest</h2>
          {pose ? (
            <pre style={{ background: '#f5f5f5', padding: '0.6rem', borderRadius: 4, margin: 0 }}>
              {JSON.stringify(pose.manifest, null, 2)}
            </pre>
          ) : (
            <p style={{ color: '#888' }}>—</p>
          )}
          {error ? (
            <pre style={{ color: '#b00', whiteSpace: 'pre-wrap', marginTop: '0.75rem' }}>
              {error}
            </pre>
          ) : null}
        </div>
      </section>
    </main>
  );
}
