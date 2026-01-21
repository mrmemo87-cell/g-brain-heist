// Admin Authentication Service
// Hardcoded admin credentials and utility functions

export const ADMIN_CREDENTIALS = {
  email: 'sobbi@bh.com',  // Use this EMAIL to LOGIN
  username: 'Mr. Sobbi',              // Display name after login
  password: '123Memoo@'
};

export const isAdmin = (
  profile?: { username?: string | null; role?: string | null; is_admin?: boolean | null } | null
): boolean => {
  const username = profile?.username?.trim();
  if (!username) {
    return false;
  }

  const normalizedUsername = username.toLowerCase();
  const adminUsername = ADMIN_CREDENTIALS.username.toLowerCase();

  return normalizedUsername === adminUsername || profile?.is_admin === true || profile?.role === 'admin';
};

export const isAdminUsername = (username: string): boolean => {
  return username === ADMIN_CREDENTIALS.username;
};

export const authenticateAdmin = (username: string, password: string): boolean => {
  return username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password;
};

// Admin permissions
export const AdminPermissions = {
  MANAGE_USERS: 'manage_users',
  MANAGE_GAME: 'manage_game',
  MANAGE_CLANS: 'manage_clans',
  VIEW_ANALYTICS: 'view_analytics',
  SYSTEM_CONTROL: 'system_control',
  GOD_MODE: 'god_mode' // Ultimate power
} as const;

export type AdminPermission = typeof AdminPermissions[keyof typeof AdminPermissions];
