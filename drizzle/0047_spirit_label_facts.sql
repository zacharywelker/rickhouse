ALTER TABLE ingredients DROP CONSTRAINT ingredients_kind_check;
--> statement-breakpoint
ALTER TABLE ingredients ADD CONSTRAINT ingredients_kind_check CHECK (kind IN ('maguey', 'distillate', 'rum_base', 'botanical', 'gin_base', 'vodka_base', 'flavor', 'liqueur_base'));
--> statement-breakpoint
ALTER TABLE expression_ingredients ADD COLUMN is_manual boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN is_aged boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN amaro_style text;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN peat_status text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN origin_country text;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN origin_region text;
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN dairy_status text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE expressions ADD COLUMN is_non_chill_filtered boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE expressions SET is_non_chill_filtered = true WHERE is_chill_filtered = false;
--> statement-breakpoint
ALTER TABLE expressions ADD CONSTRAINT expressions_peat_status_check CHECK (peat_status IN ('unknown', 'unpeated', 'peated'));
--> statement-breakpoint
ALTER TABLE expressions ADD CONSTRAINT expressions_dairy_status_check CHECK (dairy_status IN ('unknown', 'dairy', 'non-dairy'));
