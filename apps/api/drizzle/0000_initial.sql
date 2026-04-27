CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`edit_key_hash` text NOT NULL,
	`name` text NOT NULL,
	`base_prompt` text NOT NULL,
	`ref_image_url` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	`portrait_url` text,
	`portrait_generator` text DEFAULT 'stub' NOT NULL,
	`portrait_status` text DEFAULT 'pending' NOT NULL,
	`voice_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_slug_idx` ON `characters` (`slug`);--> statement-breakpoint
CREATE TABLE `poses` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`name` text NOT NULL,
	`sprite_sheet_url` text NOT NULL,
	`manifest` text NOT NULL,
	`generator` text DEFAULT 'stub' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `poses_character_id_name_idx` ON `poses` (`character_id`,`name`);