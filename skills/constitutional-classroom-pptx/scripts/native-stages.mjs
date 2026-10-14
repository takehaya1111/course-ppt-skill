/** Thin stage/evidence adapters around the unchanged official PPT Master tools. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import xmljs from 'xml-js';
import {evaluateReviewEvidence} from './lib/review-evidence.mjs';

const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const exists=async p=>fs.access(p).then(()=>true,()=>false);
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const digest=async p=>hash(await fs.readFile(p));
const write=async(p,value,exclusive=true)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,JSON.stringify(value,null,2)+'\n',exclusive?{flag:'wx'}:{});};
const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const forward=p=>p.split(path.sep).join('/');
const fileEntry=async(project,relative)=>({path:forward(relative),sha256:await exists(path.join(project,relative))?await digest(path.join(project,relative)):null});
const record=async(project,name)=>{const pointer=await read(path.join(project,'validation',`current-${name}.json`));assert(await digest(pointer.file)===pointer.sha256,`${name}记录已改变`);return{...pointer,value:await read(pointer.file)};};
const point=async(project,name,file)=>write(path.join(project,'validation',`current-${name}.json`),{file,sha256:await digest(file)},false);
const requireNonempty=async p=>assert((await fs.readFile(p,'utf8')).trim(),`设计文件为空：${p}`);

async function authored(project){return(await fs.readdir(path.join(project,'svg_output')).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e))).filter(n=>n.endsWith('.svg')).sort().map(n=>n.slice(0,-4));}
async function treeFiles(project,relative){
  if(!await exists(path.join(project,relative)))return[];
  const entries=await fs.readdir(path.join(project,relative),{withFileTypes:true}),out=[];
  for(const item of entries.sort((a,b)=>a.name.localeCompare(b.name))){const rel=path.join(relative,item.name);assert(!item.isSymbolicLink(),`制作输入不接受链接：${rel}`);if(item.isDirectory())out.push(...await treeFiles(project,rel));else if(item.isFile())out.push(rel);}
  return out;
}
async function actualAssetFiles(project,slides){
  const files=new Set();
  for(const s of slides){const svg=path.join(project,'svg_output',`${s.stem}.svg`);if(!await exists(svg))continue;
    const dom=xmljs.xml2js(await fs.readFile(svg,'utf8'),{compact:false}),walk=n=>{
      if(n.name==='image'){const href=n.attributes?.href||n.attributes?.['xlink:href'];if(href&&!/^data:/i.test(href)){
        const rel=path.relative(project,path.resolve(path.dirname(svg),href));assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'实际图片引用越过工程');files.add(forward(rel));
      }}for(const child of n.elements||[])walk(child);
    };walk(dom);
  }return[...files].sort();
}
export async function collectProductionInputs(project,contract){
  const ordered=[...contract.slides.flatMap(s=>[`svg_output/${s.stem}.svg`,`notes/${s.stem}.md`]),
    'design_spec.md','spec_lock.md','course-project.json','animations.json','notes/total.md','metadata.json','revision-scope.json',
    ...contract.sources.map(s=>s.path),...contract.assets.map(a=>a.path),...await actualAssetFiles(project,contract.slides),...await treeFiles(project,'templates')];
  const files=await Promise.all([...new Set(ordered)].map(p=>fileEntry(project,p)));
  return{schema:'native-production-inputs.v1',orderedSlides:contract.slides.map(s=>s.stem),files,sha256:hash(JSON.stringify(files))};
}
async function stageContext(project,contract){
  for(const f of ['design_spec.md','spec_lock.md'])await requireNonempty(path.join(project,f));
  const lockText=await fs.readFile(path.join(project,'spec_lock.md'),'utf8'),typography=lockText.match(/^##\s+typography\s*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im)?.[1]||lockText;
  const context={orderedSlides:contract.slides.map(s=>s.stem),specLockHash:await digest(path.join(project,'spec_lock.md')),sources:contract.sources.map(s=>({id:s.id,sha256:s.sha256.toLowerCase()})),assets:contract.assets.map(a=>({id:a.id,sha256:a.sha256.toLowerCase(),slides:a.slides}))};
  return{...context,sha256:hash(JSON.stringify(context)),typographyHash:hash(typography),designSpecHash:await digest(path.join(project,'design_spec.md')),contractHash:await digest(path.join(project,'course-project.json'))};
}
async function currentPreparation(project,contract){
  const p=await record(project,'prepare'),now=await stageContext(project,contract);
  assert(p.value.context.sha256===now.sha256,'页序/范围、冻结来源、素材或整套风格已变化；请重新prepare，必要时重新前5页校准');
  assert(await digest(p.value.calibration.file)===p.value.calibration.sha256,'字体校准记录已改变');
  if(p.value.mode==='revision'){
    assert(await digest(p.value.baseline.path)===p.value.baseline.sha256,'修订基线PPTX已改变');
    assert(await digest(path.join(project,'revision-scope.json'))===p.value.revisionScopeHash,'修订范围已变化，请重新prepare --revision-of绑定真实范围');
    for(const f of p.value.baseline.evidence)assert(await digest(f.path)===f.sha256,'修订基线的旧设计或实际检查记录已改变');
  }
  return p;
}
async function hashesForReview(review,expected){
  const files=[...new Set([...(review?.pages||[]).map(p=>p.imagePath),...expected.map(p=>p.renderSourcePath)])].filter(p=>typeof p==='string');
  return Object.fromEntries(await Promise.all(files.map(async p=>[p,await exists(p)?await digest(p):null])));
}
async function evaluate(project,file,bindings,expected,kind){
  const review=await read(file),result=evaluateReviewEvidence({review,bindings,expectedStates:expected,fileHashes:await hashesForReview(review,expected),kind});
  assert(result.pass,result.errors.join('；'));return{...result,reviewFile:file,reviewHash:await digest(file)};
}
function earlyExpected(early){return early.pages.map((p,i)=>({slide:i+1,state:0,renderSourcePath:p.path,renderSourceHash:p.sha256}));}

export async function assertBuildStages(project,contract){
  const preparation=await currentPreparation(project,contract);
  if(preparation.value.mode==='revision'||contract.slides.length<=6)return{preparation:{file:preparation.file,sha256:preparation.sha256},early:'NOT_REQUIRED',mode:preparation.value.mode};
  const early=await record(project,'early');
  assert(early.value.status==='EARLY_TECHNICAL_PASS'&&early.value.preparationHash===preparation.sha256,'缺少当前准备版本的按时前5页关卡');
  assert(await digest(early.value.officialReport.file)===early.value.officialReport.sha256,'官方early检查记录已改变');
  for(const file of early.value.snapshotFiles||[])assert(await digest(file.path)===file.sha256,'早期作者稿/素材快照已改变');
  const bindings={earlyRecordHash:early.sha256,designSpecHash:early.value.designSpecHash,specLockHash:early.value.specLockHash};
  // Historical source snapshots are immutable; final SVG edits do not rewrite early history.
  const reviewed=await evaluate(project,path.join(project,'validation/early-design-review.json'),bindings,earlyExpected(early.value),'early');
  const receipt=await record(project,'early-review');
  assert(receipt.value.status==='EARLY_REVIEWED'&&receipt.value.earlyRecordHash===early.sha256&&receipt.value.preparationHash===preparation.sha256&&receipt.value.reviewHash===reviewed.reviewHash,'前5页独立设计回看尚未在只有5页时收录；请按实际阶段完成gate early，不能事后补造');
  return{preparation:{file:preparation.file,sha256:preparation.sha256},early:{file:early.file,sha256:early.sha256,reviewed,receipt:{file:receipt.file,sha256:receipt.sha256}},mode:'new'};
}

async function revisionBaseline(runtime,project,c,baseline,scope){
  assert(typeof scope.baselineProject==='string'&&path.isAbsolute(scope.baselineProject),'revision-scope.json需要baselineProject：保留旧设计与实际检查记录的原课件工程绝对路径');
  const oldProject=await fs.realpath(scope.baselineProject);assert(oldProject!==await fs.realpath(project),'修订使用独立工程，baselineProject须指向保留的旧工程');
  const oldContractPath=path.join(oldProject,'course-project.json'),oldContract=await read(oldContractPath),oldHash=await digest(oldContractPath);
  assert(identical(oldContract.slides.map(s=>s.stem),c.slides.map(s=>s.stem)),'当前修订入口要求与基线相同页序；增删或重排需另行明确页映射，不能借不相关成品跳过early');
  const z=await JSZip.loadAsync(await fs.readFile(baseline.path));assert(z.file('ppt/presentation.xml')&&z.file('[Content_Types].xml'),'修订基线不是实际PPTX');
  const xml=await z.file('ppt/presentation.xml').async('string'),pageCount=(xml.match(/<p:sldId\b/g)||[]).length;
  assert(pageCount===oldContract.slides.length,'修订基线PPTX页数与原工程不符');
  let proof;
  for(const dir of await fs.readdir(path.join(oldProject,'validation'))){const f=path.join(oldProject,'validation',dir,'artifact-check.json');if(!await exists(f))continue;const r=await read(f);if(r.status==='PASS'&&r.sha256===baseline.sha256&&r.contractSha256===oldHash){proof=f;break;}}
  assert(proof,'基线缺少匹配旧工程和实际PPTX的检查记录；先对旧工程执行check，不得伪造既往build');
  const files=[oldContractPath,path.join(oldProject,'design_spec.md'),path.join(oldProject,'spec_lock.md'),proof];
  return{...baseline,project:oldProject,pageCount,evidence:await Promise.all(files.map(async p=>({path:p,sha256:await digest(p)})))};
}

export async function finishBuildRecord(project,reportDir,result,inputs,after,stages,officialReport){
  assert(identical(inputs,after),'制作期间输入发生变化，本次不能登记为有效build');
  result.schema='native-build-record.v1';result.inputFingerprint=inputs;result.stages=stages;
  result.finalReport={file:officialReport,sha256:await digest(officialReport)};
  result.artifactHash=result.sha256;result.designSpecHash=inputs.files.find(f=>f.path==='design_spec.md').sha256;result.specLockHash=inputs.files.find(f=>f.path==='spec_lock.md').sha256;
  const file=path.join(reportDir,'run.json');await write(file,result);await point(project,'build',file);return result;
}

export async function runStageCommand({command,project,args,runtime,validate,doctor,reportDir,upstream}){
  await doctor(runtime);
  const data=await validate(project,runtime,{mode:command==='release-check'?'complete':command==='gate'?'partial':'plan'}),c=data.contract;
  if(command==='prepare'){
    const revision=args[0]==='--revision-of';assert(!args.length||(revision&&args.length===2),'prepare只接受 --revision-of <基线PPTX>');
    const context=await stageContext(project,c),present=await authored(project);
    const prior=await exists(path.join(project,'validation/current-prepare.json'))?await record(project,'prepare'):null;
    let baseline=revision?{path:path.resolve(runtime.root,args[1]),sha256:await digest(path.resolve(runtime.root,args[1]))}:null;
    let scope=null;
    if(revision){scope=await read(path.join(project,'revision-scope.json'));assert(typeof scope.reason==='string'&&scope.reason.trim()&&Array.isArray(scope.slides)&&scope.slides.length&&scope.slides.every(s=>c.slides.some(p=>p.stem===s)),'revision-scope.json须含reason和本次修订slides');baseline=await revisionBaseline(runtime,project,c,baseline,scope);}
    // Never pass a retrospective first preparation off as the normal new-deck sequence.
    assert(revision||c.slides.length<=6||present.length<=5||(prior?.value.context.sha256===context.sha256&&prior.value.mode==='new'),'首次prepare时已超过前5页，属于迟到准备；已有成品须走真实修订，不得补造历史');
    await upstream('project_manager.py',['validate',project]);
    let calibration;
    if(prior?.value.context.typographyHash===context.typographyHash&&await exists(prior.value.calibration.file)&&await digest(prior.value.calibration.file)===prior.value.calibration.sha256)calibration=prior.value.calibration;
    else{await upstream('text_measure.py',['calibrate',project,'--outline']);const file=path.join(reportDir,'text_measure.py.log');calibration={file,sha256:await digest(file)};}
    const result={schema:'native-preparation.v1',status:'PREPARED',mode:revision?'revision':'new',preparedAt:new Date().toISOString(),context,authoredAtPreparation:present,baseline,revisionScope:scope,revisionScopeHash:revision?await digest(path.join(project,'revision-scope.json')):null,calibration};
    const file=path.join(reportDir,'run.json');await write(file,result);await point(project,'prepare',file);return result;
  }
  if(command==='gate'){
    assert(args.length===1&&args[0]==='early','gate仅接受 early');
    const preparation=await currentPreparation(project,c);
    assert(preparation.value.mode==='new','修订按基线和最终结果验收，不补造新建early');
    if(c.slides.length<=6)return{status:'EARLY_NOT_REQUIRED',plannedPages:c.slides.length,reason:'不超过6页；仍须准备和最终独立设计审阅'};
    const present=await authored(project),expected=c.slides.slice(0,5).map(s=>s.stem);
    assert(identical(present,expected),present.length>5?'迟到前5页检查：现场已有后续页，拒绝记为按时early':'early必须现场恰好为计划前5页');
    const existing=await exists(path.join(project,'validation/current-early.json'))?await record(project,'early'):null;
    const reviewFile=path.join(project,'validation/early-design-review.json');
    const currentPages=await Promise.all(expected.map(async stem=>({stem,sha256:await digest(path.join(project,'svg_output',`${stem}.svg`))})));
    if(existing?.value.preparationHash===preparation.sha256&&existing.value.designSpecHash===await digest(path.join(project,'design_spec.md'))&&identical(currentPages,existing.value.pages.map(({stem,sha256})=>({stem,sha256})))&&await exists(reviewFile)){
      for(const file of existing.value.snapshotFiles||[])assert(await digest(file.path)===file.sha256,'早期作者稿/素材快照已改变');
      assert(await digest(existing.value.officialReport.file)===existing.value.officialReport.sha256,'官方early检查记录已改变');
      const reviewed=await evaluate(project,reviewFile,{earlyRecordHash:existing.sha256,designSpecHash:existing.value.designSpecHash,specLockHash:existing.value.specLockHash},earlyExpected(existing.value),'early');
      const result={schema:'native-early-review.v1',status:'EARLY_REVIEWED',recordedAt:new Date().toISOString(),authoredAtReview:present,preparationHash:preparation.sha256,earlyRecordHash:existing.sha256,reviewFile,reviewHash:reviewed.reviewHash};
      const file=path.join(reportDir,'run.json');await write(file,result);await point(project,'early-review',file);return result;
    }
    await upstream('svg_quality_checker.py',[project,'--canonical-authoring','--stage','early','--json']);
    const snapshotRoot=path.join(reportDir,'authoring-snapshot'),snapshotDir=path.join(snapshotRoot,'svg_output');await fs.mkdir(snapshotDir,{recursive:true});const pages=[],snapshotFiles=[];
    for(const stem of expected){const file=path.join(snapshotDir,`${stem}.svg`);await fs.copyFile(path.join(project,'svg_output',`${stem}.svg`),file);pages.push({stem,path:file,sha256:await digest(file)});}
    for(const relative of [...new Set([...c.assets.filter(a=>a.slides.some(s=>expected.includes(s))).map(a=>a.path),...await actualAssetFiles(project,c.slides.slice(0,5)),'design_spec.md','spec_lock.md','course-project.json'])]){
      const file=path.join(snapshotRoot,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(path.join(project,relative),file);snapshotFiles.push({path:file,sha256:await digest(file)});
    }
    const official=path.join(project,'validation/svg_quality_early_report.json'),reportCopy=path.join(reportDir,'svg_quality_early_report.json');await fs.copyFile(official,reportCopy);
    const result={schema:'native-early.v1',status:'EARLY_TECHNICAL_PASS',checkedAt:new Date().toISOString(),preparationHash:preparation.sha256,pages,snapshotFiles,designSpecHash:await digest(path.join(project,'design_spec.md')),specLockHash:await digest(path.join(project,'spec_lock.md')),officialReport:{file:reportCopy,sha256:await digest(reportCopy)},designReview:'PENDING'};
    const file=path.join(reportDir,'run.json');await write(file,result);await point(project,'early',file);return result;
  }
  assert(command==='release-check'&&args.length===1,'release-check需要PPTX路径');
  const pptx=path.resolve(runtime.root,args[0]),build=await record(project,'build'),b=build.value;
  assert(b.status==='MECHANICAL_PASS'&&b.schema==='native-build-record.v1','缺少有效的新路线build记录');
  const current=await collectProductionInputs(project,c);
  assert(identical(current,b.inputFingerprint),'当前制作输入指纹与build不一致；包括SVG几何、素材、备注、动画或设计变更，须重新build');
  assert(await digest(pptx)===b.artifactHash,'当前PPTX与build输出哈希不一致');
  assert(await digest(b.finalReport.file)===b.finalReport.sha256,'官方final报告已改变');
  const currentStages=await assertBuildStages(project,c);
  assert(identical(currentStages,b.stages),'当前阶段记录与本次build所绑定记录不同；须按当前准备/审阅记录重新build，不能替换既往阶段历史');
  const reviewFile=path.join(project,'validation/design-review.json'),review=await read(reviewFile),expected=[];
  const bindings={artifactHash:b.artifactHash,buildRecordHash:build.sha256,designSpecHash:b.designSpecHash,specLockHash:b.specLockHash};
  for(const [field,value]of Object.entries(bindings))assert(review[field]===value,`审阅${field}未绑定当前build`);
  if(c.slides.some(s=>s.clicks>0)){
    assert(typeof review.stateReportPath==='string','动效审阅缺少stateReportPath');const states=await read(review.stateReportPath);
    assert(review.stateReportHash===await digest(review.stateReportPath)&&states.sha256===b.artifactHash&&states.status==='PASS'&&Array.isArray(states.staticStates),'静态状态报告未绑定本次PPTX');
    for(const [i,s]of c.slides.entries())for(let state=0;state<=s.clicks;state++){
      const source=states.staticStates.find(x=>x.stage===state);assert(source?.slides?.[i]?.stem===s.stem&&source.slides[i].appliedClicks===state,'状态报告缺少实际页/点击状态');expected.push({slide:i+1,state,renderSourcePath:source.file,renderSourceHash:source.sha256});
    }
  }else c.slides.forEach((s,i)=>expected.push({slide:i+1,state:0,renderSourcePath:pptx,renderSourceHash:b.artifactHash}));
  const visual=await evaluate(project,reviewFile,bindings,expected,'final');
  const result={status:'REVIEWED_READY',checkedAt:new Date().toISOString(),pptx,artifactHash:b.artifactHash,buildRecordHash:build.sha256,visual,actualPlayback:'NOT_TESTED',userAcceptance:'PENDING',limitations:['只记录机械一致性及独立静态设计审阅；不冒充教师认可或真实放映。']};
  await write(path.join(reportDir,'run.json'),result);return result;
}
