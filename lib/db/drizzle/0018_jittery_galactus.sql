CREATE TABLE "news_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"user_id" text NOT NULL,
	"news_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_reads_user_news_key" UNIQUE("user_id","news_id")
);
--> statement-breakpoint
DROP TABLE "db_console_log" CASCADE;--> statement-breakpoint
CREATE INDEX "news_reads_news_idx" ON "news_reads" USING btree ("news_id");--> statement-breakpoint
ALTER TABLE "news" DROP COLUMN "is_read";