import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const sources=['supabase/functions/_shared/publication.ts','supabase/functions/_shared/publishing-service.ts','supabase/functions/blog-publish/index.ts'];
const modules=await Promise.all(sources.map(async file=>(await readFile(path.join(root,file),'utf8')).replace(/^import .*?;\r?\n/gm,'')));
const target=path.join(root,'.local/publisher/blog-publish.ts');await mkdir(path.dirname(target),{recursive:true});
await writeFile(target,"// Generated from tracked sources; contains no credentials.\n// 由项目源文件生成，不包含任何密钥。\nimport {createClient} from 'npm:@supabase/supabase-js@2.118.0';\n"+modules.join('\n\n'),'utf8');
console.log('Dashboard deployment source: '+target);
