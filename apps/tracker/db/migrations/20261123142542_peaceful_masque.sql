CREATE TABLE `show_site_ids` (
	`site_id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `show_site_ids_show` ON `show_site_ids` (`show_id`);--> statement-breakpoint
ALTER TABLE `shows` ADD `format` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `status` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `season` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `year` integer;--> statement-breakpoint
ALTER TABLE `shows` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `episode_minutes` integer;--> statement-breakpoint
CREATE INDEX `releases_show_airs_at` ON `releases` (`show_id`,`airs_at`);--> statement-breakpoint
INSERT INTO `show_site_ids` (`site_id`, `show_id`) SELECT `id`, `id` FROM `shows`;
