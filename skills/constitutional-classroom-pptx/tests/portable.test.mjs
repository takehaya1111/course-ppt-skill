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
const pack={schema:'course-review-pack.v1',authorContextId:'author',reviewerContextId:'fresh-reviewer',designTarget:{specQuote:'Source relation must be visible',criteria:['relation must be visible']},references:[{id:'test-reference'}],styleFocus:[],states:[{slide:1,state:0,specSection:'A shared object remains stable while ownership labels change.'}]};
const base=()=>({
  schema:'course-raw-review.v1',reviewPackHash:'pack-hash',reviewer:{kind:'agent',name:'SYNTHETIC_SOFTWARE_TEST_NOT_VISUAL_REVIEW',contextId:'fresh-reviewer'},
  reviewedAt:'2026-01-01T00:00:00Z',status:'pass',unresolvedIssues:[],limitations:['合成程序测试，不代表真实看图或放映'],
  deckReview:{continuity:'测试',hierarchy:'测试',compositionByJob:'测试',referenceComparison:'测试'},
  designTarget:{...pack.designTarget,status:'met',comparison:'仅程序字段正例，不是设计评价',remainingGaps:[]},
  pages:[{slide:1,state:0,pageJob:'测试任务',relationships:'测试关系',realization:'测试表达',observations:'测试观察',carrierCheck:'测试表达任务，数量不等于设计质量',status:'ok',findings:[],needs_human_items:[],design_intent_check:{spec_says:pack.states[0].specSection,render_delivers:true,note:'合成字段测试'},referenceComparisons:[{referenceId:'test-reference',observation:'合成比较，不代表看图'}],styleChecks:[]}]
});
const evaluate=review=>evaluateReviewEvidence({review,pack,packHash:'pack-hash'});
test('完整合成证据结构通过；函数明确不评定实际美感',()=>{
  const result=evaluate(base());assert.equal(result.pass,true);assert.match(result.scope,/不自动判定/);
});
for(const [name,change,pattern]of[
  ['旧审阅缺少设计目标',r=>delete r.designTarget,/设计目标/],
  ['总体pass但目标未达',r=>r.designTarget.status='not_met',/设计目标/],
  ['目标仍有差距',r=>r.designTarget.remainingGaps=['仅清晰，未达参照'],/仍有差距/],
  ['目标没有具体参照',r=>r.pages[0].referenceComparisons=[],/参照图/],
  ['目标没有比较',r=>r.designTarget.comparison='',/参照图/],
  ['目标没有准则',r=>r.designTarget.criteria=[],/目标漂移/],
  ['来源不对应',r=>r.reviewPackHash='old',/未绑定/],
  ['自审改姓名仍不是独立审阅',r=>r.reviewer.contextId='author',/不独立/],
  ['尚有语义问题',r=>r.pages[0].design_intent_check.render_delivers=false,/未兑现/],
  ['缺页状态',r=>r.pages=[],/须覆盖/],
  ['重复页状态',r=>r.pages.push({...r.pages[0]}),/重复/],
  ['review阶段降低设计目标',r=>r.designTarget.specQuote='没有溢出即可',/目标漂移/],
  ['逐页审阅引用其他页任务',r=>r.pages[0].design_intent_check.spec_says='unrelated',/未兑现/],
  ['没有实际载体判断',r=>r.pages[0].carrierCheck='',/carrierCheck/],
  ['冒充用户认可',r=>r.userAccepted=true,/冒充用户/]
])test(name,()=>{const r=base();change(r);const result=evaluate(r);assert.equal(result.pass,false);assert.match(result.errors.join(' '),pattern);});
test('旧版自填pass+independent没有事实包不能通过',()=>assert.equal(evaluateReviewEvidence({review:{status:'pass',reviewer:{independent:true}}}).pass,false));
test('安装Style存在时必须实际回应其Review Focus',()=>{
  const styled={...pack,styleFocus:[{path:'templates/design_spec.style.test.md',excerpt:'Make the object explain the relation.'}]};
  const r=base();assert.equal(evaluateReviewEvidence({review:r,pack:styled,packHash:'pack-hash'}).pass,false);
  r.pages[0].styleChecks=[{path:styled.styleFocus[0].path,met:true,observation:'synthetic focus observation, not actual viewing'}];
  assert.equal(evaluateReviewEvidence({review:r,pack:styled,packHash:'pack-hash'}).pass,true);
});
test('中间显隐状态必须审阅但无需重复末态载体与美感长文',()=>{
  const two={...pack,states:[pack.states[0],{...pack.states[0],state:1}]},r=base();r.pages.push({...structuredClone(r.pages[0]),state:1});
  delete r.pages[0].carrierCheck;delete r.pages[0].referenceComparisons;delete r.pages[0].styleChecks;
  assert.equal(evaluateReviewEvidence({review:r,pack:two,packHash:'pack-hash'}).pass,true);
  r.pages[0].observations='';assert.equal(evaluateReviewEvidence({review:r,pack:two,packHash:'pack-hash'}).pass,false);
});
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
