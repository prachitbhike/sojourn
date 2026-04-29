import { describe, expect, it, vi } from 'vitest';
import {
  createStubPortraitGenerator,
  createStubSpriteGenerator,
  getPortraitGenerator,
  getSpriteGenerator,
  type GeneratorRegistry,
  type PortraitGenerator,
} from '@sojourn/shared/generators';
import { POSE_NAMES } from '@sojourn/shared/pose';
import { createCharacterFor, setupTestApp } from './setup.js';

describe('Generator interface — stub impls', () => {
  it('stub portrait returns the catalog URL with status=ready', async () => {
    const gen = createStubPortraitGenerator('http://stubs.test/stubs/v1');
    expect(gen.id).toBe('stub');
    const result = await gen.generatePortrait({
      characterId: 'cid',
      slug: 'abc12345',
      prompt: 'a knight',
      attributes: {},
    });
    expect(result).toEqual({
      url: 'http://stubs.test/stubs/v1/portrait.png',
      status: 'ready',
    });
  });

  it('stub sprite generator dispatches by pose name and returns the right manifest', async () => {
    const gen = createStubSpriteGenerator('http://stubs.test/stubs/v1');
    expect(gen.id).toBe('stub');
    for (const pose of POSE_NAMES) {
      const result = await gen.generatePose({
        characterId: 'cid',
        slug: 'abc12345',
        poseName: pose,
        prompt: 'a knight',
        attributes: {},
      });
      expect(result.spriteSheetUrl).toBe(`http://stubs.test/stubs/v1/${pose}.png`);
      expect(result.manifest.frameWidth).toBe(64);
      expect(result.manifest.frameHeight).toBe(64);
      expect(result.status).toBe('ready');
    }
  });
});

describe('Generator registry — dispatch by id', () => {
  it('getPortraitGenerator returns the impl whose id matches the requested generator field', () => {
    const stubGen = createStubPortraitGenerator('http://stubs.test/stubs/v1');
    const fakeNanoBanana: PortraitGenerator = {
      id: 'nano-banana',
      generatePortrait: vi.fn().mockResolvedValue({
        url: 'https://nano.example/p.png',
        status: 'ready',
      }),
    };
    const registry: GeneratorRegistry = {
      portraits: { stub: stubGen, 'nano-banana': fakeNanoBanana },
      sprites: { stub: createStubSpriteGenerator('http://stubs.test/stubs/v1') },
    };

    expect(getPortraitGenerator(registry, 'stub')).toBe(stubGen);
    expect(getPortraitGenerator(registry, 'nano-banana')).toBe(fakeNanoBanana);
  });

  it('getSpriteGenerator returns the impl whose id matches the requested generator field', () => {
    const stubSprite = createStubSpriteGenerator('http://stubs.test/stubs/v1');
    const fakePixelLab = {
      id: 'pixellab' as const,
      generatePose: vi.fn(),
    };
    const registry: GeneratorRegistry = {
      portraits: { stub: createStubPortraitGenerator('http://stubs.test/stubs/v1') },
      sprites: { stub: stubSprite, pixellab: fakePixelLab },
    };

    expect(getSpriteGenerator(registry, 'stub')).toBe(stubSprite);
    expect(getSpriteGenerator(registry, 'pixellab')).toBe(fakePixelLab);
  });

  it('throws when asked for an unregistered generator id', () => {
    const registry: GeneratorRegistry = {
      portraits: { stub: createStubPortraitGenerator('http://stubs.test/stubs/v1') },
      sprites: { stub: createStubSpriteGenerator('http://stubs.test/stubs/v1') },
    };
    expect(() => getPortraitGenerator(registry, 'nano-banana')).toThrow(/nano-banana/);
    expect(() => getSpriteGenerator(registry, 'pixellab')).toThrow(/pixellab/);
  });
});

describe('Handler dispatch — picks the impl by the persisted generator field', () => {
  it('POST /portrait routes through the impl matching character.portraitGenerator', async () => {
    const stubBaseUrl = 'http://stubs.test/stubs/v1';
    const portraitSpy = vi
      .fn()
      .mockResolvedValue({ url: 'http://nano.test/sentinel.png', status: 'ready' });
    const fakeNano: PortraitGenerator = {
      id: 'nano-banana',
      generatePortrait: portraitSpy,
    };
    const registry: GeneratorRegistry = {
      portraits: {
        stub: createStubPortraitGenerator(stubBaseUrl),
        'nano-banana': fakeNano,
      },
      sprites: { stub: createStubSpriteGenerator(stubBaseUrl) },
    };

    const ctx = await setupTestApp({ generators: registry, stubBaseUrl });
    const { slug, editKey } = await createCharacterFor(ctx);

    // Default state: portraitGenerator='stub' → stub impl runs, URL points at stub catalog.
    const stubRun = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(stubRun.status).toBe(202);
    const stubBody = (await stubRun.json()) as {
      character: { portraitStatus: string; portraitGenerator: string };
    };
    expect(stubBody.character.portraitStatus).toBe('pending');
    expect(stubBody.character.portraitGenerator).toBe('stub');
    expect(portraitSpy).not.toHaveBeenCalled();

    await ctx.drain();
    const stubAfter = (await (
      await ctx.fetch(`/api/characters/${slug}`)
    ).json()) as { character: { portraitUrl: string; portraitStatus: string } };
    expect(stubAfter.character.portraitUrl).toBe(`${stubBaseUrl}/portrait.png`);
    expect(stubAfter.character.portraitStatus).toBe('ready');

    // Flip portraitGenerator to nano-banana directly in the DB → handler picks the fake impl.
    const { schema } = await import('@sojourn/shared');
    const { eq } = await import('drizzle-orm');
    await ctx.db
      .update(schema.characters)
      .set({ portraitGenerator: 'nano-banana' })
      .where(eq(schema.characters.slug, slug));

    const nanoRun = await ctx.fetch(`/api/characters/${slug}/portrait`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
    });
    expect(nanoRun.status).toBe(202);
    await ctx.drain();
    expect(portraitSpy).toHaveBeenCalledTimes(1);

    const nanoAfter = (await (
      await ctx.fetch(`/api/characters/${slug}`)
    ).json()) as { character: { portraitUrl: string; portraitGenerator: string } };
    expect(nanoAfter.character.portraitUrl).toBe('http://nano.test/sentinel.png');
    expect(nanoAfter.character.portraitGenerator).toBe('nano-banana');
  });
});
