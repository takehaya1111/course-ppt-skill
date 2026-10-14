import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {evaluateReviewEvidence} from '../scripts/lib/review-evidence.mjs';
import {findOfficeCli} from '../scripts/lib/environment.mjs';

const skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const expectedStates=[{slide:1,state:0,renderSourcePath:'test-source.svg',renderSourceHash:'source-hash'}];
const fileHashes={'test-image.png':'image-hash','test-source.svg':'source-hash'};
const base=()=>({
  artifactHash:'artifact-hash',reviewer:{kind:'agent',name:'SYNTHETIC_SOFTWARE_TEST_NOT_VISUAL_REVIEW',independent:true},
  reviewedAt:'2026-01-01T00:00:00Z',status:'pass',unresolvedIssues:[],limitations:['合成程序测试，不代表真实看图或放映'],
  deckReview:{continuity:'测试',hierarchy:'测试',compositionByJob:'测试',referenceComparison:'测试'},
  designTarget:{status:'met',reference:'合成程序测试参照',criteria:['仅测试必需字段'],comparison:'仅程序字段正例，不是设计评价',remainingGaps:[]},
  pages:[{...expectedStates[0],imagePath:'test-image.png',imageHash:'image-hash',pageJob:'测试任务',relationships:'测试关系',realization:'测试表达',observations:'测试观察',status:'pass',unresolvedIssues:[]}]
});
const evaluate=review=>evaluateReviewEvidence({review,bindings:{artifactHash:'artifact-hash'},expectedStates,fileHashes});
test('完整合成证据结构通过；函数明确不评定实际美感',()=>{
  const result=evaluate(base());assert.equal(result.pass,true);assert.match(result.scope,/不自动判定/);
});
for(const [name,change,pattern]of[
  ['旧审阅缺少设计目标',r=>delete r.designTarget,/设计目标/],
  ['总体pass但目标未达',r=>r.designTarget.status='not_met',/设计目标/],
  ['目标仍有差距',r=>r.designTarget.remainingGaps=['仅清晰，未达参照'],/仍有差距/],
  ['目标没有具体参照',r=>r.designTarget.reference='',/实际参照/],
  ['目标没有比较',r=>r.designTarget.comparison='',/实际参照/],
  ['目标没有准则',r=>r.designTarget.criteria=[],/具体判断准则/],
  ['来源不对应',r=>r.artifactHash='old',/未绑定/],
  ['不是独立审阅',r=>r.reviewer.independent=false,/独立看图者/],
  ['尚有语义问题',r=>r.pages[0].unresolvedIssues=['方向错误'],/未解决/],
  ['缺页状态',r=>r.pages=[],/须覆盖/],
  ['重复页状态',r=>r.pages.push({...r.pages[0]}),/重复/],
  ['实看图片变更',r=>r.pages[0].imageHash='old',/图片缺失或哈希已变/],
  ['渲染来源变更',r=>r.pages[0].renderSourceHash='old',/来源未绑定/],
  ['冒充用户认可',r=>r.userAccepted=true,/冒充用户/]
])test(name,()=>{const r=base();change(r);const result=evaluate(r);assert.equal(result.pass,false);assert.match(result.errors.join(' '),pattern);});
test('任意工作目录可运行入口帮助且不会加载实验目录',async()=>{
  const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'course-ppt-cwd-'));
  const output=execFileSync(process.execPath,[path.join(skillDir,'scripts/run.mjs'),'help'],{cwd,encoding:'utf8'});
  assert.ok(output.includes(cwd));assert.match(output,/调用者当前目录/);
  await fs.rmdir(cwd);
});
test('历史入口不回退到工作区的旧生产器',()=>{
  assert.throws(()=>execFileSync(process.execPath,[path.join(skillDir,'scripts/run.mjs'),'legacy','doctor'],{encoding:'utf8',stdio:'pipe'}),/独立技能包仅维护/);
});
test('OfficeCLI显式关闭标明SKIPPED而非PASS',async()=>{
  const before=process.env.PPT_SKILL_OFFICECLI;process.env.PPT_SKILL_OFFICECLI='disabled';
  try{assert.equal((await findOfficeCli()).status,'SKIPPED');}finally{if(before===undefined)delete process.env.PPT_SKILL_OFFICECLI;else process.env.PPT_SKILL_OFFICECLI=before;}
});
test('OfficeCLI显式路径错误不能静默跳过',async()=>{
  const before=process.env.PPT_SKILL_OFFICECLI;process.env.PPT_SKILL_OFFICECLI=path.join(os.tmpdir(),'not-an-office-cli-binary');
  try{await assert.rejects(findOfficeCli(),/指定的 OfficeCLI 不可用/);}finally{if(before===undefined)delete process.env.PPT_SKILL_OFFICECLI;else process.env.PPT_SKILL_OFFICECLI=before;}
});
