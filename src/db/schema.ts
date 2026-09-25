/**
 * Drizzle mirror of `schema.sql`, which remains the source of truth for the
 * data model. Keep the two in lockstep: if you change one, change the other.
 *
 * Three rules from SPEC.md are load-bearing here:
 *   1. `expressions` (the product) and `bottles` (the physical unit) stay split.
 *   2. Distilleries, mashbills and finishes are many-to-many with `position`.
 *   3. Category-specific fields are sparse nullable columns, not EAV or JSONB.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Case-insensitive text. Requires `CREATE EXTENSION citext`. */
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

/** Money: numeric in Postgres, string in TS. Never parse these into floats. */
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });
/** Percentage-ish numerics (proof, share, grain split). Also string in TS. */
const pct = (name: string) => numeric(name, { precision: 5, scale: 2 });

// ------------------------------------------------------------
// Taxonomy
// ------------------------------------------------------------

/**
 * Self-referencing: Whiskey > American Whiskey > Bourbon, and later
 * Rum > Jamaican > Pot Still, in one structure.
 */
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: citext("name").notNull(),
    slug: text("slug").notNull().unique(),
    parentId: integer("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    /** Drives the conditional field sections in the expression form. */
    fieldGroup: text("field_group").notNull().default("other").$type<FieldGroup>(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("categories_parent_idx").on(t.parentId), unique().on(t.name, t.parentId)],
);

/** Ownership chains: Brown-Forman -> Old Forester. */
export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    /** The account this belongs to. Everything but categories is per-user. */
    ownerId: integer("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    name: citext("name").notNull(),
    slug: text("slug").notNull(),
    parentId: integer("parent_id").references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
    country: text("country"),
    website: text("website"),
    notes: text("notes"),
  },
  (t) => [
    index("companies_parent_idx").on(t.parentId),
    index("companies_owner_idx").on(t.ownerId),
    unique("companies_owner_name_unique").on(t.ownerId, t.name),
    unique("companies_owner_slug_unique").on(t.ownerId, t.slug),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: serial("id").primaryKey(),
    /** The account this belongs to. Everything but categories is per-user. */
    ownerId: integer("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    name: citext("name").notNull(),
    slug: text("slug").notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    /** Non-distiller producer: sources whiskey rather than distilling it. */
    isNdp: boolean("is_ndp").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [
    index("brands_company_idx").on(t.companyId),
    index("brands_owner_idx").on(t.ownerId),
    unique("brands_owner_name_unique").on(t.ownerId, t.name),
    unique("brands_owner_slug_unique").on(t.ownerId, t.slug),
  ],
);

export const distilleries = pgTable(
  "distilleries",
  {
    id: serial("id").primaryKey(),
    /** The account this belongs to. Everything but categories is per-user. */
    ownerId: integer("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    name: citext("name").notNull(),
    slug: text("slug").notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("USA"),
    dspNumber: text("dsp_number"),
    founded: integer("founded"),
    notes: text("notes"),
  },
  (t) => [
    index("distilleries_company_idx").on(t.companyId),
    index("distilleries_owner_idx").on(t.ownerId),
    unique("distilleries_owner_name_unique").on(t.ownerId, t.name),
    unique("distilleries_owner_slug_unique").on(t.ownerId, t.slug),
  ],
);

/**
 * Reusable so you can ask "everything using this recipe" — and reused across
 * distilleries on purpose, because the same recipe name gets used by more
 * than one producer. Which distillery supplied it is a property of a given
 * label's blend, not of the recipe, so that link lives on
 * `expressionMashbills` instead.
 */
export const mashbills = pgTable("mashbills", {
  id: serial("id").primaryKey(),
  /** The account this belongs to. Everything but categories is per-user. */
  ownerId: integer("owner_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  name: citext("name"),
  notes: text("notes"),
}, (t) => [
  index("mashbills_owner_idx").on(t.ownerId),
]);

/**
 * Grains as rows (M7). The old fixed columns handled exactly one unusual
 * grain; a recipe with both oats and triticale lost the second one's name.
 *
 * The 99–101 tolerance lives in a DEFERRABLE constraint trigger in Postgres,
 * which Drizzle has no way to declare — see schema.sql. It fires at commit, so
 * a multi-row edit can pass through totals that are not 100.
 */
export const mashbillGrains = pgTable(
  "mashbill_grains",
  {
    id: serial("id").primaryKey(),
    mashbillId: integer("mashbill_id")
      .notNull()
      .references(() => mashbills.id, { onDelete: "cascade" }),
    grain: text("grain").notNull(),
    percent: pct("percent").notNull(),
    /** Entry order. Display sorts by percent; this is only the tiebreak. */
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("mashbill_grains_mashbill_idx").on(t.mashbillId),
    unique().on(t.mashbillId, t.grain),
    check("mashbill_grains_percent_check", sql`${t.percent} > 0 AND ${t.percent} <= 100`),
  ],
);


export const finishes = pgTable("finishes", {
  id: serial("id").primaryKey(),
  /** The account this belongs to. Everything but categories is per-user. */
  ownerId: integer("owner_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  name: citext("name").notNull(),
  slug: text("slug").notNull(),
  finishType: text("finish_type").notNull().default("other").$type<FinishType>(),
  notes: text("notes"),
}, (t) => [
  index("finishes_owner_idx").on(t.ownerId),
  unique("finishes_owner_name_unique").on(t.ownerId, t.name),
  unique("finishes_owner_slug_unique").on(t.ownerId, t.slug),
]);

export const stores = pgTable(
  "stores",
  {
    id: serial("id").primaryKey(),
    /** The account this belongs to. Everything but categories is per-user. */
    ownerId: integer("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    name: citext("name").notNull(),
    slug: text("slug").notNull(),
    location: text("location"),
    isOnline: boolean("is_online").notNull().default(false),
    url: text("url"),
    notes: text("notes"),
  },
  (t) => [
    index("stores_owner_idx").on(t.ownerId),
    unique("stores_owner_name_location_unique").on(t.ownerId, t.name, t.location),
    unique("stores_owner_slug_unique").on(t.ownerId, t.slug),
  ],
);

// ------------------------------------------------------------
// Expressions (the product)
// ------------------------------------------------------------

export const expressions = pgTable(
  "expressions",
  {
    id: serial("id").primaryKey(),
    /** The account this belongs to. Everything but categories is per-user. */
    ownerId: integer("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: citext("name").notNull(),
    slug: text("slug").notNull(),

    // Strength, as the product is normally sold. A bottle may override it.
    proof: pct("proof"),
    abv: pct("abv").generatedAlwaysAs(sql`(proof / 2.0)`),
    isCaskStrength: boolean("is_cask_strength").notNull().default(false),
    isBottledInBond: boolean("is_bottled_in_bond").notNull().default(false),

    // Age, as the product is normally sold. A bottle may override it.
    // NULL age_years = NAS; age_statement carries the human text.
    ageYears: numeric("age_years", { precision: 4, scale: 1 }),
    ageMonths: integer("age_months"),
    ageDays: integer("age_days"),
    ageStatement: text("age_statement"),
    // Designations that imply a minimum age (SPEC #12): checking one fills in
    // age_statement when it is blank, without overwriting a more specific
    // statement someone already typed — Old Grand Dad 7 is bottled-in-bond
    // (>= 4 years) but the label says "7 Year", and 7 Year is what should show.
    isStraight: boolean("is_straight").notNull().default(false),
    isNas: boolean("is_nas").notNull().default(false),

    // Process
    isChillFiltered: boolean("is_chill_filtered"),
    colorAdded: boolean("color_added"),
    entryProof: pct("entry_proof"),
    charLevel: text("char_level"),

    msrp: money("msrp"),
    sizeMl: integer("size_ml").notNull().default(750),
    upc: text("upc"),
    labelNotes: text("label_notes"),
    description: text("description"),

    // ---- Rum-specific (shown when category.field_group = 'rum')
    stillType: text("still_type"),
    estate: text("estate"),
    marque: text("marque"),
    esterGl: numeric("ester_gl", { precision: 8, scale: 2 }),
    sugarGPerL: numeric("sugar_g_per_l", { precision: 6, scale: 2 }),
    isSolera: boolean("is_solera"),
    soleraRange: text("solera_range"),
    tropicalYears: numeric("tropical_years", { precision: 4, scale: 1 }),
    continentalYears: numeric("continental_years", { precision: 4, scale: 1 }),
    molassesOrCane: text("molasses_or_cane"),

    // ---- Agave-specific
    agaveType: text("agave_type"),
    agaveRegion: text("agave_region"),
    cookingMethod: text("cooking_method"),
    extraction: text("extraction"),
    isAdditiveFree: boolean("is_additive_free"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("expressions_brand_idx").on(t.brandId),
    index("expressions_category_idx").on(t.categoryId),
    // Barcode lookup. Not unique: relabels and regional variants share codes.
    index("expressions_upc_idx").on(t.upc).where(sql`${t.upc} IS NOT NULL`),
    unique().on(t.brandId, t.name),
    index("expressions_owner_idx").on(t.ownerId),
    unique("expressions_owner_slug_unique").on(t.ownerId, t.slug),
  ],
);

export const expressionDistilleries = pgTable(
  "expression_distilleries",
  {
    expressionId: integer("expression_id")
      .notNull()
      .references(() => expressions.id, { onDelete: "cascade" }),
    distilleryId: integer("distillery_id")
      .notNull()
      .references(() => distilleries.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    sharePct: pct("share_pct"),
  },
  (t) => [primaryKey({ columns: [t.expressionId, t.distilleryId] })],
);

export const expressionMashbills = pgTable(
  "expression_mashbills",
  {
    expressionId: integer("expression_id")
      .notNull()
      .references(() => expressions.id, { onDelete: "cascade" }),
    mashbillId: integer("mashbill_id")
      .notNull()
      .references(() => mashbills.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    sharePct: pct("share_pct"),
    // Which of the label's distilleries made this mashbill. Only meaningful
    // — and only ever set — when the label has more than one distillery;
    // with exactly one, that distillery is the automatic answer and this
    // stays NULL (issue #13).
    distilleryId: integer("distillery_id").references(() => distilleries.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.expressionId, t.mashbillId] })],
);

export const expressionFinishes = pgTable(
  "expression_finishes",
  {
    expressionId: integer("expression_id")
      .notNull()
      .references(() => expressions.id, { onDelete: "cascade" }),
    finishId: integer("finish_id")
      .notNull()
      .references(() => finishes.id, { onDelete: "cascade" }),
    /** Sequence for double finishes. */
    position: integer("position").notNull().default(0),
    months: integer("months"),
  },
  (t) => [primaryKey({ columns: [t.expressionId, t.finishId] })],
);

// ------------------------------------------------------------
// Bottles (the physical unit)
// ------------------------------------------------------------

export const bottles = pgTable(
  "bottles",
  {
    id: serial("id").primaryKey(),
    /** The account this belongs to. Everything but categories is per-user. */
    ownerId: integer("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    expressionId: integer("expression_id")
      .notNull()
      .references(() => expressions.id, { onDelete: "restrict" }),

    // ---- Release identity (M7). Here, not on the label, because these vary
    // barrel to barrel — six picks of one Weller 12 are six bottles of one
    // product, and putting these upstream forced a duplicate product per pick.
    batch: text("batch"),
    releaseYear: integer("release_year"),
    isSingleBarrel: boolean("is_single_barrel").notNull().default(false),
    isSingleBarrelPick: boolean("is_single_barrel_pick").notNull().default(false),
    barrelNumber: text("barrel_number"),
    bottleCount: integer("bottle_count"),
    pickName: text("pick_name"),
    pickedBy: text("picked_by"),
    barrelFilledOn: date("barrel_filled_on"),
    bottledOn: date("bottled_on"),
    warehouse: text("warehouse"),
    rickFloor: text("rick_floor"),

    // ---- Overrides. NULL inherits from the label, resolved in bottle_list
    // rather than copied on save, so correcting the label still flows through.
    proof: pct("proof"),
    abv: pct("abv").generatedAlwaysAs(sql`(proof / 2.0)`),
    ageYears: numeric("age_years", { precision: 4, scale: 1 }),
    ageMonths: integer("age_months"),
    ageDays: integer("age_days"),
    ageStatement: text("age_statement"),

    // Acquisition
    pricePaid: money("price_paid"),
    storeId: integer("store_id").references(() => stores.id, { onDelete: "set null" }),
    dateAcquired: date("date_acquired"),
    acquisition: text("acquisition").notNull().default("purchase").$type<Acquisition>(),
    acquisitionNotes: text("acquisition_notes"),

    // State
    isOpen: boolean("is_open").notNull().default(false),
    dateOpened: date("date_opened"),
    fillPct: smallint("fill_pct").notNull().default(100),
    dateKilled: date("date_killed"),
    status: text("status").notNull().default("owned").$type<BottleStatus>(),

    location: text("location"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("bottles_expression_idx").on(t.expressionId),
    index("bottles_store_idx").on(t.storeId),
    index("bottles_status_idx").on(t.status),
    index("bottles_owner_idx").on(t.ownerId),
    check("bottles_fill_pct_check", sql`${t.fillPct} BETWEEN 0 AND 100`),
  ],
);

export const bottleImages = pgTable(
  "bottle_images",
  {
    id: serial("id").primaryKey(),
    bottleId: integer("bottle_id")
      .notNull()
      .references(() => bottles.id, { onDelete: "cascade" }),
    /** Relative to the uploads volume. */
    filePath: text("file_path").notNull(),
    thumbPath: text("thumb_path"),
    caption: text("caption"),
    /** Label/product shot vs. a personal photo (SPEC §19: catalog info vs. photos of the object's life). */
    kind: text("kind").notNull().default("life").$type<PhotoKind>(),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bottle_images_one_primary").on(t.bottleId).where(sql`${t.isPrimary}`),
  ],
);

/** Attached to the bottle, so you can compare batches. */
export const tastingNotes = pgTable(
  "tasting_notes",
  {
    id: serial("id").primaryKey(),
    bottleId: integer("bottle_id")
      .notNull()
      .references(() => bottles.id, { onDelete: "cascade" }),
    tastedOn: date("tasted_on").notNull().default(sql`CURRENT_DATE`),
    rating: numeric("rating", { precision: 3, scale: 1 }),
    nose: text("nose"),
    palate: text("palate"),
    finish: text("finish"),
    overall: text("overall"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasting_notes_bottle_idx").on(t.bottleId),
    check("tasting_notes_rating_check", sql`${t.rating} BETWEEN 0 AND 10`),
  ],
);

/** Optional pour log. If you use it, fill_pct can be recomputed from it. */
export const pours = pgTable(
  "pours",
  {
    id: serial("id").primaryKey(),
    bottleId: integer("bottle_id")
      .notNull()
      .references(() => bottles.id, { onDelete: "cascade" }),
    pouredAt: timestamp("poured_at", { withTimezone: true }).notNull().defaultNow(),
    amountMl: numeric("amount_ml", { precision: 6, scale: 2 }),
    occasion: text("occasion"),
  },
  (t) => [index("pours_bottle_idx").on(t.bottleId)],
);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  /** The account this belongs to. Everything but categories is per-user. */
  ownerId: integer("owner_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  name: citext("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color"),
}, (t) => [
  index("tags_owner_idx").on(t.ownerId),
  unique("tags_owner_name_unique").on(t.ownerId, t.name),
  unique("tags_owner_slug_unique").on(t.ownerId, t.slug),
]);

export const bottleTags = pgTable(
  "bottle_tags",
  {
    bottleId: integer("bottle_id")
      .notNull()
      .references(() => bottles.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.bottleId, t.tagId] })],
);

// ------------------------------------------------------------
// Groups (personal, curated collections — not saved filters. DESIGN.md §15:
// "The database tells you what you own. Groups tell you what it means.")
// ------------------------------------------------------------

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  /** The account this belongs to. Everything but categories is per-user. */
  ownerId: integer("owner_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  name: citext("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  coverImagePath: text("cover_image_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("groups_owner_idx").on(t.ownerId),
  unique("groups_owner_name_unique").on(t.ownerId, t.name),
  unique("groups_owner_slug_unique").on(t.ownerId, t.slug),
]);

export const groupBottles = pgTable(
  "group_bottles",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    bottleId: integer("bottle_id")
      .notNull()
      .references(() => bottles.id, { onDelete: "cascade" }),
    /** Entry order — groups arrange bottles in clusters, not a sorted table. */
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.bottleId] }), index("group_bottles_bottle_idx").on(t.bottleId)],
);

// ------------------------------------------------------------
// Backups
// ------------------------------------------------------------

/**
 * Single row (id is always 1), so the schedule lives in the same database it
 * protects rather than in a config file the admin UI can't reach. The app
 * itself runs the backup — see src/lib/backup — so this is the only
 * persisted state a restart needs to pick the schedule back up.
 */
export const backupSettings = pgTable("backup_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  intervalHours: integer("interval_hours").notNull().default(24),
  keep: integer("keep").notNull().default(14),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunOk: boolean("last_run_ok"),
  lastRunError: text("last_run_error"),
});

// ------------------------------------------------------------
// Accounts (Better Auth)
// ------------------------------------------------------------

export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Property names are Better Auth's field names (its Drizzle adapter looks
 * columns up by them); the SQL names stay snake_case like the rest of the
 * schema. Better Auth hands serial IDs to the app as strings.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: citext("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    username: citext("username").notNull().unique(),
    displayUsername: text("display_username"),
    role: text("role").notNull().default("member").$type<UserRole>(),
    /** "Deactivated" in the UI. Better Auth revokes every session on ban. */
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
    /** Set on generated passwords; the app routes to /account/setup until cleared. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("users_role_check", sql`${t.role} IN ('admin', 'member')`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Signed with SESSION_SECRET in the cookie, so a backup alone cannot be replayed. */
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Admin plugin column. Impersonation is disabled, so this stays null. */
    impersonatedBy: text("impersonated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One row per way to sign in: 'credential' holds the password hash; each linked SSO identity is another. */
export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    unique("accounts_provider_account_unique").on(t.providerId, t.accountId),
  ],
);

/** Short-lived tokens: password reset links, email verification, SSO state. */
export const verifications = pgTable(
  "verifications",
  {
    id: serial("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ------------------------------------------------------------
// Convenience view: the flat list for the grid page
// ------------------------------------------------------------

/**
 * Created by a hand-written migration (drizzle-kit does not round-trip the
 * correlated sub-selects cleanly), so it is declared `.existing()` here and
 * only used for reads.
 */
export const bottleList = pgView("bottle_list", {
  id: integer("id").notNull(),
  ownerId: integer("owner_id").notNull(),
  status: text("status").notNull().$type<BottleStatus>(),
  isOpen: boolean("is_open").notNull(),
  fillPct: smallint("fill_pct").notNull(),
  pricePaid: money("price_paid"),
  dateAcquired: date("date_acquired"),
  dateOpened: date("date_opened"),
  isFavorite: boolean("is_favorite").notNull(),
  storeId: integer("store_id"),
  batch: text("batch"),
  releaseYear: integer("release_year"),
  isSingleBarrel: boolean("is_single_barrel").notNull(),
  isSingleBarrelPick: boolean("is_single_barrel_pick").notNull(),
  pickName: text("pick_name"),
  barrelFilledOn: date("barrel_filled_on"),
  bottledOn: date("bottled_on"),
  expressionId: integer("expression_id").notNull(),
  expressionName: citext("expression_name").notNull(),
  /** Already resolved: the bottle's own value, or the label's. */
  proof: pct("proof"),
  abv: pct("abv"),
  ageYears: numeric("age_years", { precision: 4, scale: 1 }),
  ageStatement: text("age_statement"),
  /** True when the value above came from the label rather than the bottle. */
  proofInherited: boolean("proof_inherited").notNull(),
  ageInherited: boolean("age_inherited").notNull(),
  msrp: money("msrp"),
  brandId: integer("brand_id").notNull(),
  brand: citext("brand").notNull(),
  categoryId: integer("category_id").notNull(),
  category: citext("category").notNull(),
  /** The category's top-level bucket (whiskey, rum, agave…) — what category color keys off, not the display name. */
  fieldGroup: text("field_group").notNull().$type<FieldGroup>(),
  store: citext("store"),
  distilleries: text("distilleries"),
  finishes: text("finishes"),
  avgRating: numeric("avg_rating", { precision: 3, scale: 1 }),
  thumbPath: text("thumb_path"),
  /**
   * Weighted tsvector over brand, expression, distilleries, finishes, store
   * and every note attached to the bottle (SPEC M6). Declared as text because
   * Drizzle has no tsvector type and nothing here ever reads the value — it is
   * only ever matched against, in raw SQL.
   */
  search: text("search"),
  /** The same corpus as plain text, for the substring arm of the search. */
  searchText: text("search_text"),
}).existing();

// ------------------------------------------------------------
// Enumerated text values. Kept as text in Postgres so adding a value is a
// data change, not a migration; narrowed here and validated with Zod.
// ------------------------------------------------------------

export const FIELD_GROUPS = ["whiskey", "rum", "agave", "brandy", "gin", "vodka", "liqueur", "other"] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

export const FINISH_TYPES = ["wood", "wine", "fortified", "beer", "spirit", "other"] as const;
export type FinishType = (typeof FINISH_TYPES)[number];

export const ACQUISITIONS = ["purchase", "gift", "trade", "allocation", "lottery", "secondary"] as const;
export type Acquisition = (typeof ACQUISITIONS)[number];

export const BOTTLE_STATUSES = ["owned", "open", "killed", "sold", "traded", "wishlist", "sampled"] as const;
export type BottleStatus = (typeof BOTTLE_STATUSES)[number];

export const STILL_TYPES = ["pot", "column", "blend", "coffey"] as const;
export type StillType = (typeof STILL_TYPES)[number];

export const PHOTO_KINDS = ["catalog", "life"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export type Category = typeof categories.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Distillery = typeof distilleries.$inferSelect;
export type Mashbill = typeof mashbills.$inferSelect;
export type Finish = typeof finishes.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Expression = typeof expressions.$inferSelect;
export type Bottle = typeof bottles.$inferSelect;
export type BottleImage = typeof bottleImages.$inferSelect;
export type TastingNote = typeof tastingNotes.$inferSelect;
export type BottleListRow = typeof bottleList.$inferSelect;
export type Group = typeof groups.$inferSelect;
