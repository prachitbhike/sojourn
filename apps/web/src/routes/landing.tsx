import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createCharacter, uploadReferenceImage } from '../api/client.js';

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024; // mirrors REFERENCE_UPLOAD_MAX_BYTES default

type RefState =
  | { kind: 'empty' }
  | { kind: 'uploading'; previewUrl: string; fileName: string }
  | { kind: 'ready'; previewUrl: string; fileName: string; refImageUrl: string }
  | { kind: 'error'; message: string };

export function LandingPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refState, setRefState] = useState<RefState>({ kind: 'empty' });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl =
    refState.kind === 'uploading' || refState.kind === 'ready' ? refState.previewUrl : null;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = async (file: File) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      setRefState({ kind: 'error', message: 'reference must be PNG, JPEG, or WebP' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setRefState({ kind: 'error', message: 'reference must be 8 MiB or smaller' });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setRefState({ kind: 'uploading', previewUrl: objectUrl, fileName: file.name });
    try {
      const refImageUrl = await uploadReferenceImage(file);
      setRefState({ kind: 'ready', previewUrl: objectUrl, fileName: file.name, refImageUrl });
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'upload failed';
      setRefState({ kind: 'error', message });
    }
  };

  const removeReference = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRefState({ kind: 'empty' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (refState.kind === 'uploading') return;
    setSubmitting(true);
    setError(null);
    try {
      const refImageUrl = refState.kind === 'ready' ? refState.refImageUrl : undefined;
      const res = await createCharacter(trimmed, refImageUrl);
      navigate(`/c/${res.character.slug}/edit?key=${encodeURIComponent(res.editKey)}`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'failed';
      setError(message);
      setSubmitting(false);
    }
  };

  const submitDisabled =
    !prompt.trim() || submitting || refState.kind === 'uploading';

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
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
          <ReferenceDropZone
            state={refState}
            dragOver={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPick={() => fileInputRef.current?.click()}
            onRemove={removeReference}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
        <button
          type="submit"
          disabled={submitDisabled}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            background: !submitDisabled ? 'var(--sj-accent-bg)' : '#1a1a1a',
            color: !submitDisabled ? '#cfe3ff' : '#666',
            border: '1px solid var(--sj-border)',
            borderRadius: 6,
            cursor: !submitDisabled ? 'pointer' : 'not-allowed',
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

type DropZoneProps = {
  state: RefState;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onPick: () => void;
  onRemove: () => void;
};

function ReferenceDropZone({
  state,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onRemove,
}: DropZoneProps) {
  const hasPreview = state.kind === 'uploading' || state.kind === 'ready';
  const previewUrl = hasPreview ? state.previewUrl : null;
  const borderColor = dragOver
    ? 'var(--sj-accent-border, #4a6a9a)'
    : 'var(--sj-border)';
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={state.kind === 'ready' || state.kind === 'uploading' ? undefined : onPick}
      role="button"
      aria-label="reference image drop zone"
      style={{
        position: 'relative',
        background: '#0e0e0e',
        border: `1px dashed ${borderColor}`,
        borderRadius: 6,
        cursor: state.kind === 'uploading' ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--sj-muted)',
        padding: 6,
        overflow: 'hidden',
        minHeight: 96,
      }}
    >
      {previewUrl && (
        <img
          src={previewUrl}
          alt="reference preview"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: state.kind === 'uploading' ? 0.5 : 1,
          }}
        />
      )}
      {state.kind === 'empty' && (
        <span>drop a reference image (PNG/JPEG/WebP, ≤8 MiB)</span>
      )}
      {state.kind === 'uploading' && (
        <span style={{ position: 'relative', color: '#ddd', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4 }}>
          uploading…
        </span>
      )}
      {state.kind === 'ready' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="remove reference image"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'rgba(0,0,0,0.7)',
            color: '#ddd',
            border: '1px solid var(--sj-border)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          remove
        </button>
      )}
      {state.kind === 'error' && (
        <span style={{ color: '#ff8a8a', fontSize: 11, padding: 4 }}>{state.message}</span>
      )}
    </div>
  );
}
