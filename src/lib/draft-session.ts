import type { Draft } from './article.ts';
export type DraftDocument = Pick<Draft,'title'|'summary'|'category'|'tags'|'slug'|'markdown'>;
type Saver = (document:DraftDocument,current:Draft|null,manual:boolean)=>Promise<Draft>;
export class DraftSession {
  current:Draft|null=null;
  document:DraftDocument;
  conflict=false;
  private generation=0;
  private editVersion=0;
  private savedEditVersion=0;
  private exportedEditVersion=-1;
  private inflight:Promise<void>|null=null;
  constructor(document:DraftDocument){this.document=structuredClone(document);}
  get dirty(){return this.editVersion!==this.savedEditVersion;}
  get unprotected(){return this.dirty && this.editVersion!==this.exportedEditVersion;}
  get saving(){return this.inflight!==null;}
  edit(document:DraftDocument){this.document=structuredClone(document);this.editVersion++;}
  load(draft:Draft|null,document:DraftDocument){this.generation++;this.current=draft;this.document=structuredClone(document);this.editVersion=0;this.savedEditVersion=0;this.exportedEditVersion=-1;this.conflict=false;}
  markExported(){this.exportedEditVersion=this.editVersion;}
  async settled(){await this.inflight;}
  async save(saver:Saver,manual=false):Promise<void>{
    if(this.conflict)throw new Error('存在版本冲突，请先导出并重新载入草稿。');
    if(this.inflight){await this.inflight;if(this.dirty)return this.save(saver,manual);return;}
    if(!this.dirty && this.current)return;
    const generation=this.generation,editVersion=this.editVersion;
    const document=structuredClone(this.document),current=this.current;
    const operation=(async()=>{
      try{
        const saved=await saver(document,current,manual);
        if(generation!==this.generation)return;
        this.current=saved;this.savedEditVersion=editVersion;
      }catch(error){
        if(generation===this.generation && error instanceof Error && error.name==='DraftConflictError')this.conflict=true;
        throw error;
      }
    })();
    this.inflight=operation;
    try{await operation;}finally{if(this.inflight===operation)this.inflight=null;}
  }
}
