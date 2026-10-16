export interface VisualCase {
  id: string;
  surface: string;
  state: string;
  view: string;
  skill?: string;
  section?: string;
  role?: string;
  empty?: boolean;
  error?: boolean;
  loading?: boolean;
  coverage?: string;
}
export const cases: VisualCase[];
export const viewports: Array<{ name: string; width: number; height: number }>;
export const browsers: string[];
export const modes: string[];
