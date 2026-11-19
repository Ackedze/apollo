import type {MutationControl} from './findingAction';
const {validTextReplacements}=require('../text-review-model');

export type TextReplacement={focusActionId:string;before:string;after:string};
export type CapturedTextTarget={nodeId:string;text:string};

function textState(node:TextNode):string{
 const state:Record<string,unknown>={parentId:node.parent?.id,removed:node.removed};
 for(const field of ['characters','autoRename','componentPropertyReferences','fontName','fontSize','textStyleId','fills','fillStyleId','boundVariables','letterSpacing','lineHeight','textCase','textDecoration','textAutoResize','textAlignHorizontal','textAlignVertical','paragraphIndent','paragraphSpacing','listSpacing','hyperlink','width','height'])state[field]=(node as any)[field];
 state.segments=node.characters.length?node.getStyledTextSegments(['fontName','fontSize','lineHeight','letterSpacing','textStyleId','fills','fillStyleId','openTypeFeatures']):[];
 return JSON.stringify(state,(_key,value)=>typeof value==='symbol'?'figma.mixed':value);
}
export type TextEdit={start:number;end:number;text:string};
export function planTextEdits(before:string,after:string):TextEdit[]{
 let start=0,oldEnd=before.length,newEnd=after.length;
 while(start<oldEnd&&start<newEnd&&before[start]===after[start])start++;
 if(start>0&&/[\ud800-\udbff]/.test(before[start-1])&&/[\udc00-\udfff]/.test(before[start]||''))start--;
 while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
 if(oldEnd<before.length&&/[\udc00-\udfff]/.test(before[oldEnd])&&/[\ud800-\udbff]/.test(before[oldEnd-1]||'')){oldEnd++;newEnd++;}
 if(start===oldEnd||start===newEnd)return before===after?[]:[{start,end:oldEnd,text:after.slice(start,newEnd)}];
 const a=Array.from(before.slice(start,oldEnd)),b=Array.from(after.slice(start,newEnd));
 const frontier=new Map([[1,0]]),trace:Array<Map<number,number>>=[];let visits=0,states=0;
 // Bound diff work before any native writes, including adversarial long replacements.
 for(let distance=0;distance<=a.length+b.length;distance++){
  states+=frontier.size;if(states>250000)throw Error('AUDIT_TEXT_DIFF_TOO_COMPLEX');
  trace.push(new Map(frontier));
  for(let diagonal=-distance;diagonal<=distance;diagonal+=2){
   if(++visits>2000000)throw Error('AUDIT_TEXT_DIFF_TOO_COMPLEX');
   let x=diagonal===-distance||(diagonal!==distance&&(frontier.get(diagonal-1)??-Infinity)<(frontier.get(diagonal+1)??-Infinity))?(frontier.get(diagonal+1)??0):(frontier.get(diagonal-1)??0)+1;
   let y=x-diagonal;
   while(x<a.length&&y<b.length&&a[x]===b[y]){x++;y++;if(++visits>2000000)throw Error('AUDIT_TEXT_DIFF_TOO_COMPLEX');}
   frontier.set(diagonal,x);
   if(x<a.length||y<b.length)continue;
   const operations:Array<{index:number;length:number;text:string}>=[];
   for(let d=trace.length-1;d>=0;d--){
    const previous=trace[d],k=x-y;
    const previousK=k===-d||(k!==d&&(previous.get(k-1)??-Infinity)<(previous.get(k+1)??-Infinity))?k+1:k-1;
    const previousX=previous.get(previousK)??0,previousY=previousX-previousK;
    while(x>previousX&&y>previousY){x--;y--;}
    if(d===0)break;
    if(x===previousX){y--;operations.push({index:x,length:0,text:b[y]});}
    else{x--;operations.push({index:x,length:a[x].length,text:''});}
   }
   const edits:TextEdit[]=[];let index=0,offset=start;
   for(const operation of operations.reverse()){
    while(index<operation.index)offset+=a[index++].length;
    const last=edits[edits.length-1],end=offset+operation.length;
    if(last&&offset<=last.end){last.end=Math.max(last.end,end);last.text+=operation.text;}
    else edits.push({start:offset,end,text:operation.text});
   }
   return edits;
  }
 }
 throw Error('AUDIT_TEXT_DIFF_TOO_COMPLEX');
}
function applyTextEdits(node:TextNode,edits:TextEdit[],mutation:MutationControl){
 // Work backwards so earlier ranges and all unchanged styled text retain their indices.
 for(let index=edits.length-1;index>=0;index--){
  mutation.assertCurrent();
  const edit=edits[index];
  if(edit.text)node.insertCharacters(edit.start,edit.text,edit.start===0?'AFTER':'BEFORE');
  if(edit.end>edit.start){mutation.assertCurrent();node.deleteCharacters(edit.start+edit.text.length,edit.end+edit.text.length);}
 }
}
export async function replaceCapturedTexts(
 changes:TextReplacement[],targets:ReadonlyMap<string,CapturedTextTarget>,
 resolve:(nodeId:string)=>Promise<SceneNode>,mutation:MutationControl,
){
 if(!mutation||typeof mutation.assertCurrent!=='function'||typeof mutation.beforeWrite!=='function')throw Error('AUDIT_OBSERVER_UNAVAILABLE');
 if(!validTextReplacements(changes))throw Error('AUDIT_TEXT_VALUE_INVALID');
 const prepared:Array<{node:TextNode;before:string;after:string;state:string;edits:TextEdit[]}>=[];
 const fonts=new Map<string,FontName>();
 for(const change of changes){
  mutation.assertCurrent();
  const target=targets.get(change.focusActionId);
  if(!target||target.text!==change.before)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
  const node=await resolve(target.nodeId);mutation.assertCurrent();
  if(node.type!=='TEXT'||node.removed||node.characters!==change.before)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
  if(change.before===change.after)continue;
  if(node.hasMissingFont)throw Error('AUDIT_TEXT_FONT_UNAVAILABLE');
  const names=node.characters.length?node.getRangeAllFontNames(0,node.characters.length):node.fontName!==figma.mixed?[node.fontName]:[];
  if(!names.length)throw Error('AUDIT_TEXT_FONT_UNAVAILABLE');
  for(const font of names)fonts.set(JSON.stringify(font),font);
  prepared.push({node,before:change.before,after:change.after,state:textState(node),edits:planTextEdits(change.before,change.after)});
 }
 if(!prepared.length)throw Error('AUDIT_ACTION_UNAVAILABLE');
 try{await Promise.all(Array.from(fonts.values(),font=>figma.loadFontAsync(font)));}
 catch{mutation.assertCurrent();throw Error('AUDIT_TEXT_FONT_UNAVAILABLE');}
 await mutation.verifyBeforeWrite?.();mutation.assertCurrent();
 // Recheck every target after all asynchronous work and before the first write.
 for(const item of prepared){
  if(item.node.removed||textState(item.node)!==item.state)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
 }
 const replaced=[];
 for(const item of prepared){
  try{
   mutation.assertCurrent();
   if(item.node.removed||textState(item.node)!==item.state)throw Error('AUDIT_ACTION_SOURCE_CHANGED');
   mutation.beforeWrite();
   applyTextEdits(item.node,item.edits,mutation);
   if(item.node.characters!==item.after)throw Error('AUDIT_TEXT_UNCONFIRMED');
   replaced.push({nodeId:item.node.id,text:item.after});
  }catch(error){throw Object.assign(error as Error,{textReplacements:replaced,failedTextNodeId:item.node.id});}
 }
 return {textReplacements:replaced,message:'Заменено текстовых слоёв: '+replaced.length+'.'};
}
