// services/adminService.ts
import { supabase } from './supabaseClient';
import { Profile } from '../types';

/**
 * Client-side check if user has admin role based on profile data.
 * This is for UI display only - always verify server-side for sensitive operations.
 */
export function isAdmin(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return profile.role === 'admin' || profile.role === 'superadmin';
}

/**
 * Server-verified superadmin check.
 * Never use client-side credentials.
 */
export async function isSuperadmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_is_superadmin');
  if (error) {
    console.warn('rpc_is_superadmin failed:', error.message);
    return false;
  }
  return Boolean(data);
}
