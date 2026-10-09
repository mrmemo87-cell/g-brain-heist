import { useEffect, useState } from 'react';
import { teacherMaterialUsage, type MaterialUsage } from '../../../services/ieltsTeacherPracticeService';
export function useIeltsMaterialUsage(school: string | undefined, items: {type:string;id:string}[], recipient: {student?:string;classId?:string}, revision=0) {
  const payload=JSON.stringify(items), student=recipient.student, classId=recipient.classId;
  const [data,setData]=useState<MaterialUsage[]|null>(null), [error,setError]=useState(''), [loading,setLoading]=useState(false), [retry,setRetry]=useState(0);
  // Bind the result to the exact request scope, including before the effect runs.
  const key=JSON.stringify([school,payload,student,classId,revision,retry]);
  const [loadedKey,setLoadedKey]=useState('');
  useEffect(()=>{
    let active=true;setData(null);setError('');setLoadedKey('');
    if(!school || (!student&&!classId) || payload==='[]'){setLoading(false);return;}
    setLoading(true);
    teacherMaterialUsage(school,JSON.parse(payload),{student,classId}).then(d=>{if(active){setData(d);setLoadedKey(key);}})
      .catch(()=>{if(active){setError('Previous assignments could not be checked. Retry before assigning this material.');setLoadedKey(key);}})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[school,payload,student,classId,revision,retry,key]);
  useEffect(() => {
    if (!school || (!student && !classId) || payload==='[]') return;
    const refresh=()=>setRetry(n=>n+1);
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  }, [school,student,classId,payload]);
  return {data:loadedKey===key?data:null,error:loadedKey===key?error:'',loading:loadedKey!==key||loading,retry:()=>setRetry(n=>n+1)};
}
