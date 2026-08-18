DROP INDEX "users_email_lower_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_school_email_lower_unique" ON "users" USING btree ("school_id",lower("email"));