import { supabase } from './supabaseClient';

export interface PhysicsAssessmentComponent {
  ao: string;
  component: string;
  itemCount: number;
  correctCount: number;
  independentFreshCount: number;
  independentFreshCorrectCount: number;
  practiceOrRepeatedCount: number;
  distinctQuestions: number;
  distinctAssignments: number;
  studentsWithIndependentEvidence: number;
}
export interface PhysicsAssessmentBreakdown {
  success: true;
  programmeCode: string;
  sourceVersion: string;
  registryPhase?: 'upper_secondary' | null;
  programmeConfigured?: boolean;
  components: PhysicsAssessmentComponent[];
  disclosure: string;
}
export async function fetchPhysicsAssessmentBreakdown(schoolId: string, groupId: string): Promise<PhysicsAssessmentBreakdown> {
  const { data, error } = await supabase.rpc('rpc_teacher_physics_assessment_breakdown', {
    p_school_id: schoolId, p_group_id: groupId,
  });
  if (error) throw error;
  return data as PhysicsAssessmentBreakdown;
}
