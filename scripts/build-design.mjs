import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'lab-src','design');
const output=path.resolve(root,'public','lab','design');
const expected=path.join(root,'public','lab','design');
const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
if(pkg.name!=='the-secret-of-design'||output!==expected||!output.startsWith(path.join(root,'public')+path.sep))throw Error('Unexpected experiment output directory.');
const result=process.platform==='win32'?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/c','npm run build'],{cwd:source,stdio:'inherit'}):spawnSync('npm',['run','build'],{cwd:source,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
const built=path.join(source,'dist');
if(!fs.existsSync(path.join(built,'index.html')))throw Error('Experiment build has no index.html; existing public assets kept.');
// Only replace this verified generated bundle. Never touch the source or blog content.
// 仅替换已核对路径的实验构建产物，不触碰源文件和博客内容。
fs.rmSync(output,{recursive:true,force:true});
fs.cpSync(built,output,{recursive:true});
console.log('Design experiment built and synced to public/lab/design.');
