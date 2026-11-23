ALTER TABLE `shows` ADD `format` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `status` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `season` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `year` integer;--> statement-breakpoint
ALTER TABLE `shows` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `episode_minutes` integer;--> statement-breakpoint
ALTER TABLE `shows` ADD `site_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `shows` SET `site_ids` = json_array(`id`) WHERE `site_ids` = '[]';
