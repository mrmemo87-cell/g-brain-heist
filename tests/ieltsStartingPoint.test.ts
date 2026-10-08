import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyNextStep, parseStartingPoint, startingPointRoute, startingPointCompleted, type IeltsStartingPoint } from '../services/ieltsStartingPointService';
import type { IeltsStudentJourney } from '../services/ieltsJourneyService';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const journey = { assigned_practice: [], completed_practice: [], teacher_feedback: [] } as unknown as IeltsStudentJourney;
const data: IeltsStartingPoint = { student_name: 'Test learner', school_managed: true, speaking_available: true, confidence: 'low', band_estimate: null, readiness_available: false,
  catalog: ['listening','reading','writing'].map((s,i) => ({ title:s,code:`bh-${s}-screener-a`,status:'completed',attempt_id:id(i+10),assignment_id:id(i+20),exam_event_id:id(i+30),duration_minutes:20,starts_at:'2026-10-08T09:00:00Z' })),
  results: { listening: { attempt_id:id(10),occurred_at:'2026-10-08T09:00:00Z',conditions_need_review:false,raw_score:8,total:12 }, speaking: {attempt_id:id(40),occurred_at:'2026-10-08T09:00:00Z',conditions_need_review:false,status:'submitted',review:null} } };
test('parser rejects inferred bands, bad raw scores and unconfirmed statuses',()=>{
 assert.equal(parseStartingPoint(data).band_estimate,null);
 for (const change of [{band_estimate:6.5},{confidence:'high'},{readiness_available:true},{results:{listening:{...data.results.listening,raw_score:13}}},{results:{speaking:{...data.results.speaking,status:'unknown'}}}]) assert.throws(()=>parseStartingPoint({...data,...change}));
});
test('completed four checks is distinct from teacher review and band readiness',()=>{
 assert.equal(['listening','reading','writing','speaking'].filter(s=>startingPointCompleted(data,s as never)).length,4);
 assert.equal(journeyNextStep(data,journey).title,'Your teacher review is next');
 assert.equal(data.band_estimate,null);
});
test('active attempt recovery wins, points to the existing event, and never starts a duplicate',()=>{
 const active={...data,catalog:data.catalog.map(e=>({...e,status:e.code.includes('listening')?'in_progress' as const:e.status}))};
 assert.equal(journeyNextStep(active,journey).route,`/ielts/exam/${id(30)}`);
 assert.equal(journeyNextStep({...data,results:{...data.results,speaking:{...data.results.speaking!,status:'in_progress'}}},journey).route,`/ielts/speaking-pilot/${id(40)}`);
});
test('assigned task is actionable, missing checks guide discovery, unavailable evidence is not weakness',()=>{
 assert.equal(journeyNextStep(data,{...journey,assigned_practice:[{assignment_id:id(80),title:'Explain your example',status:'assigned'}]}).route,'/ielts/practice/assigned');
 const missing={...data,catalog:data.catalog.filter(e=>!e.code.includes('reading'))};
 assert.equal(journeyNextStep(missing,journey).route,'/ielts/reading-screener');
 assert.doesNotMatch(journeyNextStep(missing,journey).description,/weak|low score/i);
});
test('each saved skill links to its own record rather than a new attempt',()=>{
 assert.equal(startingPointRoute('listening',data.results.listening),`/ielts/screener-result/${id(10)}`);
 assert.equal(startingPointRoute('writing',{...data.results.listening!,attempt_id:id(12)}),`/ielts/writing-screener/reviews/${id(12)}`);
 assert.equal(startingPointRoute('speaking',data.results.speaking),`/ielts/speaking-pilot/${id(40)}`);
});
