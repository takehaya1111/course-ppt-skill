/** Regression fixtures exercise file binding, not actual visual quality. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {renderPptx} from '../scripts/lib/rendering.mjs';
import {prepareReviewPack,importReview,loadReviewEvidence,extractReviewPlan,verifyReviewPack} from '../scripts/lib/review-package.mjs';
import {evaluateReviewEvidence} from '../scripts/lib/review-evidence.mjs';
import {REVIEW_POLICY} from '../scripts/lib/review-policy.mjs';
import {syntheticPagePolicy} from './fixture.mjs';
const skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),digest=async f=>hash(await fs.readFile(f));
const json=async(f,x)=>fs.writeFile(f,JSON.stringify(x,null,2));
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');

test('upstream §I or §V anchors work without a newly invented target title',()=>{
  const spec='## I. Project Information\n| Communication Intent | Audience sees the causal relation. |\n| Page Count | 4 |\n## V. Layout Principles\n### Deck-wide Direction\nHierarchy explains the direction.\n### Spacing\n页面边距60px\n## IX. Content Outline\n#### Slide 01 - Test\nCause precedes consequence.\n## X. Notes\n';
  const plan=extractReviewPlan(spec);assert.equal(plan.slides.length,1);assert.equal(plan.criteria.length,2);
  assert.match(plan.target,/Audience sees the causal relation/);assert.match(plan.target,/Hierarchy explains/);
  for(const weak of ['4','页面边距60px','merely avoid clipping'])assert.throws(()=>extractReviewPlan(spec,weak),/完整承接/);
  const explicit=spec.replace('### Deck-wide Direction','### Deck-wide Direction\n- **Design target / references**: 主图解释关系，不得以无溢出代替专业水平。\n');
  assert.deepEqual(extractReviewPlan(explicit).criteria,['主图解释关系，不得以无溢出代替专业水平。']);
  assert.throws(()=>extractReviewPlan(explicit,'无溢出'),/完整承接/);
});

test('full new evidence rejects wrong-state terminal images while all other bindings remain valid',{skip:process.platform!=='win32'},async t=>{
  const project=await fs.mkdtemp(path.join(os.tmpdir(),'course-review-test-'));
  t.after(async()=>{assert.ok(path.resolve(project).startsWith(path.join(path.resolve(os.tmpdir()),'course-review-test-')));await fs.rm(project,{recursive:true});});
  for(const d of ['validation','templates'])await fs.mkdir(path.join(project,d));
  const spec='## I. Project Information\n| Communication Intent | Explain the relation visibly, with professional hierarchy. |\n| Reading Mode | presentation |\n## V. Layout Principles\nPreserve a common object and make changed relations visible.\nSpacing anchors: page margin=64; block gap=24.\n## IX. Content Outline\n#### Slide 01 - Synthetic\nKeep the object fixed while the relationship changes.\n## X. Notes\n';
  await fs.writeFile(path.join(project,'design_spec.md'),spec);await fs.writeFile(path.join(project,'spec_lock.md'),'## canvas\n- viewBox: 0 0 1280 720\n## communication\n- consumption_mode: presentation\n');
  await json(path.join(project,'course-project.json'),{sources:[],slides:[{stem:'01',noteParagraphs:[]}]});
  await fs.writeFile(path.join(project,'reference.png'),png);
  const zip=new JSZip();zip.file('ppt/presentation.xml','<p:presentation><p:sldIdLst><p:sldId id="1"/></p:sldIdLst></p:presentation>');
  const bytes=await zip.generateAsync({type:'nodebuffer'}),sources=[];
  for(let i=0;i<2;i++){const f=path.join(project,`stage-${i}.pptx`);await fs.writeFile(f,bytes);sources.push(f);}
  // The two states intentionally have identical bytes and pixels. Correct binding
  // depends on source+page+actual render record, never image uniqueness quotas.
  const runtime={skillDir,run:async(file,args)=>{
    const input=args[args.indexOf('-InputPptx')+1],out=args[args.indexOf('-OutputDir')+1],image=path.join(out,'slide-01.png');await fs.writeFile(image,png);
    await json(path.join(out,'render-report.json'),{input,status:'success',slideCount:1,application:'TEST DOUBLE',version:'test',method:'not real rendering',slides:[{index:1,image}]});return{stdout:'',stderr:''};
  }};
  const renders=[];for(const sourceFile of sources)renders.push(await renderPptx({runtime,projectDir:project,sourceFile}));
  const bindings={artifactHash:'synthetic-artifact',buildRecordHash:'synthetic-build',designSpecHash:await digest(path.join(project,'design_spec.md')),specLockHash:await digest(path.join(project,'spec_lock.md'))};
  const expectedStates=sources.map((source,state)=>({slide:1,state,renderSourcePath:source,renderSourceHash:hash(bytes)}));
  const request={schema:'course-review-request.v1',authorContextId:'test-author',reviewerContextId:'test-isolated-review',referenceImages:[{id:'test-ref',caption:'Synthetic reference; not viewed',path:'reference.png',sha256:hash(png)}],states:renders.map((r,state)=>({slide:1,state,imagePath:r.records[0].image.path,imageHash:r.records[0].image.sha256,renderManifestPath:r.manifestFile,renderManifestHash:r.manifestSha256}))};
  const requestFile=path.join(project,'request.json');await json(requestFile,request);
  const made=await prepareReviewPack({project,skillDir,requestFile,outputDir:path.join(project,'validation/pack'),bindings,expectedStates}),pack=await read(made.reviewPack.path);
  assert.equal(pack.status,undefined);assert.equal(pack.designTarget.status,undefined);assert.equal(pack.states.length,2);
  assert.equal(pack.states[0].pageRole.value,null);assert.equal(pack.states[0].pageRole.declared,false);
  assert.deepEqual(pack.states[0].authorCanvas.viewBox,[0,0,1280,720]);assert.deepEqual(pack.states[0].renderPixels,{width:1,height:1});
  assert.match(pack.reviewContext.layoutPrinciples,/block gap=24/);
  assert.deepEqual(pack.reviewContext.rules.hard,['H1','H2','H3','H4','H6','H7','H8','H9']);
  const prompt=await fs.readFile(made.promptPath,'utf8');assert.match(prompt,/S3允许意图性不对称/);assert.match(prompt,/不把渲染分辨率当原稿尺寸/);
  const raw={schema:'course-raw-review.v1',reviewPolicy:REVIEW_POLICY,reviewPackHash:made.reviewPack.sha256,reviewer:{kind:'agent',name:'SYNTHETIC TEST NOT A VIEWER',contextId:request.reviewerContextId},reviewedAt:new Date().toISOString(),status:'pass',unresolvedIssues:[],limitations:['Synthetic fixture only, not actual viewing'],deckReview:{continuity:'test',hierarchy:'test',compositionByJob:'test',referenceComparison:'test'},designTarget:{...pack.designTarget,status:'met',comparison:'test comparison, not actual aesthetic judgment',remainingGaps:[]},pages:pack.states.map(s=>({slide:s.slide,state:s.state,status:'ok',findings:[],needs_human_items:[],design_intent_check:{spec_says:s.specSection,render_delivers:true,note:'synthetic fixture'},pageJob:'test',relationships:'test',realization:'test',observations:'test',carrierCheck:'test',referenceComparisons:[{referenceId:'test-ref',observation:'test'}],styleChecks:[],...syntheticPagePolicy(pack)}))};
  const dispatch={schema:'course-review-dispatch.v1',reviewPackHash:made.reviewPack.sha256,authorContextId:request.authorContextId,reviewerContextId:request.reviewerContextId,host:'SOFTWARE TEST',method:'TEST DOUBLE',invocationId:'test-call',dispatchedAt:new Date().toISOString(),contextIsolation:'fresh'};
  const rawFile=path.join(project,'raw.json'),dispatchFile=path.join(project,'dispatch.json');await json(rawFile,raw);
  const sent=path.join(project,'SYNTHETIC-host-dispatch.txt'),received=path.join(project,'SYNTHETIC-host-response.txt');
  await fs.writeFile(sent,`SYNTHETIC SOFTWARE TEST, NOT ACTUAL HOST DISPATCH\n${dispatch.invocationId}\n${dispatch.reviewerContextId}\n${dispatch.reviewPackHash}`);
  await fs.writeFile(received,`SYNTHETIC SOFTWARE TEST, NOT ACTUAL HOST RESPONSE\n${dispatch.reviewerContextId}\n${await digest(rawFile)}`);
  dispatch.sourceEvidence={dispatch:{path:sent,sha256:await digest(sent)},response:{path:received,sha256:await digest(received)}};await json(dispatchFile,dispatch);
  const imported=await importReview({project,rawFile,dispatchFile}),loaded=await loadReviewEvidence({project,reviewFile:imported.reviewFile,bindings,expectedStates,kind:'final'});
  assert.equal(evaluateReviewEvidence({review:loaded.review,pack:loaded.pack,packHash:made.reviewPack.sha256}).pass,true);
  for(const [label,change,pattern]of[
    ['context',p=>p.reviewContext.layoutPrinciples='shortened convenient excerpt',/上下文/],
    ['rules',p=>p.reviewContext.rules.soft.pop(),/上下文/],
    ['role',p=>p.states[0].pageRole={value:'content',source:null,declared:false},/页面角色/],
    ['canvas',p=>p.states[0].authorCanvas.viewBox=[0,0,1,1],/作者画布/],
    ['pixels',p=>p.states[0].renderPixels.width=1280,/渲染像素/],
    ['section',p=>p.states[0].specSection='different page task',/逐页§IX/],
    ['legacy',p=>delete p.reviewPolicy,/旧审阅包/]
  ]){
    const altered=structuredClone(pack);change(altered);const f=path.join(project,`altered-${label}.json`);await json(f,altered);
    await assert.rejects(verifyReviewPack({project,packFile:f,packHash:await digest(f),bindings,expectedStates,kind:'final'}),pattern);
  }
  const weakTarget={...request,designTarget:{specQuote:pack.designTarget.specQuote,criteria:['visible']}};await json(path.join(project,'weak-target.json'),weakTarget);
  await assert.rejects(prepareReviewPack({project,skillDir,requestFile:path.join(project,'weak-target.json'),outputDir:path.join(project,'weak-pack'),bindings,expectedStates}),/完整承接/);
  // One wrong mapping alone; all files and hashes individually still exist/agree.
  const wrong=structuredClone(request);wrong.states[0]={...wrong.states[0],imagePath:renders[1].records[0].image.path,imageHash:renders[1].records[0].image.sha256};
  await json(path.join(project,'wrong.json'),wrong);
  await assert.rejects(prepareReviewPack({project,skillDir,requestFile:path.join(project,'wrong.json'),outputDir:path.join(project,'wrong-pack'),bindings,expectedStates}),/来源\/页\/图映射无效/);
  const substituted=structuredClone(request);substituted.states[0]={...substituted.states[0],...request.states[1],state:0};await json(path.join(project,'wrong-source.json'),substituted);
  await assert.rejects(prepareReviewPack({project,skillDir,requestFile:path.join(project,'wrong-source.json'),outputDir:path.join(project,'wrong-source-pack'),bindings,expectedStates}),/来源\/页\/图映射无效/);
  const duplicate=structuredClone(request);duplicate.states[1]={...duplicate.states[0]};await json(path.join(project,'duplicate.json'),duplicate);
  await assert.rejects(prepareReviewPack({project,skillDir,requestFile:path.join(project,'duplicate.json'),outputDir:path.join(project,'duplicate-pack'),bindings,expectedStates}),/重复或缺失/);
  const self=structuredClone(dispatch);self.reviewerContextId=self.authorContextId;await json(dispatchFile,self);
  await assert.rejects(importReview({project,rawFile,dispatchFile}),/隔离上下文/);await json(dispatchFile,dispatch);
  const renamedOnly=structuredClone(dispatch);delete renamedOnly.sourceEvidence;await json(dispatchFile,renamedOnly);
  await assert.rejects(importReview({project,rawFile,dispatchFile}),/只换上下文字符串/);await json(dispatchFile,dispatch);
  const wrongResponse=structuredClone(dispatch);wrongResponse.sourceEvidence.response=wrongResponse.sourceEvidence.dispatch;await json(dispatchFile,wrongResponse);
  await assert.rejects(importReview({project,rawFile,dispatchFile}),/原始返回记录未关联/);await json(dispatchFile,dispatch);
  const drift=structuredClone(raw);drift.designTarget.criteria=['no clipping'];assert.equal(evaluateReviewEvidence({review:drift,pack,packHash:made.reviewPack.sha256}).pass,false);
  await fs.appendFile(path.join(project,'reference.png'),'changed');await assert.rejects(loadReviewEvidence({project,reviewFile:imported.reviewFile,bindings,expectedStates,kind:'final'}),/冻结文件已改变/);
});
