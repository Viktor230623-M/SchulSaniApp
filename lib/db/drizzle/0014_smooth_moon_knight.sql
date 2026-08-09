CREATE TABLE "shift_members" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shift_members_shift_user_key" UNIQUE("shift_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shift_members" ADD CONSTRAINT "shift_members_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_members_user_idx" ON "shift_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shifts_school_starts_idx" ON "shifts" USING btree ("school_id","starts_at");