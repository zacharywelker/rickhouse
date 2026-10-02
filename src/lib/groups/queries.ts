import "server-only";
import { and, asc, eq, getViewSelectedFields, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList, groupBottles, groups, type FieldGroup, type Group } from "@/db/schema";
import { queryBottles, type GridRow } from "@/lib/bottles/grid";
import { smartGroupFilters } from "./smart";

/** Every bottle_list column except the two search-only ones (see lib/bottles/grid.ts). */
const { search: _search, searchText: _searchText, ...GRID_COLUMNS } = getViewSelectedFields(bottleList);

export type GroupSummary = Group & {
  bottleCount: number;
  /** Up to three member thumbnails, for a cover collage when there's no cover image. */
  memberThumbs: string[];
  /** The first few members' fill and spirit family, drawn as bottles when nobody has a photo yet. */
  memberBottles: Array<{ fillPct: number; fieldGroup: FieldGroup }>;
};

const MAX_COLLAGE_THUMBS = 3;

/** The Groups list page: every group, with enough to render a cover. */
export async function listGroups(ownerId: number): Promise<GroupSummary[]> {
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
      memberBottles: sql<Array<{ fillPct: number; fieldGroup: FieldGroup }>>`
        coalesce(
          json_agg(
            json_build_object('fillPct', ${bottleList.fillPct}, 'fieldGroup', ${bottleList.fieldGroup})
            order by ${groupBottles.position}
          ) filter (where ${bottleList.id} is not null),
          '[]'
        )
      `,
    })
    .from(groups)
    .leftJoin(groupBottles, eq(groupBottles.groupId, groups.id))
    .leftJoin(bottleList, eq(bottleList.id, groupBottles.bottleId))
    .where(eq(groups.ownerId, ownerId))
    .groupBy(groups.id)
    .orderBy(asc(groups.name));

  return Promise.all(
    rows.map(async ({ group, bottleCount, memberThumbs, memberBottles }) => {
      if (group.filterQuery === null) {
        return {
          ...group,
          bottleCount,
          memberThumbs: memberThumbs.slice(0, MAX_COLLAGE_THUMBS),
          memberBottles: memberBottles.slice(0, MAX_COLLAGE_THUMBS),
        };
      }
      // A smart group has no member rows; its cover comes from what it matches now.
      const { rows: first, total } = await queryBottles(smartGroupFilters(group.filterQuery, MAX_COLLAGE_THUMBS), ownerId);
      return {
        ...group,
        bottleCount: total,
        memberThumbs: first.flatMap((row) => (row.thumbPath ? [row.thumbPath] : [])),
        memberBottles: first.map((row) => ({ fillPct: row.fillPct, fieldGroup: row.fieldGroup })),
      };
    }),
  );
}

export type GroupDetail = { group: Group; members: GridRow[]; total: number };

/**
 * A single group and its bottles: in the order they were arranged, or for a
 * smart group, whatever its filters match today in the order they sort.
 */
export async function getGroupDetail(id: number, ownerId: number): Promise<GroupDetail | null> {
  const group = await getGroup(id, ownerId);
  if (!group) return null;

  if (group.filterQuery !== null) {
    const { rows, total } = await queryBottles(smartGroupFilters(group.filterQuery), ownerId);
    return { group, members: rows, total };
  }

  const memberRows = await db
    .select({ bottle: GRID_COLUMNS })
    .from(groupBottles)
    .innerJoin(bottleList, eq(bottleList.id, groupBottles.bottleId))
    .where(eq(groupBottles.groupId, group.id))
    .orderBy(asc(groupBottles.position));

  return { group, members: memberRows.map((row) => row.bottle), total: memberRows.length };
}

/** Null unless the group belongs to `ownerId`. */
export async function getGroup(id: number, ownerId: number): Promise<Group | null> {
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)))
    .limit(1);
  return group ?? null;
}

export type GroupOption = { id: number; name: string };

/** Every hand-picked group, for the "add to group" picker on a bottle. A smart group picks its own. */
export async function allGroupOptions(ownerId: number): Promise<GroupOption[]> {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(and(eq(groups.ownerId, ownerId), isNull(groups.filterQuery)))
    .orderBy(asc(groups.name));
}

/**
 * The groups a given bottle already belongs to, with names for chips/links.
 * A group and its bottles always share an owner (enforced in Postgres).
 */
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
export async function allBottleOptions(ownerId: number): Promise<BottlePickerOption[]> {
  return db
    .select({
      id: bottleList.id,
      brand: bottleList.brand,
      expressionName: bottleList.expressionName,
      batch: bottleList.batch,
      thumbPath: bottleList.thumbPath,
    })
    .from(bottleList)
    .where(eq(bottleList.ownerId, ownerId))
    .orderBy(asc(bottleList.brand), asc(bottleList.expressionName));
}
