// Admin Authentication Service
// Hardcoded admin credentials and utility functions

export const ADMIN_CREDENTIALS = {
  email: 'sobbi@bh.com',  // Use this EMAIL to LOGIN
  username: 'Mr. Sobbi',              // Display name after login
  password: '123Memoo@'
};

export const isAdmin = (profile: { username: string; role?: string }): boolean => {
  return profile.username === ADMIN_CREDENTIALS.username && profile.role === 'admin';
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
