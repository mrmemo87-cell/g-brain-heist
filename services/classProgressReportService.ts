// Class Progress Report data (read-only) and the school's expected-level setting.
import { supabase } from "./supabaseClient";
import type { CprData } from "../src/lib/classProgressReport";

export async function fetchClassProgressReport(groupId: string): Promise<CprData> {
  const { data, error } = await supabase.rpc("rpc_class_progress_report", { p_group_id: groupId });
  if (error) throw new Error(error.message?.includes("not_authorized")
    ? "Only the class's teachers and school administrators can open this report."
    : "The progress report could not be opened just now. Nothing was changed. Try again in a moment.");
  return data as CprData;
}

export async function setProgressExpectedLevel(schoolId: string, level: number): Promise<number> {
  const { data, error } = await supabase.rpc("rpc_school_admin_set_progress_expected_level", { p_school_id: schoolId, p_level: Math.round(level) });
  if (error) throw new Error(error.message?.includes("out_of_range")
    ? "Choose an expected level between 40% and 95%."
    : error.message?.includes("not_authorized")
      ? "Only school administrators can change the expected level."
      : "The expected level could not be saved. Try again in a moment.");
  return Number(data);
}

export async function fetchProgressExpectedLevel(schoolId: string): Promise<{ level: number; set: boolean }> {
  const { data, error } = await supabase.from("schools").select("settings").eq("id", schoolId).maybeSingle();
  if (error) throw new Error("The expected level could not be loaded.");
  const raw = (data?.settings as Record<string, unknown> | null)?.['progress_report_expected_level'];
  const level = Number(raw);
  return Number.isFinite(level) ? { level, set: true } : { level: 70, set: false };
}
