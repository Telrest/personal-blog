import {authorAccount,backend,backendConfigured,signIn} from './cloud-drafts';
import type {VisitorState} from './auth-navigation';
export type VisitorAccount={state:VisitorState;userId:string|null};
let account:VisitorAccount={state:'pending',userId:null},started=false,generation=0;
const listeners=new Set<(value:VisitorAccount)=>void>();
function emit(value:VisitorAccount){account=value;for(const listener of listeners)listener(value);}
async function refresh(){const ticket=++generation;if(!backendConfigured){emit({state:'error',userId:null});return;}try{const result=await authorAccount();if(ticket!==generation)return;emit({state:result.user?(result.owner?'author':'member'):'guest',userId:result.user?.id||null});}catch{if(ticket===generation)emit({state:'error',userId:null});}}
export function watchVisitor(listener:(value:VisitorAccount)=>void){listeners.add(listener);listener(account);if(!started){started=true;if(backendConfigured)backend().auth.onAuthStateChange(()=>{setTimeout(()=>void refresh(),0);});void refresh();}return ()=>{listeners.delete(listener);};}
export async function loginVisitor(returnTo=location.pathname+location.search+location.hash){await signIn(returnTo);}
