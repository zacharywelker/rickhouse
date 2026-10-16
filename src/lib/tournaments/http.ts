import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject, type ApiErrorBody } from "@/lib/api/v1";
import type { Failure } from "./state";

type Halt = { response: NextResponse<ApiErrorBody> };

/** The signed-in user, or the 401 to answer with. */
export async function authed(): Promise<{ userId: number } | Halt> {
  const user = await getCurrentUser();
  return user ? { userId: user.id } : { response: apiError(401, "unauthorized", "Sign in first.") };
}

/** A request's JSON body checked against `schema`, or the 415, 400 or 422 to answer with. */
export async function parsed<T extends z.ZodType>(request: NextRequest, schema: T): Promise<{ data: z.infer<T> } | Halt> {
  const read = await readJsonObject(request);
  if ("error" in read) return { response: read.error };
  const result = schema.safeParse(read.body);
  if (!result.success) {
    return { response: apiError(422, "invalid", result.error.issues[0]?.message ?? "Check the fields.", issueFields(result.error.issues)) };
  }
  return { data: result.data };
}

/** Path ids as numbers, or the 404 to answer with. */
export function ids<K extends string>(params: Record<K, string>, gone: string): Record<K, number> | Halt {
  const out = {} as Record<K, number>;
  for (const key of Object.keys(params) as K[]) {
    const n = parseId(params[key]);
    if (n === null) return { response: apiError(404, "not_found", gone) };
    out[key] = n;
  }
  return out;
}

/** A command that could not be done, as the API's error body. */
export function failed(f: Failure): NextResponse<ApiErrorBody> {
  return apiError(f.status, f.status === 404 ? "not_found" : f.status === 409 ? "conflict" : "invalid", f.message, f.fields);
}

export const isHalt = (value: object): value is Halt => "response" in value;

export const json = (body: unknown, status = 200): NextResponse => NextResponse.json(body, { status });
