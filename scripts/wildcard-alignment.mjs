/** Structural provenance checks only: does not read attachments or judge factual correctness. */
export function validateWildcardAlignment(input) {
 const errors=[],warnings=[];const text=v=>typeof v==='string'&&v.trim().length>0;
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,errors:['input must be an object'],warnings,review:'Requires teacher review and platform readback.'};
 if(input.version!==1)errors.push('version must equal 1');
 for(const field of ['grade','learningObjective','playerAction','stateChange','feedback','completion'])if(!text(input[field]))errors.push(`${field} is required`);
 const sources=new Map(),segments=new Map();
 if(!Array.isArray(input.sources)||!input.sources.length)errors.push('sources must be nonempty');
 else for(const [i,s] of input.sources.entries()){
  if(!s||typeof s!=='object'){errors.push(`sources[${i}] must be an object`);continue}
  for(const f of ['id','title','type','extractionStatus','attachmentStatus'])if(!text(s[f]))errors.push(`sources[${i}].${f} is required`);
  if(sources.has(s.id))errors.push(`duplicate source id ${s.id}`);else if(text(s.id))sources.set(s.id,s);
  if(!['file','link','teacher_text'].includes(s.type))errors.push(`sources[${i}].type is invalid`);
  if(!['verified','partial','unavailable'].includes(s.extractionStatus))errors.push(`sources[${i}].extractionStatus is invalid`);
  if(!['confirmed','not_attached','unknown','not_applicable'].includes(s.attachmentStatus))errors.push(`sources[${i}].attachmentStatus is invalid`);
  if(s.extractionStatus!=='verified')warnings.push(`source ${s.id}: extraction ${s.extractionStatus}; coverage is unverified`);
  if(s.type!=='teacher_text'&&s.attachmentStatus!=='confirmed')warnings.push(`source ${s.id}: platform attachment ${s.attachmentStatus}; do not claim it was read by Padlet`);
  if(!Array.isArray(s.segments)||!s.segments.length){errors.push(`sources[${i}].segments must be nonempty`);continue}
  for(const [j,seg] of s.segments.entries()){
   if(!seg||typeof seg!=='object'){errors.push(`sources[${i}].segments[${j}] must be an object`);continue}
   for(const f of ['id','locator','summary'])if(!text(seg[f]))errors.push(`sources[${i}].segments[${j}].${f} is required`);
   if(segments.has(seg.id))errors.push(`duplicate segment id ${seg.id}`);else if(text(seg.id))segments.set(seg.id,{source:s.id,segment:seg});
  }
 }
 if(!Array.isArray(input.gameElements)||!input.gameElements.length)errors.push('gameElements must be nonempty');
 else for(const [i,e] of input.gameElements.entries()){
  if(!e||typeof e!=='object'){errors.push(`gameElements[${i}] must be an object`);continue}
  for(const f of ['name','instruction','playerAction','feedback'])if(!text(e[f]))errors.push(`gameElements[${i}].${f} is required`);
  if(!Array.isArray(e.segmentIds)||!e.segmentIds.length)errors.push(`gameElements[${i}].segmentIds must be nonempty`);
  else for(const id of e.segmentIds)if(!segments.has(id))errors.push(`gameElements[${i}].segmentIds unknown id ${String(id)}`);
 }
 if(text(input.grade)&&text(input.learningObjective)&&(!text(input.playerAction)||!text(input.stateChange)))warnings.push('game loop incomplete');
 return {ok:errors.length===0,version:1,errors,warnings,review:'Structural links are not evidence that content is correct, attached, read, playable, or accessible. Teacher must review source and platform output.'};
}
