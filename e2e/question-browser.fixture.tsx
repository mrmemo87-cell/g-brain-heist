import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionBank from '../components/teacher/QuestionBank';
import { QuestionSelectionModal } from '../src/features/clanTerritory/components/QuestionSelectionModal';
import { supabase } from '../services/supabaseClient';
import '../src/index.css';
const dataset = Array.from({ length: 125 }, (_, index) => ({
  id: `00000000-0000-0000-0000-${String(index).padStart(12,'0')}`,
  subject: 'English', topic: index < 80 ? 'Alpha' : 'Beta', topic_name: index < 80 ? 'Alpha' : 'Beta',
  question_text: `Question ${index + 1}: choose the correct answer`, correct_answer: 'A',
  options: ['A','B','C','D'], question_type: 'multiple_choice', difficulty: 'easy', points: 10,
  created_at: new Date(Date.UTC(2026,9,4,0,0,0)-index*1000).toISOString(),
  pool_scope: 'global', content_origin: 'brain_heist', verification_status: 'verified', analytics_eligible: true,
  is_public: true, is_active: true, is_mine: false, eligible_grade_levels: [7],
}));
const requests: any[] = []; (window as any).__requests = requests;
(supabase.auth as any).getSession = async () => ({ data: { session: { user: { id: 'browser-fixture' } } } });
(supabase as any).rpc = async (name: string, args: any) => {
  requests.push({ name, args });
  const search = args?.p_search || args?.p_filters?.search || '';
  await new Promise((resolve) => setTimeout(resolve, search === 'slow' ? 1800 : 20));
  if (search === 'force-error') return { data: null, error: new Error('Fixture request failed') };
  const matching = dataset.filter((q) => !search || q.question_text.toLowerCase().includes(search.toLowerCase()) || q.topic.toLowerCase().includes(search.toLowerCase()));
  if (name.includes('facets') || name.includes('summary')) {
    return { data: ['Alpha','Beta'].map((topic) => ({ subject: 'English', topic, pool: 'brains-heist', count: matching.filter((q) => q.topic===topic).length, review_count:0 })).filter((row)=>row.count), error:null };
  }
  if (name.includes('question_browser')) {
    const f = args.p_filters;
    const rows = matching.filter((q) => (!f.topic || q.topic===f.topic) && (!f.pool || ['verified','brains-heist'].includes(f.pool)));
    const start=f.cursor ? rows.findIndex((q)=>q.id===f.cursor.id)+1 : 0;
    const page=rows.slice(start,start+f.limit), last=page.at(-1), hasMore=start+page.length<rows.length;
    return {data:{questions:page,metadata:[],hasMore,nextCursor:hasMore?{id:last!.id,createdAt:last!.created_at}:null},error:null};
  }
  return {data:{success:true,years:[],terms:[]},error:null};
};
function App() {
  const [battle,setBattle]=useState(false), [questions,setQuestions]=useState<any[]>([]), [result,setResult]=useState('');
  const merge=useCallback((rows:any[])=>setQuestions((current)=>[...new Map([...current,...rows].map((q)=>[q.id,q])).values()]),[]);
  return <><button onClick={()=>setBattle(true)}>Open battle picker</button><p id="result">{result}</p>
    <QuestionBank remote questions={questions} teacher={{id:'fixture'} as any} onQuestionsLoaded={merge} onUseSet={(ids)=>setResult(`Used ${ids.length} questions`)} />
    {battle?<QuestionSelectionModal onCancel={()=>setBattle(false)} onConfirm={(rows)=>{setResult(`Battle ${rows.length} questions`);setBattle(false);}}/>:null}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
