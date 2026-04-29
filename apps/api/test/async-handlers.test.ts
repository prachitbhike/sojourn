import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@sojourn/shared';
import {
  createStubPortraitGenerator,
  createStubSpriteGenerator,
  STUB_POSE_MANIFESTS,
  type GeneratorRegistry,
  type PortraitGenerationResult,
  type PortraitGenerator,
  type PoseGenerationResult,
  type SpriteGenerator,
} from '@sojourn/shared/generators';
import { createCharacterFor, setupTestApp } from './setup.js';

// A generator pair whose `generate*` calls block on a manually-released
// promise. Useful for asserting the "writes pending immediately, returns 202"
// behavior deterministically — without controllable timing the stub generator
// resolves synchronously and the row flips to ready before the test can read it.
function createControllableGenerators(stubBaseUrl: string) {
  let portraitRelease: (result: PortraitGenerationResult) => void = () => {};
  let portraitReject: (err: Error) => void = () => {};
  let portraitPromise: Promise<PortraitGenerationResult> = new Promise((resolve, reject) => {
    portraitRelease = resolve;
    portraitReject = reject;
  });
  const portrait: PortraitGenerator = {
    id: 'stub',
    generatePortrait: vi.fn(() => portraitPromise),
  };

  let poseRelease: (result: PoseGenerationResult) => void = () => {};
  let poseReject: (err: Error) => void = () => {};
  let posePromise: Promise<PoseGenerationResult> = new Promise((resolve, reject) => {
    poseRelease = resolve;
    poseReject = reject;
  });
  const sprite: SpriteGenerator = {
    id: 'stub',
    generatePose: vi.fn(() => posePromise),
  };

  const registry: GeneratorRegistry = {
    portraits: { stub: portrait },
    sprites: { stub: sprite },
  };

  return {
    registry,
    arm() {
      portraitPromise = new Promise((resolve, reject) => {
        portraitRelease = resolve;
        portraitReject = reject;
      });
      portrait.generatePortrait = vi.fn(() => portraitPromise);
      posePromise = new Promise((resolve, reject) => {
        poseRelease = resolve;
        poseReject = reject;
      });
      sprite.generatePose = vi.fn(() => posePromise);
    },
    releasePortrait(url = `${stubBaseUrl}/portrait.png`) {
      portraitRelease({ url, status: 'ready' });
    },
    rejectPortrait(err: Error) {
      portraitReject(err);
    },
    releasePose(name: keyof typeof STUB_POSE_MANIFESTS, url?: string) {
      poseRelease({
        spriteSheetUrl: url ?? `${stubBaseUrl}/${name}.png`,
        manifest: STUB_POSE_MANIFESTS[name],
        status: 'ready',
      });
    },
    rejectPose(err: Error) {
      poseReject(err);
    },
  };
}

describe('async handler — POST /portrait', () => {
  it('returns 202 with status=pending immediately and writes a pending row', async () => {
    const stubBaseUrl = 'http://stubs.test/stubs/v1';
    const ctrl = createControllableGenerators(stubBaseUrl);

    // Pre-arm and release for the synchronous create-character flow so it succeeds.
    ctrl.releasePortrait();
    ctrl.releasePose('idle');

    const ctx = await setupTestApp({ generators: ctrl.registry, stubBaseUrl });
    const { slug, editKey } = await createCharacterFor(ctx);

    // Re-arm so the next generator call blocks on a release.
    ctrl.arm();

    const res = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { character: { portraitStatus: string } };
    expect(body.character.portraitStatus).toBe('pending');

    // The row is pending in the DB while the background promise is still blocked.
    const pendingRow = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(pendingRow?.portraitStatus).toBe('pending');
    expect(pendingRow?.portraitErrorMessage).toBeNull();
    expect(ctx.background.size()).toBeGreaterThan(0);

    ctrl.releasePortrait();
    await ctx.drain();

    const settled = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(settled?.portraitStatus).toBe('ready');
    expect(settled?.portraitUrl).toMatch(/portrait\.png$/);
  });

  it('writes status=failed with a truncated errorMessage when the generator throws', async () => {
    const stubBaseUrl = 'http://stubs.test/stubs/v1';
    const ctrl = createControllableGenerators(stubBaseUrl);
    ctrl.releasePortrait();
    ctrl.releasePose('idle');

    const ctx = await setupTestApp({ generators: ctrl.registry, stubBaseUrl });
    const { slug, editKey } = await createCharacterFor(ctx);

    ctrl.arm();
    const longMessage = 'boom: '.repeat(200); // > 500 chars
    const res = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(res.status).toBe(202);
    ctrl.rejectPortrait(new Error(longMessage));
    await ctx.drain();

    const row = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    expect(row?.portraitStatus).toBe('failed');
    expect(row?.portraitErrorMessage).toBeTruthy();
    expect(row!.portraitErrorMessage!.length).toBeLessThanOrEqual(500);
  });
});

describe('async handler — POST /poses', () => {
  it('returns 202 with status=pending and inserts a pending pose row immediately', async () => {
    const stubBaseUrl = 'http://stubs.test/stubs/v1';
    const ctrl = createControllableGenerators(stubBaseUrl);
    ctrl.releasePortrait();
    ctrl.releasePose('idle');

    const ctx = await setupTestApp({ generators: ctrl.registry, stubBaseUrl });
    const { slug, editKey } = await createCharacterFor(ctx);

    ctrl.arm();
    const res = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ name: 'walk' }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { pose: { name: string; status: string } };
    expect(body.pose.name).toBe('walk');
    expect(body.pose.status).toBe('pending');

    const character = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    const walkRow = (
      await ctx.db
        .select()
        .from(schema.poses)
        .where(eq(schema.poses.characterId, character!.id))
        .all()
    ).find((r) => r.name === 'walk');
    expect(walkRow).toBeDefined();
    expect(walkRow!.status).toBe('pending');
    // Placeholder URL/manifest satisfy the NOT NULL constraints and round-trip
    // through the renderer with a real (stub catalog) asset.
    expect(walkRow!.spriteSheetUrl).toMatch(/walk\.png$/);

    ctrl.releasePose('walk');
    await ctx.drain();

    const settled = (
      await ctx.db
        .select()
        .from(schema.poses)
        .where(eq(schema.poses.characterId, character!.id))
        .all()
    ).find((r) => r.name === 'walk');
    expect(settled?.status).toBe('ready');
    expect(settled?.errorMessage).toBeNull();
  });

  it('records the generator error on failure', async () => {
    const stubBaseUrl = 'http://stubs.test/stubs/v1';
    const ctrl = createControllableGenerators(stubBaseUrl);
    ctrl.releasePortrait();
    ctrl.releasePose('idle');

    const ctx = await setupTestApp({ generators: ctrl.registry, stubBaseUrl });
    const { slug, editKey } = await createCharacterFor(ctx);

    ctrl.arm();
    const res = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ name: 'walk' }),
    });
    expect(res.status).toBe(202);
    ctrl.rejectPose(new Error('pixellab quota exhausted'));
    await ctx.drain();

    const character = await ctx.db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.slug, slug))
      .get();
    const walkRow = (
      await ctx.db
        .select()
        .from(schema.poses)
        .where(eq(schema.poses.characterId, character!.id))
        .all()
    ).find((r) => r.name === 'walk');
    expect(walkRow?.status).toBe('failed');
    expect(walkRow?.errorMessage).toContain('pixellab quota exhausted');
  });
});

describe('stub generator end-to-end (regression)', () => {
  it('POST /portrait + drain settles to a stub catalog URL with the real stub generator', async () => {
    const stubBaseUrl = 'http://stubs.test/stubs/v1';
    const registry: GeneratorRegistry = {
      portraits: { stub: createStubPortraitGenerator(stubBaseUrl) },
      sprites: { stub: createStubSpriteGenerator(stubBaseUrl) },
    };
    const ctx = await setupTestApp({ generators: registry, stubBaseUrl });
    const { slug, editKey } = await createCharacterFor(ctx);

    await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    await ctx.drain();

    const after = (await (
      await ctx.fetch(`/api/characters/${slug}`)
    ).json()) as { character: { portraitUrl: string; portraitStatus: string } };
    expect(after.character.portraitStatus).toBe('ready');
    expect(after.character.portraitUrl).toBe(`${stubBaseUrl}/portrait.png`);
  });
});
