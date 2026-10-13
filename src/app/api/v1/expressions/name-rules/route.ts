import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { categoryFieldGroups, categoryKindsById } from "@/lib/expressions/queries";
import { nameContextFor, nameRuleColumns } from "@/lib/expressions/rules";

export const dynamic = "force-dynamic";

/**
 * What a name says for a category, before the label exists: the flags and values the web form would fill in as
 * the name is typed (Cask Strength, Bottled In Bond with its proof and age). The app asks as the name changes and
 * decides for itself when to apply them, so a switch the person turned off stays off.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const name = request.nextUrl.searchParams.get("name")?.slice(0, 160) ?? "";
  const categoryId = Number(request.nextUrl.searchParams.get("categoryId"));
  const [groups, kinds] = await Promise.all([categoryFieldGroups(), categoryKindsById()]);
  const blank = { name: "", categoryId: null, proof: null, entryProof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, isNas: false, isStraight: false, isBottledInBond: false, isCaskStrength: false };
  const says = nameRuleColumns(blank, { name, categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null }, (values) =>
    nameContextFor(values, groups, kinds),
  );
  return NextResponse.json({
    isCaskStrength: says.isCaskStrength === true,
    isBottledInBond: says.isBottledInBond === true,
    proof: typeof says.proof === "string" ? says.proof : null,
    ageYears: typeof says.ageYears === "string" ? says.ageYears : null,
  });
}
