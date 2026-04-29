ALTER TABLE `characters` ADD `portrait_error_message` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `portrait_generations_today` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `pose_generations_today` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `generations_today_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `poses` ADD `error_message` text;
