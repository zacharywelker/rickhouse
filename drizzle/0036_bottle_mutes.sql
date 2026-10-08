-- A bottle can be muted from What to drink tonight and Roulette for a while. NULL is not muted; a bottle is muted
-- while this date is after today, so a mute lapses by itself and nothing needs to clear it. The server holds an
-- end date to at most three months out (src/lib/tonight/rules.ts).
ALTER TABLE "bottles" ADD COLUMN "muted_until" date;
