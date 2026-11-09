ALTER TABLE expression_finishes ADD COLUMN share_pct numeric(5,2);
--> statement-breakpoint
CREATE TABLE expression_finish_mashbills (
    id            serial PRIMARY KEY,
    expression_id integer NOT NULL,
    mashbill_id   integer NOT NULL,
    finish_id     integer,
    share_pct     numeric(5,2),
    position      integer NOT NULL DEFAULT 0,
    CONSTRAINT expression_finish_mashbills_share_check CHECK (share_pct IS NULL OR (share_pct >= 0 AND share_pct <= 100)),
    CONSTRAINT expression_finish_mashbills_mashbill_fk FOREIGN KEY (expression_id, mashbill_id)
        REFERENCES expression_mashbills (expression_id, mashbill_id) ON DELETE CASCADE,
    CONSTRAINT expression_finish_mashbills_finish_fk FOREIGN KEY (expression_id, finish_id)
        REFERENCES expression_finishes (expression_id, finish_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX expression_finish_mashbills_pair_unique
    ON expression_finish_mashbills (expression_id, mashbill_id, COALESCE(finish_id, 0));
