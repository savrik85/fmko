CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`player_id` integer,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`impact` text,
	`season` text,
	`round` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `league_standings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`played` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`goals_for` integer DEFAULT 0 NOT NULL,
	`goals_against` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`district` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`season` text NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`total_rounds` integer NOT NULL,
	`status` text DEFAULT 'preparation' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` integer NOT NULL,
	`round` integer NOT NULL,
	`home_team_id` integer NOT NULL,
	`away_team_id` integer NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`events` text,
	`commentary` text,
	`played_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`nickname` text,
	`age` integer NOT NULL,
	`position` text NOT NULL,
	`speed` integer NOT NULL,
	`technique` integer NOT NULL,
	`shooting` integer NOT NULL,
	`passing` integer NOT NULL,
	`heading` integer NOT NULL,
	`defense` integer NOT NULL,
	`goalkeeping` integer DEFAULT 1 NOT NULL,
	`stamina` integer NOT NULL,
	`strength` integer NOT NULL,
	`injury_proneness` integer NOT NULL,
	`discipline` integer NOT NULL,
	`patriotism` integer NOT NULL,
	`alcohol` integer NOT NULL,
	`temper` integer NOT NULL,
	`occupation` text,
	`body_type` text NOT NULL,
	`avatar_config` text NOT NULL,
	`condition` integer DEFAULT 100 NOT NULL,
	`morale` integer DEFAULT 50 NOT NULL,
	`injured_until` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_a_id` integer NOT NULL,
	`player_b_id` integer NOT NULL,
	`type` text NOT NULL,
	`strength` integer DEFAULT 50 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`player_a_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_b_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`monthly_amount` integer NOT NULL,
	`win_bonus` integer DEFAULT 0 NOT NULL,
	`contract_until` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`village_id` integer NOT NULL,
	`name` text NOT NULL,
	`primary_color` text NOT NULL,
	`secondary_color` text NOT NULL,
	`budget` integer NOT NULL,
	`reputation` integer DEFAULT 50 NOT NULL,
	`league_id` integer,
	`is_ai` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`village_id`) REFERENCES `villages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`google_id` text,
	`display_name` text NOT NULL,
	`team_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE TABLE `villages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`district` text NOT NULL,
	`region` text NOT NULL,
	`population` integer NOT NULL,
	`latitude` real,
	`longitude` real,
	`category` text NOT NULL,
	`base_budget` integer NOT NULL,
	`player_pool_size` integer NOT NULL,
	`pitch_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `villages_code_unique` ON `villages` (`code`);