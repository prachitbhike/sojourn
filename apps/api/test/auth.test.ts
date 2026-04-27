import { describe, expect, it } from 'vitest';
import { createCharacterFor, makeCookieJar, setupTestApp } from './setup.js';

describe('edit-key auth middleware', () => {
  it('happy path: PATCH succeeds with X-Edit-Key header', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey } = await createCharacterFor(ctx);

    const response = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': editKey,
      },
      body: JSON.stringify({ name: 'Sir Galahad' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { character: { name: string } };
    expect(body.character.name).toBe('Sir Galahad');
  });

  it('happy path: PATCH succeeds with the slug-namespaced cookie', async () => {
    const ctx = await setupTestApp();
    const { slug, cookies } = await createCharacterFor(ctx);

    expect(cookies.get(`sojourn_edit_${slug}`)).toBeDefined();

    const response = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CookieKnight' }),
      cookieJar: cookies,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { character: { name: string } };
    expect(body.character.name).toBe('CookieKnight');
  });

  it('rejects with 401 when neither header nor cookie is provided', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const response = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'no-auth' }),
    });

    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe('unauthorized');
  });

  it('rejects with 403 when X-Edit-Key header is wrong', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const response = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': 'definitely-not-the-real-key-zzzz',
      },
      body: JSON.stringify({ name: 'nope' }),
    });

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe('forbidden');
  });

  it('rejects with 403 when cookie has the wrong value', async () => {
    const ctx = await setupTestApp();
    const { slug } = await createCharacterFor(ctx);

    const wrongJar = makeCookieJar();
    wrongJar.set(`sojourn_edit_${slug}`, 'wrong-value-here-zzz-zzz');

    const response = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'nope' }),
      cookieJar: wrongJar,
    });

    expect(response.status).toBe(403);
  });

  it('rejects the old key after rotation', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey: originalKey } = await createCharacterFor(ctx);

    const rotateRes = await ctx.fetch(`/api/characters/${slug}/rotate-key`, {
      method: 'POST',
      headers: { 'X-Edit-Key': originalKey },
    });
    expect(rotateRes.status).toBe(200);
    const rotateBody = (await rotateRes.json()) as { editKey: string };
    expect(rotateBody.editKey).not.toBe(originalKey);

    const response = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': originalKey,
      },
      body: JSON.stringify({ name: 'still-old' }),
    });
    expect(response.status).toBe(403);

    const withNewKey = await ctx.fetch(`/api/characters/${slug}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Edit-Key': rotateBody.editKey,
      },
      body: JSON.stringify({ name: 'new-name' }),
    });
    expect(withNewKey.status).toBe(200);
  });

  it('rotate-key issues a fresh Set-Cookie for the same slug', async () => {
    const ctx = await setupTestApp();
    const { slug, editKey, cookies } = await createCharacterFor(ctx);
    const originalCookieValue = cookies.get(`sojourn_edit_${slug}`);
    expect(originalCookieValue).toBeDefined();

    const rotateRes = await ctx.fetch(`/api/characters/${slug}/rotate-key`, {
      method: 'POST',
      headers: { 'X-Edit-Key': editKey },
      cookieJar: cookies,
    });
    expect(rotateRes.status).toBe(200);
    const rotateBody = (await rotateRes.json()) as { editKey: string };

    const updatedCookieValue = cookies.get(`sojourn_edit_${slug}`);
    expect(updatedCookieValue).toBe(rotateBody.editKey);
    expect(updatedCookieValue).not.toBe(originalCookieValue);
  });

  it('cookie name is namespaced per slug (editing one character does not auth another)', async () => {
    const ctx = await setupTestApp();
    const a = await createCharacterFor(ctx, 'character A');
    const b = await createCharacterFor(ctx, 'character B');

    expect(a.cookies.get(`sojourn_edit_${a.slug}`)).toBeDefined();
    expect(b.cookies.get(`sojourn_edit_${b.slug}`)).toBeDefined();
    expect(a.cookies.has(`sojourn_edit_${b.slug}`)).toBe(false);

    const cross = await ctx.fetch(`/api/characters/${b.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cross-edit' }),
      cookieJar: a.cookies,
    });
    expect(cross.status).toBe(401);
  });
});
