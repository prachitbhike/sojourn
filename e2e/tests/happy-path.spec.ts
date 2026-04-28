import { test, expect, type Request } from '@playwright/test';

const SLUG_RE = /^[A-Za-z0-9]{8}$/;
const EDIT_KEY_RE = /^[A-Za-z0-9]{24}$/;

test('Phase 0 deliverables happy path', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. POST / via the landing form → redirected to edit URL; cookie sojourn_edit_<slug> is set.
  await page.goto('/');
  await page.getByRole('textbox').fill('a brave knight');
  await page.getByRole('button', { name: /create character/i }).click();

  await page.waitForURL(/\/c\/[A-Za-z0-9]{8}\/edit\?key=[A-Za-z0-9]{24}/, { timeout: 15_000 });
  const url = new URL(page.url());
  const slugMatch = url.pathname.match(/^\/c\/([A-Za-z0-9]{8})\/edit$/);
  expect(slugMatch, 'editor URL should contain an 8-char slug').not.toBeNull();
  const slug = slugMatch![1]!;
  const editKey = url.searchParams.get('key')!;
  expect(slug).toMatch(SLUG_RE);
  expect(editKey).toMatch(EDIT_KEY_RE);

  const cookies = await ctx.cookies();
  const editCookie = cookies.find((c) => c.name === `sojourn_edit_${slug}`);
  expect(editCookie, 'sojourn_edit_<slug> cookie should be set on creation').toBeDefined();
  expect(editCookie!.value).toBe(editKey);
  expect(editCookie!.httpOnly).toBe(true);

  // 2. Editor renders portrait above + idle pose on the Phaser stage.
  const portraitImg = page.getByAltText(/portrait of/i);
  await expect(portraitImg).toBeVisible();
  await expect(portraitImg).toHaveAttribute('src', /\/api\/stubs\/v1\/portrait\.png$/);

  // The Phaser stage mounts a <canvas>; the inspector pose dropdown is the first <select>.
  const phaserCanvas = page.locator('canvas');
  await expect(phaserCanvas).toBeVisible();
  const stageSelect = page.locator('label', { hasText: 'pose' }).locator('select');
  await expect(stageSelect).toHaveValue('idle');

  // Set up shared request listeners that we'll reuse across steps 3 and 4.
  const portraitPosts: Request[] = [];
  const characterPatches: Request[] = [];
  const onRequest = (req: Request) => {
    const u = req.url();
    if (req.method() === 'POST' && u.includes(`/api/characters/${slug}/portrait`)) {
      portraitPosts.push(req);
    }
    if (req.method() === 'PATCH' && u.endsWith(`/api/characters/${slug}`)) {
      characterPatches.push(req);
    }
  };
  page.on('request', onRequest);

  // 3. Edit a non-visual field (name) → PATCH persists, no portrait refetch.
  const nameField = page.getByLabel('name');
  const patchAfterName = page.waitForResponse(
    (res) =>
      res.request().method() === 'PATCH' &&
      res.url().endsWith(`/api/characters/${slug}`) &&
      res.status() === 200,
  );
  await nameField.fill('renamed knight');
  await patchAfterName;

  // Wait beyond the 1.5s portrait debounce window to confirm name edits don't trigger regen.
  await page.waitForTimeout(2_000);
  expect(characterPatches.length, 'name edit fires PATCH').toBeGreaterThan(0);
  expect(portraitPosts.length, 'name edit must not trigger POST /portrait').toBe(0);

  // Confirm the rename round-tripped via the public GET (cache-busted by no-store).
  const getRes = await page.request.get(`/api/characters/${slug}`);
  expect(getRes.status()).toBe(200);
  const getBody = (await getRes.json()) as { character: { name: string } };
  expect(getBody.character.name).toBe('renamed knight');

  // 4. Edit a visual field (outfit) → PATCH persists + debounced POST /portrait fires.
  const portraitPostsBefore = portraitPosts.length;
  const outfitField = page.getByLabel('outfit');
  await outfitField.fill('plate armor');

  await expect
    .poll(() => portraitPosts.length, {
      timeout: 5_000,
      message: 'visual-field edit should debounce-trigger POST /portrait',
    })
    .toBeGreaterThan(portraitPostsBefore);

  // The portrait response is a CharacterDto — assert the panel still shows the stub URL after re-render.
  await expect(portraitImg).toHaveAttribute('src', /\/api\/stubs\/v1\/portrait\.png/);

  // 4b. The explicit "regenerate portrait" button also fires POST /portrait.
  const portraitPostsBeforeManual = portraitPosts.length;
  await page.getByRole('button', { name: /regenerate portrait/i }).click();
  await expect
    .poll(() => portraitPosts.length, {
      timeout: 5_000,
      message: 'manual regenerate-portrait button must POST /portrait',
    })
    .toBeGreaterThan(portraitPostsBeforeManual);

  // 5. + Add pose → walk → POST /poses → card appears in grid → pose plays on stage.
  const posesPostPromise = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      res.url().endsWith(`/api/characters/${slug}/poses`) &&
      res.status() === 202,
  );

  // The "+ add pose" label sits in a child <div>; its parent is the picker container.
  const addPoseCard = page.getByText('+ add pose', { exact: true }).locator('..');
  await addPoseCard.locator('select').selectOption('walk');
  await addPoseCard.getByRole('button', { name: /^add$/ }).click();
  await posesPostPromise;

  // The grid renders a card per pose with the name as a span; assert the walk card is present.
  const walkCard = page.locator('span', { hasText: /^walk$/ });
  await expect(walkCard).toBeVisible();

  // Stage select gains the walk option → switching plays it.
  await expect(stageSelect.locator('option[value="walk"]')).toHaveCount(1);
  await stageSelect.selectOption('walk');
  await expect(stageSelect).toHaveValue('walk');
  await expect(phaserCanvas).toBeVisible();

  page.off('request', onRequest);

  // 6. POST /poses with name "potato" via the API directly → 400.
  const invalidPoseRes = await page.request.post(`/api/characters/${slug}/poses`, {
    headers: { 'X-Edit-Key': editKey, 'Content-Type': 'application/json' },
    data: { name: 'potato' },
  });
  expect(invalidPoseRes.status()).toBe(400);
  const invalidPoseBody = (await invalidPoseRes.json()) as { error: string; message?: string };
  expect(invalidPoseBody.error).toBe('bad_request');
  expect(invalidPoseBody.message ?? '').toMatch(/idle.*walk.*attack.*cast/);

  // 7. Public viewer in a fresh browser context → portrait + Phaser stage with pose dropdown,
  //    no edit UI, no voice button.
  const publicCtx = await browser.newContext();
  const publicPage = await publicCtx.newPage();
  await publicPage.goto(`/c/${slug}`);

  await expect(publicPage.getByAltText(/portrait of/i)).toBeVisible();
  await expect(publicPage.locator('canvas')).toBeVisible();
  const publicSelect = publicPage.locator('label', { hasText: 'pose' }).locator('select');
  await expect(publicSelect).toBeVisible();
  await expect(publicSelect.locator('option[value="walk"]')).toHaveCount(1);

  // No edit affordances.
  await expect(publicPage.getByText(/^inspector$/i)).toHaveCount(0);
  await expect(publicPage.getByRole('button', { name: /regenerate portrait/i })).toHaveCount(0);
  await expect(publicPage.getByRole('button', { name: /^add$/ })).toHaveCount(0);
  await expect(publicPage.getByText(/this is the edit URL/i)).toHaveCount(0);
  // No voice button (Phase 0 scope).
  await expect(publicPage.getByRole('button', { name: /voice/i })).toHaveCount(0);

  // The public context has no edit cookie for this slug.
  const publicCookies = await publicCtx.cookies();
  expect(publicCookies.find((c) => c.name === `sojourn_edit_${slug}`)).toBeUndefined();

  await publicCtx.close();
  await ctx.close();
});
