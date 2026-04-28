import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CharacterDto, PoseDto, PoseName } from '@sojourn/shared';
import { ApiError, getCharacter } from '../api/client.js';
import { PortraitImage } from '../components/PortraitImage.js';
import { PoseStage } from '../components/PoseStage.js';
import styles from './viewer.module.css';

function pickInitialPoseName(poses: PoseDto[]): PoseName | null {
  if (poses.length === 0) return null;
  const idle = poses.find((p) => p.name === 'idle');
  return (idle ?? poses[0]!).name;
}

export function ViewerPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [character, setCharacter] = useState<CharacterDto | null>(null);
  const [poses, setPoses] = useState<PoseDto[]>([]);
  const [currentPoseName, setCurrentPoseName] = useState<PoseName | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCharacter(slug);
        if (cancelled) return;
        setCharacter(res.character);
        setPoses(res.poses);
        setCurrentPoseName(pickInitialPoseName(res.poses));
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'failed';
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBanner}>{error}</div>
      </div>
    );
  }
  if (!character) {
    return (
      <div className={styles.page}>
        <p style={{ color: 'var(--sj-muted)' }}>loading…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.headerRow}>
        <h1 className={styles.title}>{character.name}</h1>
        <span className={styles.subtitle}>/c/{character.slug}</span>
      </header>
      <div className={styles.content}>
        <PortraitImage
          url={character.portraitUrl}
          status={character.portraitStatus}
          alt={`portrait of ${character.name}`}
        />
        {currentPoseName ? (
          <PoseStage
            poses={poses}
            currentPoseName={currentPoseName}
            onSelect={(name) => setCurrentPoseName(name)}
          />
        ) : (
          <p style={{ color: 'var(--sj-muted)', fontSize: 13 }}>no poses yet</p>
        )}
      </div>
    </div>
  );
}
