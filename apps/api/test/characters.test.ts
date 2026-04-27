import { describe, expect, it } from 'vitest';
import { createCharacterFor, setupTestApp } from './setup.js';

describe('character lifecycle', () => {
  it('POST /characters creates a row with stub portrait + idle pose, sets the cookie', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey, cookies } = await createCharacterFor(ctx, 'a brave knight');

    expect(slug).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(editKey).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(cookies.get(`sojourn_edit_${slug}`)).toBe(editKey);

    const get = await ctx.fetch(`/api/characters/${slug}`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as {
      character: { portraitUrl: string | null; portraitStatus: string; basePrompt: string };
      poses: Array<{ name: string; status: string }>;
    };
    expect(body.character.basePrompt).toBe('a brave knight');
    expect(body.character.portraitUrl).toContain('/portrait.png');
    expect(body.character.portraitStatus).toBe('ready');
    expect(body.poses).toHaveLength(1);
    expect(body.poses[0]?.name).toBe('idle');
    expect(body.poses[0]?.status).toBe('ready');
  });

  it('GET /characters/:slug works without auth (public read)', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);
    const response = await ctx.fetch(`/api/characters/${slug}`);
    expect(response.status).toBe(200);
  });

  it('GET /characters/:slug returns 404 for unknown slug', async () => {
    const ctx = await setupTestApp();
    const response = await ctx.fetch('/api/characters/doesnotex');
    expect(response.status).toBe(404);
  });

  it('POST /characters rejects empty prompt', async () => {
    const ctx = await setupTestApp();
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    expect(response.status).toBe(400);
  });

  it('PATCH merges attributes rather than replacing them', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ attributes: { archetype: 'wizard' } }),
    });
    await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ attributes: { outfit: 'robe' } }),
    });

    const final = await ctx.fetch(`/api/characters/${slug}`);
    const body = (await final.json()) as { character: { attributes: Record<string, unknown> } };
    expect(body.character.attributes).toEqual({ archetype: 'wizard', outfit: 'robe' });
  });

  it('POST /poses regenerates an existing pose row instead of creating a duplicate', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const first = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ name: 'idle' }),
    });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { pose: { id: string } };

    const second = await ctx.fetch(`/api/characters/${slug}/poses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ name: 'idle' }),
    });
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as { pose: { id: string } };
    expect(secondBody.pose.id).toBe(firstBody.pose.id);

    const get = await ctx.fetch(`/api/characters/${slug}`);
    const getBody = (await get.json()) as { poses: Array<{ name: string }> };
    expect(getBody.poses.filter((p) => p.name === 'idle')).toHaveLength(1);
  });

  it('POST /voice returns the stub audio URL when authed', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);
    const response = await ctx.fetch(`/api/characters/${slug}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
      body: JSON.stringify({ text: 'hello world' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { audioUrl: string };
    expect(body.audioUrl).toBe(`${ctx.stubBaseUrl}/voice.mp3`);
  });

  it('POST /voice rejects unauthenticated callers (editor-only)', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);
    const response = await ctx.fetch(`/api/characters/${slug}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'no auth' }),
    });
    expect(response.status).toBe(401);
  });
});
