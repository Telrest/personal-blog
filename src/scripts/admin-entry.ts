import {backendConfigured,authorAccount,backend} from '../lib/cloud-drafts';
import {safeReturnPath} from '../lib/auth-navigation';
import '../styles/site-auth.css';
const base=import.meta.env.BASE_URL;
async function enter(){
  let pending=false,target=base;try{pending=sessionStorage.getItem('blog-login-pending')==='1';target=safeReturnPath(sessionStorage.getItem('blog-login-return'),location.origin,base);}catch{}
  const finish=(ok:boolean)=>{try{sessionStorage.removeItem('blog-login-pending');sessionStorage.removeItem('blog-login-return');sessionStorage.setItem('blog-login-result',ok?'success':'error');}catch{}location.replace(target);};
  try{
    if(!backendConfigured)throw Error('Unavailable');
    const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
    if(query.has('error')||hash.has('error'))throw Error('OAuth failed');
    const account=await authorAccount();
    if(pending){finish(Boolean(account.user));return;}
    if(!account.user||!account.owner){location.replace(base);return;}
    document.getElementById('admin-gate')!.hidden=true;
    document.getElementById('author-workspace')!.hidden=false;
    await import('./writing');
    backend().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){document.getElementById('author-workspace')!.hidden=true;location.replace(base);}});
  }catch{if(pending)finish(false);else location.replace(base);}
}
void enter();
