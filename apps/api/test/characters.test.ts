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

  it('POST /characters rejects prompts over 4000 chars', async () => {
    const ctx = await setupTestApp();
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a'.repeat(4001) }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message?: string };
    expect(body.error).toBe('bad_request');
    expect(body.message).toContain('4000');
  });

  it('POST /characters accepts a refImageUrl on the asset host and persists it', async () => {
    const ctx = await setupTestApp();
    const refImageUrl = 'https://assets.test.sojourn.app/uploads/refs/abc123.png';
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a brave knight', refImageUrl }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      character: { slug: string; refImageUrl: string | null };
    };
    expect(body.character.refImageUrl).toBe(refImageUrl);

    const get = await ctx.fetch(`/api/characters/${body.character.slug}`);
    const getBody = (await get.json()) as { character: { refImageUrl: string | null } };
    expect(getBody.character.refImageUrl).toBe(refImageUrl);
  });

  it('POST /characters rejects refImageUrl on a foreign host with 400', async () => {
    const ctx = await setupTestApp();
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a brave knight',
        refImageUrl: 'https://attacker.example.com/evil.png',
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('bad_request');
  });

  it('POST /characters rejects refImageUrl with non-https schemes', async () => {
    const ctx = await setupTestApp();
    for (const url of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'http://assets.test.sojourn.app/uploads/refs/abc.png',
      'file:///etc/passwd',
      'not a url',
    ]) {
      const response = await ctx.fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'p', refImageUrl: url }),
      });
      expect(response.status, `url=${url}`).toBe(400);
    }
  });

  it('POST /characters rejects non-string refImageUrl with 400', async () => {
    const ctx = await setupTestApp();
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'p', refImageUrl: 42 }),
    });
    expect(response.status).toBe(400);
  });

  it('POST /characters rejects prefix-attack refImageUrl (foreign host that starts with the asset host string)', async () => {
    const ctx = await setupTestApp();
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'p',
        refImageUrl: 'https://assets.test.sojourn.app.attacker.com/x.png',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('POST /characters rejects refImageUrl when asset host is not configured', async () => {
    const ctx = await setupTestApp({ assetPublicBaseUrl: null });
    const response = await ctx.fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'p',
        refImageUrl: 'https://assets.test.sojourn.app/uploads/refs/abc.png',
      }),
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

  it('POST /voice rejects empty / whitespace text with 400', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);
    for (const text of ['', '   ']) {
      const response = await ctx.fetch(`/api/characters/${slug}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Edit-Key': editKey },
        body: JSON.stringify({ text }),
      });
      expect(response.status, `text=${JSON.stringify(text)}`).toBe(400);
    }
  });
});
