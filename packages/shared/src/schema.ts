import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  CharacterAttributes,
  GenerationStatus,
  PortraitGenerator,
  PoseManifest,
  SpriteGenerator,
} from './types.js';

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    editKeyHash: text('edit_key_hash').notNull(),
    name: text('name').notNull(),
    basePrompt: text('base_prompt').notNull(),
    refImageUrl: text('ref_image_url'),
    attributes: text('attributes', { mode: 'json' })
      .$type<CharacterAttributes>()
      .notNull()
      .default(sql`'{}'`),
    portraitUrl: text('portrait_url'),
    portraitGenerator: text('portrait_generator', {
      enum: ['stub', 'nano-banana'],
    })
      .$type<PortraitGenerator>()
      .notNull()
      .default('stub'),
    portraitStatus: text('portrait_status', {
      enum: ['pending', 'ready', 'failed'],
    })
      .$type<GenerationStatus>()
      .notNull()
      .default('pending'),
    voiceId: text('voice_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    slugIdx: uniqueIndex('characters_slug_idx').on(t.slug),
  }),
);

export const poses = sqliteTable(
  'poses',
  {
    id: text('id').primaryKey(),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    spriteSheetUrl: text('sprite_sheet_url').notNull(),
    manifest: text('manifest', { mode: 'json' }).$type<PoseManifest>().notNull(),
    generator: text('generator', { enum: ['stub', 'pixellab'] })
      .$type<SpriteGenerator>()
      .notNull()
      .default('stub'),
    status: text('status', { enum: ['pending', 'ready', 'failed'] })
      .$type<GenerationStatus>()
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    characterPoseIdx: uniqueIndex('poses_character_id_name_idx').on(t.characterId, t.name),
  }),
);

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type Pose = typeof poses.$inferSelect;
export type NewPose = typeof poses.$inferInsert;
