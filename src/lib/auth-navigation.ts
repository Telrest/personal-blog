// Only allow return destinations inside this blog. / 只允许返回博客内的页面。
export function safeReturnPath(value:string|null,origin:string,base:string):string {
  if(!value)return base;
  try {const url=new URL(value,origin);if(url.origin!==origin||!url.pathname.startsWith(base)||url.pathname===base+'admin/')return base;return url.pathname+url.search+url.hash;}catch{return base;}
}
export type VisitorState='pending'|'guest'|'member'|'author'|'error';
export function entryState(state:VisitorState){return {login:state==='guest'||state==='error',writing:state==='author',message:state==='member'?'登录成功，可以评论哦~':state==='error'?'登录失败，可以再次尝试':''};}
