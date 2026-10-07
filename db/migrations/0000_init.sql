CREATE TABLE `card_objectives` (
	`card_id` integer NOT NULL,
	`objective_id` integer NOT NULL,
	PRIMARY KEY(`card_id`, `objective_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`objective_id`) REFERENCES `objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `card_progress` (
	`card_id` integer PRIMARY KEY NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`last_review_at` integer,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_progress_due_idx` ON `card_progress` (`due_at`);--> statement-breakpoint
CREATE TABLE `card_tags` (
	`card_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`card_id`, `tag_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_type` text DEFAULT 'basic' NOT NULL,
	`prompt_markdown` text NOT NULL,
	`answer_markdown` text NOT NULL,
	`explanation_markdown` text,
	`source` text,
	`lifecycle` text DEFAULT 'new' NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_cards` (
	`collection_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`promoted_from_collection_id` integer,
	PRIMARY KEY(`collection_id`, `card_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promoted_from_collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_cards_card_idx` ON `collection_cards` (`card_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`role` text DEFAULT 'container' NOT NULL,
	`description` text,
	`exam_date` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`qualify_passes` integer DEFAULT 1 NOT NULL,
	`qualify_distinct_days` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collections_parent_idx` ON `collections` (`parent_id`);--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`parent_id` integer,
	`code` text,
	`title` text NOT NULL,
	`description` text,
	`exam_weight` real,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`session_id` integer,
	`kind` text NOT NULL,
	`rating` integer NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`reviewed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`elapsed_days` integer,
	`response_time_ms` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `study_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reviews_card_idx` ON `reviews` (`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `reviews_session_idx` ON `reviews` (`session_id`);--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer,
	`mode` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_idx` ON `tags` (`name`);