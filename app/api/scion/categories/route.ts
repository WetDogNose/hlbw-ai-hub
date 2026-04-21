// SCION agent-category registry endpoint.
//
// GET /api/scion/categories
// Returns the list of rubric category names registered in
// `lib/orchestration/rubrics/`. The response stays in the same shape
// regardless of how many rubrics are registered, so the Execute dialog can
// render the dropdown off a live SWR fetch instead of a hardcoded array.
//
// Response: { categories: Array<{ name: string; description: string }> }

import { NextResponse } from "next/server";
import {
  DEFAULT_RUBRIC,
  QA_RUBRIC,
  SOURCE_CONTROL_RUBRIC,
  CLOUD_RUBRIC,
  DB_RUBRIC,
  BIZOPS_RUBRIC,
  type Rubric,
} from "@/lib/orchestration/rubrics";

export interface CategoryEntry {
  name: string;
  description: string;
}

export interface ScionCategoriesResponse {
  categories: CategoryEntry[];
}

// Kept in this route module (not in the rubrics index) so the rubrics package
// stays minimal — only the Execute dialog needs the ordered list today.
const REGISTRY: readonly Rubric[] = [
  DEFAULT_RUBRIC,
  QA_RUBRIC,
  SOURCE_CONTROL_RUBRIC,
  CLOUD_RUBRIC,
  DB_RUBRIC,
  BIZOPS_RUBRIC,
];

export async function GET(): Promise<NextResponse> {
  const categories: CategoryEntry[] = REGISTRY.map((r) => ({
    name: r.name,
    description: r.description,
  }));
  const response: ScionCategoriesResponse = { categories };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
