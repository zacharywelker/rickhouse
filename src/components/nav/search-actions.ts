"use server";

import { requireSession } from "@/lib/auth";
import { loadNavSearchData } from "@/lib/nav-search/load";
import { navSearch, type NavSearchResult } from "@/lib/nav-search/search";

/** The nav search for the signed-in account. The query is cut to 100 characters; more is never a real search. */
export async function navSearchAction(query: string): Promise<NavSearchResult> {
  const user = await requireSession();
  return navSearch(await loadNavSearchData(user.id), query.trim().slice(0, 100));
}
