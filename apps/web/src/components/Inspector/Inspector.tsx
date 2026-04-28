import { useState } from 'react';
import type {
  CharacterAttributes,
  CharacterDto,
  PatchCharacterRequest,
} from '@sojourn/shared';
import { ChipSelect } from './ChipSelect.js';
import { ColorChips } from './ColorChips.js';

const ARCHETYPES = ['', 'wizard', 'warrior', 'rogue', 'ranger', 'cleric', 'bard'] as const;
const EXPRESSIONS = ['neutral', 'happy', 'serious', 'angry', 'sad'] as const;
const VOICE_PLACEHOLDERS = ['default', 'narrator', 'whisper'] as const;

export type InspectorProps = {
  character: CharacterDto;
  onPatch: (delta: PatchCharacterRequest) => void;
  saving: boolean;
};

export function Inspector({ character, onPatch, saving }: InspectorProps) {
  // Local mirror for text inputs so PATCH responses don't yank the field mid-keystroke.
  // Discrete fields (selects/chips) read from `character` directly.
  const [name, setName] = useState(character.name);
  const [outfit, setOutfit] = useState(character.attributes.outfit ?? '');

  const attrs: CharacterAttributes = character.attributes ?? {};

  const patchAttr = <K extends keyof CharacterAttributes>(
    key: K,
    value: CharacterAttributes[K],
  ) => {
    // Send only the changed key. The API merges with existing attributes (see
    // characters.ts:220), so we don't need to spread `attrs` — and not spreading
    // avoids a race where two in-flight PATCHes carry stale snapshots of each other.
    onPatch({ attributes: { [key]: value } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#888', letterSpacing: 0.5 }}>
          inspector
        </h3>
        <span style={{ fontSize: 11, color: saving ? '#7eb8ff' : '#444' }}>
          {saving ? 'saving…' : 'saved'}
        </span>
      </div>

      <Field label="name">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            onPatch({ name: e.target.value });
          }}
          style={textInputStyle}
        />
      </Field>

      <Field label="archetype">
        <select
          value={attrs.archetype ?? ''}
          onChange={(e) => patchAttr('archetype', e.target.value || undefined)}
          style={selectStyle}
        >
          {ARCHETYPES.map((opt) => (
            <option key={opt} value={opt}>
              {opt === '' ? '— none —' : opt}
            </option>
          ))}
        </select>
      </Field>

      <Field label="outfit">
        <input
          type="text"
          value={outfit}
          placeholder="e.g. tattered blue robe"
          onChange={(e) => {
            setOutfit(e.target.value);
            patchAttr('outfit', e.target.value || undefined);
          }}
          style={textInputStyle}
        />
      </Field>

      <Field label="palette">
        <ColorChips
          value={attrs.palette}
          onChange={(next) => patchAttr('palette', next.length ? next : undefined)}
        />
      </Field>

      <Field label="expression">
        <ChipSelect
          value={attrs.expression}
          options={EXPRESSIONS}
          onChange={(next) => patchAttr('expression', next)}
        />
      </Field>

      <Field label="voice">
        <select
          value={character.voiceId ?? 'default'}
          onChange={() => {
            /* placeholder — voiceId not on PatchCharacterRequest in Phase 0 */
          }}
          style={{ ...selectStyle, opacity: 0.6 }}
          aria-label="voice (Phase 2)"
        >
          {VOICE_PLACEHOLDERS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 10, color: '#555' }}>(Phase 2)</span>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const textInputStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  background: '#0e0e0e',
  color: '#ddd',
  border: '1px solid #2c2c2c',
  borderRadius: 4,
};

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  background: '#0e0e0e',
  color: '#ddd',
  border: '1px solid #2c2c2c',
  borderRadius: 4,
};
