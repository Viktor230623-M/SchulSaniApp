CREATE TYPE "public"."privacy_request_status" AS ENUM('pending', 'in_review', 'fulfilled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection');--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"requester_email" text,
	"request_type" "privacy_request_type" NOT NULL,
	"subject_name" text NOT NULL,
	"subject_relation" text,
	"status" "privacy_request_status" DEFAULT 'pending' NOT NULL,
	"handled_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "privacy_requests_school_created_idx" ON "privacy_requests" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_requester_idx" ON "privacy_requests" USING btree ("requester_id","created_at");