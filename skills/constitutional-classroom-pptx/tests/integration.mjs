/** Real upstream export on synthetic content. No course files or aesthetic verdicts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import JSZip from 'jszip';
import {runNativeCommand} from '../scripts/native-route.mjs';
import {assertBuildStages,validateOriginalDesign} from '../scripts/native-stages.mjs';
import {createEnvironment} from '../scripts/lib/environment.mjs';
import {writeFixture,writeEvidenceFixture,read,json,hash} from './fixture.mjs';

const skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'course-ppt-独立测试-'));
const project=path.join(root,'project'),results=[];
const originalLog=console.log;
const run=async args=>{console.log=()=>{};try{return await runNativeCommand(args,{root,skillDir});}finally{console.log=originalLog;}};
const pass=name=>results.push({name,status:'PASS'});
const fail=async(name,action,pattern)=>{await assert.rejects(action,pattern);results.push({name,status:'EXPECTED_FAILURE'});};
try{
  const contract=await writeFixture(project,skillDir);
  await run(['doctor']);pass('独立包环境及完整上游归属检查');
  const runtime=await createEnvironment(root,skillDir),lockFile=path.join(project,'spec_lock.md'),lockBytes=await fs.readFile(lockFile),specFile=path.join(project,'design_spec.md'),specBytes=await fs.readFile(specFile);
  await fs.writeFile(lockFile,lockBytes.toString('utf8').replace('<!-- ppt-master-schema: spec-lock/v1 -->',''));
  await fail('新制作的无版本锁不能走原版legacy跳过',()=>validateOriginalDesign(runtime,project),/missing ppt-master-schema marker/);await fs.writeFile(lockFile,lockBytes);
  await fs.writeFile(specFile,specBytes.toString('utf8').replace(/<!-- ppt-master-schema: design-spec\/v1 -->/,''));
  await fail('新设计纲无版本标记不能仅获legacy warning',()=>validateOriginalDesign(runtime,project),/missing ppt-master-schema marker/);await fs.writeFile(specFile,specBytes);
  await fs.writeFile(lockFile,lockBytes.toString('utf8').replace('- mode: instructional','- mode: custom'));
  await fail('custom模式直接交原版schema核验所需行为字段',()=>validateOriginalDesign(runtime,project),/mode_behavior/);await fs.writeFile(lockFile,lockBytes);
  await fs.writeFile(specFile,specBytes.toString('utf8').replace(/^\| Reading Mode \|.*\r?\n/m,''));
  await fail('课堂设计不能遗漏原版阅读模式',()=>validateOriginalDesign(runtime,project),/阅读模式/);await fs.writeFile(specFile,specBytes);
  await fs.writeFile(lockFile,lockBytes.toString('utf8').replace('- consumption_mode: presentation','- consumption_mode: text'));
  await fail('设计纲与执行锁阅读目的冲突不能继续',()=>validateOriginalDesign(runtime,project),/阅读模式/);await fs.writeFile(lockFile,lockBytes);
  await fail('缺少准备记录不得导出',()=>run(['build',project]),/current-prepare/);
  assert.equal((await run(['prepare',project])).status,'PREPARED');pass('实际上游准备与字体校准');
  const build=await run(['build',project]);assert.equal(build.status,'MECHANICAL_PASS');pass('实际上游原生导出');
  const states=await run(['states',project,build.pptx]);
  const report=await read(path.join(states.reportDir,'artifact-check.json'));
  assert.equal(report.staticStates.length,2);assert.deepEqual(report.slides.map(s=>s.clickGroups.length),[1,1]);pass('两页点击和静态状态核对');
  const cli=execFileSync(process.execPath,[path.join(skillDir,'scripts/run.mjs'),'check','project',path.relative(root,build.pptx)],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:4*1024*1024});
  assert.match(cli,/MECHANICAL_PASS/);pass('任意中文工作目录中按调用者目录解析工程和PPTX');
  await fail('无独立设计审阅不得交付',()=>run(['release-check',project,build.pptx]),/design-review/);
  // Program fixtures test the evidence protocol only. These 1px images were not reviewed.
  const image=path.join(root,'SYNTHETIC-TEST-NOT-VISUAL-REVIEW.png');
  await fs.writeFile(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1hIAAAAASUVORK5CYII=','base64'));
  const imageHash=hash(await fs.readFile(image));
  const evidence={reviewer:{kind:'agent',name:'SYNTHETIC_SOFTWARE_FIXTURE_NOT_ACTUAL_REVIEW',independent:true},reviewedAt:new Date().toISOString(),status:'pass',unresolvedIssues:[],limitations:['仅合成程序测试；未看图、未放映、不可交付'],deckReview:{continuity:'合成字段',hierarchy:'合成字段',compositionByJob:'合成字段',referenceComparison:'合成字段'},designTarget:{status:'met',reference:'程序测试用虚构参照',criteria:['仅验证字段及绑定'],comparison:'这是合成证据结构，不是美感评价',remainingGaps:[]}};
  const pointer=await read(path.join(project,'validation/current-build.json')),buildRecord=await read(pointer.file),stateReportPath=path.join(states.reportDir,'artifact-check.json');
  const review={...structuredClone(evidence),artifactHash:buildRecord.artifactHash,buildRecordHash:pointer.sha256,designSpecHash:buildRecord.designSpecHash,specLockHash:buildRecord.specLockHash,stateReportPath,stateReportHash:hash(await fs.readFile(stateReportPath)),pages:[]};
  for(const [i,slide]of contract.slides.entries())for(let state=0;state<=slide.clicks;state++){
    const stateFile=report.staticStates.find(s=>s.stage===state);review.pages.push({slide:i+1,state,imagePath:image,imageHash,renderSourcePath:stateFile.file,renderSourceHash:stateFile.sha256,pageJob:'合成任务',relationships:'合成关系',realization:'合成表达',observations:'合成观察；不是真实看图',status:'pass',unresolvedIssues:[]});
  }
  const reviewPath=path.join(project,'validation/design-review.json');await json(reviewPath,review);
  await fail('旧版任意图片+自填pass即使哈希齐全也不能交付',()=>run(['release-check',project,build.pptx]),/旧版审阅/);
  const unmet=structuredClone(review);unmet.designTarget.status='not_met';await json(reviewPath,unmet);
  await fail('旧版总体pass或目标声明都不能替代真实派发包',()=>run(['release-check',project,build.pptx]),/旧版审阅/);await json(reviewPath,review);
  if(process.platform==='win32'){
    const fresh=await writeEvidenceFixture({project,skillDir,report:{...report,reportPath:stateReportPath},run});
    assert.equal((await run(['release-check',project,build.pptx])).status,'REVIEWED_READY');pass('新版真实入口完整软件证据正例（渲染/审阅为明确测试替身）');
    const original=await fs.readFile(stateReportPath),forged=structuredClone(report),terminal=forged.staticStates.at(-1);
    for(const state of forged.staticStates){state.file=terminal.file;state.sha256=terminal.sha256;}
    // Only the report mapping changes: original artifact, all PNGs and terminal
    // render receipts remain valid. The new command-origin receipt must catch it.
    await json(stateReportPath,forged);
    await fail('review-pack入口拒绝全阶段改指终态的原报告篡改',()=>run(['review-pack',project,fresh.requestFile]),/实际states报告已被篡改/);
    await fail('release-check入口同样拒绝全阶段改指终态',()=>run(['release-check',project,build.pptx]),/实际states报告已被篡改/);
    await fs.writeFile(stateReportPath,original);
    const fakeFile=path.join(project,'SYNTHETIC-forged-state-report.json');await json(fakeFile,forged);
    const fakeRequest={...fresh.request,stateReportPath:fakeFile,states:fresh.request.states.map(s=>{
      const r=fresh.renders.at(-1),page=r.records.find(p=>p.page===s.slide);return{...s,imagePath:page.image.path,imageHash:page.image.sha256,renderManifestPath:r.manifestFile,renderManifestHash:r.manifestSha256};
    })};
    const fakeRequestFile=path.join(project,'SYNTHETIC-forged-state-request.json');await json(fakeRequestFile,fakeRequest);
    await fail('review-pack拒绝自写状态报告即使终态真实渲染凭据齐全',()=>run(['review-pack',project,fakeRequestFile]),/不是实际states命令登记/);
    assert.equal((await run(['release-check',project,build.pptx])).status,'REVIEWED_READY');pass('恢复真实states记录后同份新版软件证据仍通过');
    const currentStates=path.join(project,'validation/current-states.json'),pointerBytes=await fs.readFile(currentStates);await fs.unlink(currentStates);
    await fail('旧工程没有本次states记录不能补签状态历史',()=>run(['review-pack',project,fresh.requestFile]),/current-states/);await fs.writeFile(currentStates,pointerBytes);
  }
  const svg=path.join(project,`svg_output/${contract.slides[0].stem}.svg`),svgBytes=await fs.readFile(svg);await fs.writeFile(svg,svgBytes.toString('utf8').replace('x="64"','x="65"'));
  await fail('仅几何变化也使旧build与审查失效',()=>run(['release-check',project,build.pptx]),/输入指纹/);await fs.writeFile(svg,svgBytes);
  const sourcePath=path.join(project,'sources/synthetic.md'),source=await fs.readFile(sourcePath);await fs.appendFile(sourcePath,'mutation');
  await fail('来源改变拒绝',()=>run(['check',project,build.pptx]),/冻结来源已改变/);await fs.writeFile(sourcePath,source);
  const contractPath=path.join(project,'course-project.json'),wrong=structuredClone(contract);wrong.slides[0].clicks=2;await json(contractPath,wrong);
  await fail('错误点击数量拒绝',()=>run(['check',project,build.pptx]),/点击次数/);await json(contractPath,contract);
  const zip=await JSZip.loadAsync(await fs.readFile(build.pptx)),notes='ppt/notesSlides/notesSlide1.xml';
  zip.file(notes,(await zip.file(notes).async('string')).replace(/<a:t>[^<]*<\/a:t>/g,'<a:t>deleted</a:t>'));
  const badNotes=path.join(root,'bad-notes.pptx');await fs.writeFile(badNotes,await zip.generateAsync({type:'nodebuffer'}));
  await fail('实际PPTX备注丢失拒绝',()=>run(['check',project,badNotes]),/备注全文|冻结口播/);
  const late=path.join(root,'late');await writeFixture(late,skillDir,{pages:7});
  await fail('超过前五页的首次准备不得补造历史',()=>run(['prepare',late]),/迟到准备/);
  const prefix=path.join(root,'prefix'),prefixContract=await writeFixture(prefix,skillDir,{pages:7,authored:5});
  await run(['prepare',prefix]);const early=await run(['gate',prefix,'early']);assert.equal(early.status,'EARLY_TECHNICAL_PASS');pass('前五页实际官方早期检查及快照');
  await fail('早期技术检查不能冒充独立审查',()=>assertBuildStages(prefix,prefixContract),/early-design-review/);
  const earlyPointer=await read(path.join(prefix,'validation/current-early.json'));
  const earlyReview={...structuredClone(evidence),earlyRecordHash:earlyPointer.sha256,designSpecHash:early.designSpecHash,specLockHash:early.specLockHash,pages:early.pages.map((page,i)=>({slide:i+1,state:0,imagePath:image,imageHash,renderSourcePath:page.path,renderSourceHash:page.sha256,pageJob:'合成任务',relationships:'合成关系',realization:'合成表达',observations:'合成观察；不是真实看图',status:'pass',unresolvedIssues:[]}))};
  await json(path.join(prefix,'validation/early-design-review.json'),earlyReview);
  await fail('早期旧版自填独立及1像素图片不得收录',()=>run(['gate',prefix,'early']),/旧版自填审阅/);
  await fail('未实际完成early隔离看图继续阻止build',()=>assertBuildStages(prefix,prefixContract),/旧版自填审阅/);
  const initial=await run(['init',path.join(root,'new-project')]);assert.equal(initial.status,'INITIALIZED_NOT_AUTHORED');pass('官方初始化且不伪造完整制作输入');
  const output={status:'PASS',scope:'合成软件集成测试，不是看图、放映或课程质量评价',results};
  await json(path.join(root,'test-results.json'),output);console.log(JSON.stringify({...output,testDirectory:root},null,2));
}catch(error){console.error(JSON.stringify({status:'FAIL',testDirectory:root,results,error:error.message},null,2));process.exitCode=1;}
