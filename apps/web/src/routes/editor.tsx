import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  POSE_NAMES,
  type CharacterDto,
  type PatchCharacterRequest,
  type PoseDto,
  type PoseName,
} from '@sojourn/shared';
import {
  ApiError,
  getCharacter,
  patchCharacter,
  regeneratePortrait,
  regeneratePose,
} from '../api/client.js';
import { EditUrlBanner } from '../components/EditUrlBanner.js';
import { PortraitImage } from '../components/PortraitImage.js';
import { PoseStage } from '../components/PoseStage.js';
import { AiAssist } from '../components/Inspector/AiAssist.js';
import { Inspector } from '../components/Inspector/Inspector.js';
import { PoseGrid } from '../components/PoseGrid/PoseGrid.js';
import { useEditKey } from '../lib/useEditKey.js';
import styles from './editor.module.css';

const PORTRAIT_DEBOUNCE_MS = 1500;

const VISUAL_KEYS: ReadonlyArray<keyof NonNullable<PatchCharacterRequest['attributes']>> = [
  'archetype',
  'outfit',
  'palette',
  'expression',
];

function deltaTouchesVisuals(delta: PatchCharacterRequest): boolean {
  if (!delta.attributes) return false;
  return VISUAL_KEYS.some((key) => key in (delta.attributes as Record<string, unknown>));
}

function pickInitialPoseName(poses: PoseDto[]): PoseName | null {
  if (poses.length === 0) return null;
  const idle = poses.find((p) => p.name === 'idle');
  return (idle ?? poses[0]!).name;
}

function mergePose(prev: PoseDto[], next: PoseDto): PoseDto[] {
  const idx = prev.findIndex((p) => p.name === next.name);
  if (idx === -1) return [...prev, next];
  const out = prev.slice();
  out[idx] = next;
  return out;
}

export function EditorPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const auth = useEditKey();

  const [character, setCharacter] = useState<CharacterDto | null>(null);
  const [poses, setPoses] = useState<PoseDto[]>([]);
  const [currentPoseName, setCurrentPoseName] = useState<PoseName | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingCount, setSavingCount] = useState(0);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [busyPose, setBusyPose] = useState<PoseName | null>(null);

  const portraitTimerRef = useRef<number | null>(null);
  const portraitAbortRef = useRef<AbortController | null>(null);

  // Initial load + cleanup.
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
        setLoadError(message);
      }
    })();
    return () => {
      cancelled = true;
      if (portraitTimerRef.current) {
        window.clearTimeout(portraitTimerRef.current);
        portraitTimerRef.current = null;
      }
      portraitAbortRef.current?.abort();
      portraitAbortRef.current = null;
    };
  }, [slug]);

  const handleActionError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        setActionError(
          'Edit key invalid — reopen the original edit URL with the correct ?key= to make changes.',
        );
      } else if (err.status === 404) {
        setActionError('Character not found.');
      } else {
        setActionError(err.message);
      }
    } else {
      setActionError(err instanceof Error ? err.message : 'failed');
    }
  }, []);

  const runPortraitRegen = useCallback(async () => {
    portraitAbortRef.current?.abort();
    const controller = new AbortController();
    portraitAbortRef.current = controller;
    setPortraitBusy(true);
    try {
      const res = await regeneratePortrait(slug, auth, controller.signal);
      if (controller.signal.aborted) return;
      setCharacter(res.character);
      setActionError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      handleActionError(err);
    } finally {
      if (portraitAbortRef.current === controller) portraitAbortRef.current = null;
      setPortraitBusy(false);
    }
  }, [slug, auth, handleActionError]);

  const schedulePortraitRegen = useCallback(() => {
    if (portraitTimerRef.current) window.clearTimeout(portraitTimerRef.current);
    portraitTimerRef.current = window.setTimeout(() => {
      portraitTimerRef.current = null;
      void runPortraitRegen();
    }, PORTRAIT_DEBOUNCE_MS);
  }, [runPortraitRegen]);

  const handlePatch = useCallback(
    async (delta: PatchCharacterRequest) => {
      const triggersRegen = deltaTouchesVisuals(delta);
      setSavingCount((n) => n + 1);
      try {
        const res = await patchCharacter(slug, delta, auth);
        setCharacter(res.character);
        setActionError(null);
        if (triggersRegen) schedulePortraitRegen();
      } catch (err) {
        handleActionError(err);
      } finally {
        setSavingCount((n) => n - 1);
      }
    },
    [slug, auth, schedulePortraitRegen, handleActionError],
  );

  const handleManualPortraitRegen = useCallback(() => {
    if (portraitTimerRef.current) {
      window.clearTimeout(portraitTimerRef.current);
      portraitTimerRef.current = null;
    }
    void runPortraitRegen();
  }, [runPortraitRegen]);

  const handlePoseAction = useCallback(
    async (name: PoseName) => {
      setBusyPose(name);
      try {
        const res = await regeneratePose(slug, name, auth);
        setPoses((prev) => mergePose(prev, res.pose));
        setActionError(null);
        setCurrentPoseName((prev) => prev ?? res.pose.name);
      } catch (err) {
        handleActionError(err);
      } finally {
        setBusyPose(null);
      }
    },
    [slug, auth, handleActionError],
  );

  const handleAiAssist = useCallback((line: string) => {
    setTranscript((prev) => [...prev, line]);
  }, []);

  const availableToAdd = useMemo<PoseName[]>(
    () => POSE_NAMES.filter((n) => !poses.some((p) => p.name === n)),
    [poses],
  );

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBanner}>{loadError}</div>
      </div>
    );
  }
  if (!character || !currentPoseName) {
    return (
      <div className={styles.page}>
        <p style={{ color: 'var(--sj-muted)' }}>loading…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <EditUrlBanner slug={slug} />

      <div className={styles.headerRow}>
        <h1 className={styles.title}>{character.name}</h1>
        <span className={styles.subtitle}>/c/{character.slug}/edit</span>
      </div>

      {actionError && <div className={styles.errorBanner}>{actionError}</div>}

      <div className={styles.main}>
        <section className={styles.stageCol}>
          <div className={styles.portraitBlock}>
            <PortraitImage
              url={character.portraitUrl}
              status={character.portraitStatus}
              alt={`portrait of ${character.name}`}
            />
            <button
              type="button"
              className={styles.regenBtn}
              onClick={handleManualPortraitRegen}
              disabled={portraitBusy}
            >
              {portraitBusy ? 'regenerating portrait…' : 'regenerate portrait'}
            </button>
          </div>

          <PoseStage
            poses={poses}
            currentPoseName={currentPoseName}
            onSelect={(name) => setCurrentPoseName(name)}
          />

          <div className={styles.poseGridBlock}>
            <span className={styles.poseGridLabel}>poses</span>
            <PoseGrid
              poses={poses}
              available={availableToAdd}
              busyPose={busyPose}
              currentPoseName={currentPoseName}
              onSelect={(name) => setCurrentPoseName(name)}
              onRegenerate={handlePoseAction}
              onAdd={handlePoseAction}
            />
          </div>
        </section>

        <aside className={styles.inspectorCol}>
          <AiAssist transcript={transcript} onSubmit={handleAiAssist} />
          <Inspector
            key={character.id}
            character={character}
            onPatch={handlePatch}
            saving={savingCount > 0}
          />
        </aside>
      </div>
    </div>
  );
}
