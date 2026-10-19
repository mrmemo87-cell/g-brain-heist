export const KUDOS = {clear:'Your explanation helped',helpful:'This practice was useful',thanks:'Thanks for this lesson'} as const;
export type KudosKey=keyof typeof KUDOS;
export type PracticeKind='drop'|'rescue'|'comeback';
export interface PracticeQuestion{id:string;question_text:string;options:string[];subject:string;difficulty:string;correct_answer?:string;explanation?:string;}
export interface PracticeRun{id:string;kind:PracticeKind;focus_name:string;questions:PracticeQuestion[];}
export interface PracticeResult{id:string;correct:number;total:number;previous_correct:number|null;questions:PracticeQuestion[];answers:string[];}
export interface RetentionSnapshot{enabled:boolean;period_start?:string;active_days?:number;online_assignments?:number;paper_assignments?:number;practice_runs?:number;lifetime_runs?:number;practice_questions?:number;recent_runs?:{id:string;focus_id:string|null;focus_name:string;correct:number;completed_at:string}[];vault?:{title:string;total:number;completed:number}|null;gratitude?:{assignment_id:string;title:string;teacher_name:string;sent:boolean}[];kudos_total?:number;kudos?:{message_key:KudosKey;count:number}[];}
export interface TrialControl{enabled:boolean;audience:'pilot'|'school'|'all';pilot_user_ids:string[];school_id:string|null;updated_at?:string;}
export interface RetentionMetrics{generated_at:string;cohort_definition:string;paper_completions:number;views:number;weekly:{role:string;week:string;users:number}[];cohorts:{role:string;first_week:string;users:number;week_one:number;week_four:number;week_one_mature:boolean;week_four_mature:boolean}[];}
const themes=[{name:'Plot Twist',line:'Five questions. One unexpected comeback.',icon:'✦'},{name:'Detective Mode',line:'Spot the detail. Crack the answer.',icon:'◎'},{name:'Boss Round',line:'A small challenge. A satisfying finish.',icon:'◇'},{name:'Main Character',line:'Your progress gets the spotlight.',icon:'↗'}];
export function weeklyTheme(now=new Date()){const day=Math.floor((now.getTime()+21600000)/86400000);return themes[((Math.floor((day+3)/7)%4)+4)%4];}
export function vaultPercent(v:RetentionSnapshot['vault']){return v&&v.total>0?Math.min(100,Math.max(0,Math.round(v.completed/v.total*100))):0;}
export const IDENTITIES=[{id:'rookie',title:'Fresh Perspective',icon:'✦',runs:0,tone:'cyan'},{id:'detective',title:'Detail Detective',icon:'◎',runs:1,tone:'violet'},{id:'comeback',title:'Comeback Specialist',icon:'↗',runs:3,tone:'pink'},{id:'steady',title:'Steady Operator',icon:'◇',runs:7,tone:'gold'}] as const;
export function trialError(error:unknown){const message=typeof error==='object'&&error&&'message'in error?String(error.message):'';if(/TRIAL_PAUSED/.test(message))return 'The trial is paused. Your normal Brains Heist tools are still available.';if(/DAILY_LIMIT/.test(message))return 'You have finished today’s three practice rounds. Come back tomorrow.';if(/FOCUS_NOT_READY/.test(message))return 'Not enough recent skill evidence for a focused rescue yet. Try the Weekly Drop.';if(/BASELINE_REQUIRED/.test(message))return 'Finish a Weekly Drop first, then try different questions in a comeback.';if(/POOL_NOT_READY/.test(message))return 'Five suitable verified questions are not available for this round yet. Try another option.';if(/GRADE_REQUIRED/.test(message))return 'Your school grade needs to be set before selecting suitable questions.';if(/RUN_EXPIRED/.test(message))return 'This round expired. Close it and start a fresh round.';return 'We could not save that just now. Please try again. Your normal tools are still available.';}

/** Superadmin-only, aggregated source-of-truth retention evidence. Never include student PII. */
export interface RetentionEvidence {
  generated_at: string;
  timezone: string;
  window_days: number;
  cohort_definition: string;
  disclaimer: string;
  summary: {
    student_users_28d: number;
    teacher_users_28d: number;
    online_completions_28d: number;
    online_students_28d: number;
    teacher_assignments_28d: number;
    teachers_creating_28d: number;
    teacher_paper_captures_28d: number;
    teacher_interventions_28d: number;
    quest_completions_28d: number;
    quest_users_28d: number;
    trial_practice_completions_28d: number;
    trial_practice_users_28d: number;
    student_repeat_2weeks_28d: number;
    active_schools_28d: number;
    paper_completions_28d: number;
    trial_view_user_days_28d: number;
  };
  weekly: Array<{
    week: string;
    actor_role: 'student' | 'teacher';
    users: number;
    actions: number;
    online_assignments: number;
    quests: number;
    trial_practice: number;
    teacher_assignments: number;
    teacher_paper_captures: number;
    teacher_interventions: number;
    is_partial: boolean;
  }>;
  cohorts: Array<{
    first_week: string;
    actor_role: 'student' | 'teacher';
    users: number;
    week_one: number;
    week_four: number;
    week_one_mature: boolean;
    week_four_mature: boolean;
  }>;
  quality: {
    excluded_username_flags: number;
    excluded_named_test_schools: number;
    exclusion_rule: string;
  };
}
