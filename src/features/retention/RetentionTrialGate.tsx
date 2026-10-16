import React,{useEffect,useRef,useState}from 'react';
import{trialStatus}from '../../../services/retentionTrialService';
const hiddenKey=(id:string)=>`bh:retention-trial:hidden:v1:${id}`;
function hidden(id:string){try{return localStorage.getItem(hiddenKey(id))==='1';}catch{return false;}}
export function hideRetentionTrial(id:string){try{localStorage.setItem(hiddenKey(id),'1');}catch{/* Optional preference */}window.dispatchEvent(new CustomEvent('bh:retention-trial:visibility',{detail:{userId:id,hidden:true}}));}
class Boundary extends React.Component<{children:React.ReactNode;fallback:React.ReactNode},{failed:boolean}>{override state={failed:false};static getDerivedStateFromError(){return{failed:true};}override render(){return this.state.failed?this.props.fallback:this.props.children;}}
export default function RetentionTrialGate({userId,fallback,children}:{userId:string;fallback?:React.ReactNode;children:React.ReactNode}){
 const[isHidden,setHidden]=useState(()=>hidden(userId));const[status,setStatus]=useState<{userId:string;enabled:boolean}|null>(null);const last=useRef(0);
 useEffect(()=>{let active=true;let checking=false;setStatus(null);setHidden(hidden(userId));last.current=0;
 const check=async()=>{if(checking||document.visibilityState==='hidden'||Date.now()-last.current<30000)return;checking=true;last.current=Date.now();try{const result=await trialStatus();if(active)setStatus({userId,enabled:result.enabled===true});}catch{if(active)setStatus(null);}finally{checking=false;}};
 const visibility=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.userId===userId)setHidden(detail.hidden);if(!detail?.userId){last.current=0;void check();}};const storage=(event:StorageEvent)=>{if(event.key===hiddenKey(userId))setHidden(hidden(userId));};void check();window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);window.addEventListener('bh:retention-trial:visibility',visibility);window.addEventListener('storage',storage);
 return()=>{active=false;window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);window.removeEventListener('bh:retention-trial:visibility',visibility);window.removeEventListener('storage',storage);};},[userId]);
 if(status?.userId!==userId||!status.enabled||isHidden)return <>{fallback}{status?.userId===userId&&status.enabled&&isHidden?<button type="button" className="retention-restore rounded-lg border px-3 py-2 text-xs" onClick={()=>{try{localStorage.removeItem(hiddenKey(userId));}catch{}setHidden(false);}}>Show learning trial</button>:null}</>;
 return <Boundary key={userId} fallback={fallback}><React.Suspense fallback={fallback}>{children}</React.Suspense></Boundary>;
}
