// services/adminService.ts
import { supabase } from './supabaseClient';

/**
 * Server-verified superadmin check.
 * Never use client-side credentials.
 */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_is_superadmin');
  if (error) {
    console.warn('rpc_is_superadmin failed:', error.message);
    return false;
  }
  return Boolean(data);
}
