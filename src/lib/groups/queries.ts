import "server-only";
import { asc, eq, getViewSelectedFields, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList, groupBottles, groups, type Group } from "@/db/schema";
import type { GridRow } from "@/lib/bottles/grid";

/** Every bottle_list column except the two search-only ones (see lib/bottles/grid.ts). */
const { search: _search, searchText: _searchText, ...GRID_COLUMNS } = getViewSelectedFields(bottleList);

export type GroupSummary = Group & {
  bottleCount: number;
  /** Up to three member thumbnails, for a cover collage when there's no cover image. */
  memberThumbs: string[];
};

const MAX_COLLAGE_THUMBS = 3;

/** The Groups list page: every group, with enough to render a cover. */
export async function listGroups(): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      group: groups,
      bottleCount: sql<number>`count(${groupBottles.bottleId})::int`,
      memberThumbs: sql<string[]>`
        coalesce(
          array_agg(${bottleList.thumbPath} order by ${groupBottles.position}) filter (where ${bottleList.thumbPath} is not null),
          '{}'
        )
      `,
    })
    .from(groups)
    .leftJoin(groupBottles, eq(groupBottles.groupId, groups.id))
    .leftJoin(bottleList, eq(bottleList.id, groupBottles.bottleId))
    .groupBy(groups.id)
    .orderBy(asc(groups.name));

  return rows.map(({ group, bottleCount, memberThumbs }) => ({
    ...group,
    bottleCount,
    memberThumbs: memberThumbs.slice(0, MAX_COLLAGE_THUMBS),
  }));
}

export type GroupDetail = { group: Group; members: GridRow[] };

/** A single group and its bottles, in the order they were arranged. */
export async function getGroupDetail(id: number): Promise<GroupDetail | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!group) return null;

  const memberRows = await db
    .select({ bottle: GRID_COLUMNS })
    .from(groupBottles)
    .innerJoin(bottleList, eq(bottleList.id, groupBottles.bottleId))
    .where(eq(groupBottles.groupId, group.id))
    .orderBy(asc(groupBottles.position));

  return { group, members: memberRows.map((row) => row.bottle) };
}

export async function getGroup(id: number): Promise<Group | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return group ?? null;
}

export type GroupOption = { id: number; name: string };

/** Every group, for the "add to group" picker on a bottle. */
export async function allGroupOptions(): Promise<GroupOption[]> {
  return db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(asc(groups.name));
}

/** The groups a given bottle already belongs to, with names for chips/links. */
export async function groupsForBottle(bottleId: number): Promise<GroupOption[]> {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(groupBottles)
    .innerJoin(groups, eq(groups.id, groupBottles.groupId))
    .where(eq(groupBottles.bottleId, bottleId))
    .orderBy(asc(groups.name));
}

export type BottlePickerOption = {
  id: number;
  brand: string;
  expressionName: string;
  batch: string | null;
  thumbPath: string | null;
};

/** Every bottle, lightweight, for the "add bottles to this group" picker. */
export async function allBottleOptions(): Promise<BottlePickerOption[]> {
  return db
    .select({
      id: bottleList.id,
      brand: bottleList.brand,
      expressionName: bottleList.expressionName,
      batch: bottleList.batch,
      thumbPath: bottleList.thumbPath,
    })
    .from(bottleList)
    .orderBy(asc(bottleList.brand), asc(bottleList.expressionName));
}
