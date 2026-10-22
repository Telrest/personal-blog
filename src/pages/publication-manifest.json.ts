import {getPublishedPosts} from '../lib/posts';
export async function GET(){const posts=await getPublishedPosts();return new Response(JSON.stringify({format:1,articles:posts.map(p=>({id:p.id,slug:p.slug,revision_id:p.revision_id}))}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache'}});}
