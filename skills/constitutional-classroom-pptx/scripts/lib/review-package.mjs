/** Thin host adapter for PPT Master's visual-review dispatch and raw page reports.
 * This records provenance honestly; local records cannot prove a viewer's perception
 * or defend against an adversary forging every host record.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {verifyRenderEvidence} from './rendering.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=async p=>sha(await fs.readFile(p));
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const assert=(v,m)=>{if(!v)throw new Error(m);};
const text=v=>typeof v==='string'&&v.trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const write=async(p,v)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});};
const entry=async p=>({path:path.resolve(p),sha256:await digest(p)});
const resolve=(project,p)=>path.resolve(project,p);
const verifyFile=async e=>assert(e?.path&&e?.sha256&&await digest(e.path)===e.sha256,`审阅冻结文件已改变：${e?.path||'缺失'}`);

export function extractReviewPlan(spec,quote){
  // Select full upstream fields deterministically. A caller may confirm these
  // words but cannot pick a convenient substring (including out of a negation).
  const section=roman=>spec.match(new RegExp(`^## ${roman}\\.\\s[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,'m'))?.[1]?.trim()||'';
  const explicit=spec.match(/^- \*\*(?:Design target \/ references|设计目标)\*\*:\s*([^\n]+(?:\n(?!\s*$|\s*- \*\*|#{1,6}\s)[^\n]+)*)/mi)?.[1]?.trim()
    ||spec.match(/^#{2,6}\s+(?:Design Target(?:\s*\/\s*References)?|设计目标)\s*\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/mi)?.[1]?.trim();
  const intent=section('I'),layout=section('V');
  const goalRows=intent.split('\n').filter(line=>/^\|\s*(?:Communication Intent|Desired Audience Outcome|Core Message\s*\/\s*Ask\s*\/\s*Action)\s*\|/i.test(line)||/^-\s*\*\*(?:Communication Intent|Desired Audience Outcome|Core Message(?:\s*\/\s*Ask\s*\/\s*Action)?)\*\*:/i.test(line)).map(s=>s.trim());
  const direction=layout.match(/^###\s+Deck-wide Direction\s*\n([\s\S]*?)(?=^###\s|$(?![\s\S]))/mi)?.[1]?.trim()||layout;
  assert(explicit||(goalRows.length&&direction),'无显式目标时必须同时承接原版§I传播目标字段与§V设计方向；页数或边距不能单独充当目标');
  const criteria=explicit?[explicit]:[...goalRows,direction].filter(text);
  assert(criteria.length,'缺少原版§I目标字段、§V设计方向或既有设计目标段');
  const target=criteria.join('\n\n');
  assert(quote===undefined||quote===target,'设计目标必须完整承接既定目标；不得从原文或否定句截取弱子串');
  const outline=spec.match(/^## IX\.\s[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1];
  assert(outline,'缺少原版 design_spec §IX 逐页任务');
  const slides=[...outline.matchAll(/^#### Slide\s+(\d+)\b[^\n]*\n([\s\S]*?)(?=^#### Slide\s|$(?![\s\S]))/gm)].map(m=>({slide:Number(m[1]),specSection:m[0].trim()}));
  assert(slides.length,'§IX 必须有原版逐页 Slide 编号');
  return {target,criteria,slides};
}

export async function prepareReviewPack({project,skillDir,requestFile,outputDir,bindings,expectedStates,kind='final',officialReport,specFile=path.join(project,'design_spec.md'),lockFile=path.join(project,'spec_lock.md')}){
  const request=await read(requestFile),spec=await fs.readFile(specFile,'utf8'),plan=extractReviewPlan(spec,request.designTarget?.specQuote);
  assert(await digest(specFile)===bindings.designSpecHash&&await digest(lockFile)===bindings.specLockHash,'派发的设计纲/锁不属于当前制作记录');
  assert(request.schema==='course-review-request.v1','需要事实型 course-review-request.v1 请求');
  assert(text(request.authorContextId)&&text(request.reviewerContextId)&&request.authorContextId!==request.reviewerContextId,'作者与审阅者必须使用不同上下文；仅改姓名不构成独立审阅');
  if(request.designTarget)assert(request.designTarget.specQuote===plan.target&&same(request.designTarget.criteria,plan.criteria),'审阅准则必须完整承接程序提取的目标单元，不能用弱子串替代');
  assert(Array.isArray(request.referenceImages)&&request.referenceImages.length,'需要真实参照图片，只有作品名称不能派发审阅');
  const references=[];
  for(const r of request.referenceImages){
    assert(text(r.id)&&text(r.caption)&&!references.some(x=>x.id===r.id),'参照图片须有不重复id及说明');
    const e=await entry(resolve(project,r.path));assert(e.sha256===r.sha256,'参照图片哈希不符');
    const bytes=await fs.readFile(e.path);assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(0,2).equals(Buffer.from([255,216])),'参照必须为实际PNG/JPEG图片');
    references.push({...e,id:r.id,caption:r.caption});
  }
  assert(Array.isArray(request.states)&&request.states.length===expectedStates.length,'审阅请求须逐条给出全部有效状态的渲染凭据');
  const states=[],seen=new Set();
  for(const wanted of expectedStates){
    const id=`${wanted.slide}:${wanted.state}`,matches=request.states.filter(s=>s.slide===wanted.slide&&s.state===wanted.state);
    assert(matches.length===1&&!seen.has(id),`重复或缺失状态 ${id}`);seen.add(id);
    const s=matches[0],imagePath=resolve(project,s.imagePath),renderManifestPath=resolve(project,s.renderManifestPath);
    const checked=await verifyRenderEvidence({projectDir:project,manifestFile:renderManifestPath,manifestSha256:s.renderManifestHash,imageFile:imagePath,imageSha256:s.imageHash,sourceFile:wanted.renderSourcePath,sourceSha256:wanted.renderSourceHash,page:wanted.slide,kind:kind==='early'?'svg':'pptx'});
    assert(checked.pass,`状态 ${id} 的来源/页/图映射无效：${checked.errors.join('；')}`);
    const page=plan.slides.find(p=>p.slide===wanted.slide);assert(page,`§IX缺少第${wanted.slide}页`);
    states.push({...wanted,imagePath,imageHash:s.imageHash,renderManifestPath,renderManifestHash:s.renderManifestHash,canvas:checked.record?.canvas||{width:checked.record?.image?.width,height:checked.record?.image?.height},specSection:page.specSection});
  }
  const contextFiles=[await entry(specFile),await entry(lockFile)],styleFocus=[];
  if(request.stateReportPath)contextFiles.push(await entry(resolve(project,request.stateReportPath)));
  const contractFile=path.join(path.dirname(specFile),'course-project.json'),contract=await read(contractFile);
  contextFiles.push(await entry(contractFile));
  const materialSources=[];
  for(const source of contract.sources){const frozen=await entry(resolve(project,source.path));assert(frozen.sha256===source.sha256,`材料来源已变化：${source.id}`);materialSources.push({...frozen,id:source.id,kind:source.kind});contextFiles.push(frozen);}
  for(const state of states){
    const slide=contract.slides[state.slide-1];assert(slide,`课程契约缺少第${state.slide}页`);
    state.sourceParagraphs=slide.noteParagraphs||[];
    const note=path.join(path.dirname(specFile),'notes',`${slide.stem}.md`);
    if(await fs.access(note).then(()=>true,()=>false)){const frozen=await entry(note);state.noteFile=frozen;contextFiles.push(frozen);}
  }
  const templateDir=path.join(path.dirname(specFile),'templates');
  for(const name of await fs.readdir(templateDir).catch(()=>[])){
    if(!name.endsWith('.md'))continue;
    const file=path.join(templateDir,name),body=await fs.readFile(file,'utf8');contextFiles.push(await entry(file));
    if(/^design_spec\.style\..*\.md$/.test(name)){
      const focus=body.match(/^## VII\.\s*Review Focus\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1]?.trim();
      if(focus)styleFocus.push({path:file,excerpt:focus});
    }
  }
  const official=path.join(skillDir,'vendor/ppt-master/skills/ppt-master');
  const rubric=await entry(path.join(official,'references/visual-review.md'));
  const teachingReview=await entry(path.join(skillDir,'references/design-review.md'));
  if(officialReport)contextFiles.push(await entry(officialReport));
  const quality=officialReport?await read(officialReport):null;
  const pack={schema:'course-review-pack.v1',kind,createdAt:new Date().toISOString(),bindings,request:await entry(requestFile),authorContextId:request.authorContextId,reviewerContextId:request.reviewerContextId,designTarget:{specQuote:plan.target,criteria:plan.criteria},references,materialSources,contextFiles,styleFocus,rubric,teachingReview,carrierReceipt:quality?.carrier_receipt??null,pageCarrierReceipts:quality?.files?.map(f=>({file:f.file,receipt:f.info?.carrier_receipt??null}))||[],carrierReceiptNote:'原版收据为实际使用事实，计数不是图片配额；结合原稿、逐页任务与画面判断表达是否充分。',states,limitations:['本包只有冻结事实与原版审阅输入，没有通过、美感评分或观看声明。','上下文与宿主记录可检查一致性，不是防伪认证，也不能证明人或模型真的看懂图片。']};
  const file=path.join(outputDir,'review-pack.json');await write(file,pack);const receipt=await entry(file);
  const prompt=`你是独立视觉审阅者。当前审阅包：${file}\n包SHA256：${receipt.sha256}\n先完整读取包及其冻结文件，再实际查看全部 states 图片和 references 图片。按原版 rubric 审阅；§IX逐页任务、课程补充及Style Review Focus均为只读。不得降低设计目标，不得修改源文件，不得由代码生成通过结论。\n提交一个JSON原始报告：schema=course-raw-review.v1、reviewPackHash、reviewer={kind:agent,name,contextId:"${request.reviewerContextId}"}、reviewedAt、status(pass或fail)、unresolvedIssues、limitations、deckReview(continuity/hierarchy/compositionByJob/referenceComparison)、designTarget(status met/not_met, specQuote, criteria逐字取包内值, comparison, remainingGaps)。pages为所有有效slide/state，每项保留原版status(ok/needs_human/render_failed/prereq_failed)、findings数组、needs_human_items数组、design_intent_check={spec_says:该页§IX原文,render_delivers:true或false,note:实际观察}，并提供pageJob、relationships、realization、observations、carrierCheck(材料的视觉机会与实际承载，不按图片数判断)、referenceComparisons[{referenceId,observation}]、styleChecks[{path,observation,met}]。每项status只来自真实审阅，不预填；有缺陷如实失败。\n如无法在与作者隔离的新上下文工作，返回失败，不以另一姓名冒充独立。不要编造实际播放或教师认可。`;
  await fs.writeFile(path.join(outputDir,'review-prompt.md'),prompt+'\n每页末态填写完整carrierCheck、referenceComparisons、styleChecks；其余显隐状态实际检查当前显示与关系，可不重复整页美感比较。最后在宿主回复中明确你的上下文ID、原始报告绝对路径及其SHA256，供保存真实返回记录。\n',{flag:'wx'});
  await fs.writeFile(path.join(project,'validation',`current-${kind==='early'?'early-':''}review-pack.json`),JSON.stringify(receipt,null,2)+'\n');
  return{status:'REVIEW_INPUTS_FROZEN_NOT_REVIEWED',reviewPack:receipt,promptPath:path.join(outputDir,'review-prompt.md')};
}

export async function verifyReviewPack({project,packFile,packHash,bindings,expectedStates,kind}){
  assert(await digest(packFile)===packHash,'审阅包已改变');const pack=await read(packFile);
  assert(pack.schema==='course-review-pack.v1'&&pack.kind===kind,'审阅包版本或阶段不符');
  assert(same(pack.bindings,bindings),'审阅包不属于当前设计与成品');
  for(const e of [pack.request,pack.rubric,pack.teachingReview,...pack.contextFiles,...pack.references])await verifyFile(e);
  const spec=pack.contextFiles.find(e=>path.basename(e.path)==='design_spec.md');assert(spec,'审阅包缺少实际设计纲');
  const plan=extractReviewPlan(await fs.readFile(spec.path,'utf8'));
  assert(pack.designTarget.specQuote===plan.target&&same(pack.designTarget.criteria,plan.criteria),'旧包或审阅目标没有完整承接既定目标');
  assert(pack.states.length===expectedStates.length,'审阅包状态覆盖不符');
  const seen=new Set();
  for(const state of pack.states){
    const id=`${state.slide}:${state.state}`,wanted=expectedStates.find(s=>s.slide===state.slide&&s.state===state.state);assert(wanted&&!seen.has(id),`审阅包状态重复或不在计划 ${id}`);seen.add(id);
    assert(state.renderSourcePath===wanted.renderSourcePath&&state.renderSourceHash===wanted.renderSourceHash,'审阅包来源不属于当前状态');
    const check=await verifyRenderEvidence({projectDir:project,manifestFile:state.renderManifestPath,manifestSha256:state.renderManifestHash,imageFile:state.imagePath,imageSha256:state.imageHash,sourceFile:wanted.renderSourcePath,sourceSha256:wanted.renderSourceHash,page:wanted.slide,kind:kind==='early'?'svg':'pptx'});
    assert(check.pass,check.errors.join('；'));
  }
  return pack;
}

export async function importReview({project,rawFile,dispatchFile,kind='final'}){
  const pointer=await read(path.join(project,'validation',`current-${kind==='early'?'early-':''}review-pack.json`)),pack=await read(pointer.path);
  assert(await digest(pointer.path)===pointer.sha256,'准备包已改变');
  const raw=await read(rawFile),dispatch=await read(dispatchFile);
  const rawEntry=await entry(rawFile);
  await validateDispatch(dispatch,pack,pointer.sha256,rawEntry.sha256);assert(raw.schema==='course-raw-review.v1'&&raw.reviewPackHash===pointer.sha256,'原始审阅报告未绑定派发包');
  assert(raw.reviewer?.contextId===pack.reviewerContextId,'原始报告不属于被指派的独立上下文');
  const imported={schema:'course-design-review.v2',...pack.bindings,reviewPack: pointer,rawReport:rawEntry,dispatchRecord:await entry(dispatchFile)};
  const file=path.join(project,'validation',kind==='early'?'early-design-review.json':'design-review.json');
  // The wrapper has no aesthetic status; judgments remain in the immutable-by-hash raw report.
  await fs.writeFile(file,JSON.stringify(imported,null,2)+'\n');return{status:'IMPORTED_NOT_VERIFIED',reviewFile:file};
}

export async function validateDispatch(dispatch,pack,packHash,rawReportHash){
  assert(dispatch?.schema==='course-review-dispatch.v1'&&dispatch.reviewPackHash===packHash,'缺少绑定当前包的宿主指派记录');
  assert(text(dispatch.host)&&text(dispatch.method)&&text(dispatch.invocationId)&&Number.isFinite(Date.parse(dispatch.dispatchedAt)),'宿主指派记录缺少host/method/invocationId/时间');
  assert(dispatch.contextIsolation==='fresh'&&dispatch.authorContextId===pack.authorContextId&&dispatch.reviewerContextId===pack.reviewerContextId&&dispatch.reviewerContextId!==dispatch.authorContextId,'没有作者与审阅者隔离上下文的宿主记录；姓名不同不构成隔离');
  const evidence=dispatch.sourceEvidence;
  assert(evidence?.dispatch&&evidence?.response,'缺少宿主实际指派及返回的原始证据；只换上下文字符串不构成独立审阅');
  await verifyFile(evidence.dispatch);await verifyFile(evidence.response);
  const sent=await fs.readFile(evidence.dispatch.path,'utf8'),received=await fs.readFile(evidence.response.path,'utf8');
  assert(sent.includes(dispatch.reviewerContextId)&&sent.includes(dispatch.invocationId)&&sent.includes(packHash),'宿主原始指派记录未关联本次上下文、调用与派发包');
  assert(typeof rawReportHash==='string'&&received.includes(dispatch.reviewerContextId)&&received.includes(rawReportHash),'宿主原始返回记录未关联该审阅上下文与原报告哈希');
}

export async function loadReviewEvidence({project,reviewFile,bindings,expectedStates,kind}){
  const wrapper=await read(reviewFile);assert(wrapper.schema==='course-design-review.v2','旧版自填审阅不能沿用；请真实render、review-pack、独立审阅后review-import');
  for(const [k,v] of Object.entries(bindings))assert(wrapper[k]===v,`审阅${k}未绑定当前证据`);
  const pack=await verifyReviewPack({project,packFile:wrapper.reviewPack.path,packHash:wrapper.reviewPack.sha256,bindings,expectedStates,kind});
  await verifyFile(wrapper.rawReport);await verifyFile(wrapper.dispatchRecord);
  const raw=await read(wrapper.rawReport.path),dispatch=await read(wrapper.dispatchRecord.path);await validateDispatch(dispatch,pack,wrapper.reviewPack.sha256,wrapper.rawReport.sha256);
  assert(raw.schema==='course-raw-review.v1'&&raw.reviewPackHash===wrapper.reviewPack.sha256,'原始报告不属于当前指派包');
  return{review:raw,pack,wrapper};
}
