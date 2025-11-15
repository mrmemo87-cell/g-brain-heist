import { ApiError } from './errors';
import type { NextApiRequest } from './types';

type Role = 'teacher' | 'student';

export interface AuthContext {
  userId: string;
  role: Role;
  classId?: string;
}

const normalize = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const parseContext = (req: NextApiRequest): AuthContext => {
  const userId = normalize(req.headers['x-brains-user-id'] ?? req.headers['x-user-id']);
  const role = normalize(req.headers['x-brains-user-role'] ?? req.headers['x-user-role']);
  const classId = normalize(req.headers['x-brains-class-id']);

  if (!userId || !role) {
    throw new ApiError('UNAUTHENTICATED', 'Missing authentication headers', 401);
  }

  if (role !== 'teacher' && role !== 'student') {
    throw new ApiError('INVALID_ROLE', 'Unsupported role provided', 403);
  }

  return { userId, role, classId: classId || undefined };
};

export const getAuthContext = (req: NextApiRequest): AuthContext => {
  return parseContext(req);
};

export const requireTeacher = (req: NextApiRequest): AuthContext => {
  const context = getAuthContext(req);
  if (context.role !== 'teacher') {
    throw new ApiError('FORBIDDEN', 'Teacher role required', 403);
  }
  return context;
};

export const requireStudent = (req: NextApiRequest): AuthContext => {
  const context = getAuthContext(req);
  if (context.role !== 'student') {
    throw new ApiError('FORBIDDEN', 'Student role required', 403);
  }
  return context;
};
