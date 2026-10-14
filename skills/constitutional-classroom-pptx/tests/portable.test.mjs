import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {evaluateReviewEvidence} from '../scripts/lib/review-evidence.mjs';
import {findOfficeCli} from '../scripts/lib/environment.mjs';
import {REVIEW_POLICY,extractReviewContext,extractReadingMode,pageRole} from '../scripts/lib/review-policy.mjs';
import {syntheticPagePolicy} from './fixture.mjs';

const skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reviewContext=extractReviewContext('## I. Project Information\n| Reading Mode | presentation |\n## V. Layout Principles\nSynthetic direction\n','## canvas\n- viewBox: 0 0 1280 720\n## communication\n- consumption_mode: presentation\n',await fs.readFile(path.join(skillDir,'vendor/ppt-master/skills/ppt-master/references/visual-review.md'),'utf8'));
const pack={schema:'course-review-pack.v1',reviewPolicy:REVIEW_POLICY,reviewContext,authorContextId:'author',reviewerContextId:'fresh-reviewer',designTarget:{specQuote:'Source relation must be visible',criteria:['relation must be visible']},references:[{id:'test-reference'}],styleFocus:[],states:[{slide:1,state:0,specSection:'A shared object remains stable while ownership labels change.'}]};
const base=()=>({
  schema:'course-raw-review.v1',reviewPolicy:REVIEW_POLICY,reviewPackHash:'pack-hash',reviewer:{kind:'agent',name:'SYNTHETIC_SOFTWARE_TEST_NOT_VISUAL_REVIEW',contextId:'fresh-reviewer'},
  reviewedAt:'2026-01-01T00:00:00Z',status:'pass',unresolvedIssues:[],limitations:['合成程序测试，不代表真实看图或放映'],
  deckReview:{continuity:'测试',hierarchy:'测试',compositionByJob:'测试',referenceComparison:'测试'},
  designTarget:{...pack.designTarget,status:'met',comparison:'仅程序字段正例，不是设计评价',remainingGaps:[]},
  pages:[{slide:1,state:0,pageJob:'测试任务',relationships:'测试关系',realization:'测试表达',observations:'测试观察',carrierCheck:'测试表达任务，数量不等于设计质量',status:'ok',findings:[],needs_human_items:[],design_intent_check:{spec_says:pack.states[0].specSection,render_delivers:true,note:'合成字段测试'},referenceComparisons:[{referenceId:'test-reference',observation:'合成比较，不代表看图'}],styleChecks:[],...syntheticPagePolicy(pack)}]
});
const evaluate=review=>evaluateReviewEvidence({review,pack,packHash:'pack-hash'});
test('逐页依据不能截成单字符、标题或删去条件的片段',()=>{
  const specSection='#### Slide 01 - 条件与结果\n- **Content**: 预约且携证才可申请；仍需核验。\n- **Relationships**: 条件共同限定申请，并不保证进入。';
  const fullPack={...pack,states:[{...pack.states[0],specSection}]};
  for(const excerpt of ['#','#### Slide 01 - 条件与结果','- **Content**: 预约且携证才可申请；仍需核验。']){
    const r=base();r.pages[0].design_intent_check.spec_says=excerpt;
    const result=evaluateReviewEvidence({review:r,pack:fullPack,packHash:'pack-hash'});
    assert.equal(result.pass,false);assert.match(result.errors.join(' '),/完整引用/);
  }
  const r=base();r.pages[0].design_intent_check.spec_says='\n'+specSection.replaceAll('\n','\r\n')+'\n';
  assert.equal(evaluateReviewEvidence({review:r,pack:fullPack,packHash:'pack-hash'}).pass,true);
});
test('完整合成证据结构通过；函数明确不评定实际美感',()=>{
  const result=evaluate(base());assert.equal(result.pass,true);assert.match(result.scope,/不自动判定/);
});
function markRule(page,rule,result,observation){
  for(const c of page.ruleChecks)c.rules=c.rules.filter(id=>id!==rule);
  page.ruleChecks=page.ruleChecks.filter(c=>c.rules.length);page.ruleChecks.push({rules:[rule],result,observation});
}
function retainSoft(page,rule,{reason='ambiguous_design_intent',evidence=`synthetic remaining ${rule}`,rationale='Synthetic boundary judgment: this limited concern does not change the stated goal.'}={}){
  page.findings.push({rule,severity:'soft',evidence});markRule(page,rule,'issue',evidence);
  page.untouched_concerns.push({rule,evidence,reason,decision:'retain',rationale});
}
test('读取方式兼容原版表格和粗体字段，角色缺失不猜content',()=>{
  const lock='## communication\n- consumption_mode: balanced\n';
  assert.equal(extractReadingMode('## I. Project\n| Reading Mode | balanced |\n',lock).specValue,'balanced');
  assert.equal(extractReadingMode('## I. Project\n- **Reading Mode**: balanced\n',lock).specValue,'balanced');
  assert.equal(extractReadingMode('## I. Project\nNo field\n',lock).specValue,null);
  assert.deepEqual(pageRole('- **Page Role**: cover'),{value:'cover',source:'- **Page Role**: cover',declared:true});
  assert.deepEqual(pageRole('This mentions a cover, but declares no role.'),{value:null,source:null,declared:false});
});
for(const [name,change,pattern]of[
  ['旧报告不补签规则覆盖',r=>delete r.reviewPolicy,/reviewPolicy/],
  ['末态不能漏规则覆盖',r=>delete r.pages[0].ruleChecks,/未覆盖原版/],
  ['不能仅漏S8后仍通过',r=>r.pages[0].ruleChecks[0].rules=r.pages[0].ruleChecks[0].rules.filter(x=>x!=='S8'),/未覆盖原版S8/],
  ['规则结果须有效',r=>r.pages[0].ruleChecks[0].result='pass',/ruleChecks/],
  ['不适用须有具体理由',r=>markRule(r.pages[0],'S3','not_applicable',''),/ruleChecks/],
  ['重复覆盖不能掩盖漏项',r=>r.pages[0].ruleChecks[0].rules.push('S3'),/重复/],
  ['原版计划间距核对不能省略',r=>delete r.pages[0].planChecks.spacing,/spacing/],
  ['留存清单不能省略',r=>delete r.pages[0].untouched_concerns,/untouched_concerns/],
  ['软问题缺严重程度不能悄悄忽略',r=>{retainSoft(r.pages[0],'S4');delete r.pages[0].findings[0].severity;},/severity/],
  ['硬问题不能标为soft',r=>{r.pages[0].findings.push({rule:'H1',severity:'soft',evidence:'synthetic'});markRule(r.pages[0],'H1','issue','synthetic');},/降为软问题/],
  ['两处未处理soft仍ok必须拒绝',r=>{retainSoft(r.pages[0],'S4');retainSoft(r.pages[0],'S8');},/2处软问题/],
  ['一处soft也须保留理由',r=>{retainSoft(r.pages[0],'S4');r.pages[0].untouched_concerns[0].rationale='';},/留存理由/],
  ['一处soft未做决定仍失败',r=>{retainSoft(r.pages[0],'S4');r.pages[0].untouched_concerns[0].decision='needs_decision';},/留存理由/],
  ['发现与clear矛盾不能通过',r=>{retainSoft(r.pages[0],'S4');markRule(r.pages[0],'S4','clear','synthetic');},/矛盾/],
  ['issue没有观察发现不能通过',r=>markRule(r.pages[0],'S4','issue','synthetic'),/无发现/],
  ['整套重复项没有整套决定不能通过',r=>retainSoft(r.pages[0],'S4',{reason:'deck_wide'}),/整套统一决定/]
])test(name,()=>{const r=base();change(r);const got=evaluate(r);assert.equal(got.pass,false);assert.match(got.errors.join(' '),pattern);});
for(const [name,change,pattern]of[
  ['规则首尾空白不能逃过检查',r=>r.pages[0].findings.push({rule:' S4 ',severity:'soft',evidence:'synthetic whitespace bypass'}),/合法规则/],
  ['孤立未解决整套决定也不能通过',r=>r.deckReview.softDecisions=[{id:'orphan',rule:'S4',decision:'needs_decision',rationale:'pending',slides:[1]}],/整套仍有needs_decision/],
  ['STYLE未解决事项不因缺findings而消失',r=>r.pages[0].untouched_concerns.push({rule:'STYLE',evidence:'unmet synthetic focus',reason:'ambiguous_design_intent',decision:'needs_decision',rationale:'pending'}),/STYLE/],
  ['STYLE两条soft不能被met声明吞掉',r=>r.pages[0].findings.push({rule:'STYLE',severity:'soft',evidence:'synthetic focus one'},{rule:'STYLE',severity:'soft',evidence:'synthetic focus two'}),/2处软问题/],
  ['同一事项先retain后needs_decision不能吞矛盾',r=>{retainSoft(r.pages[0],'S4');r.pages[0].untouched_concerns.push({...r.pages[0].untouched_concerns[0],decision:'needs_decision'});},/重复或矛盾/],
  ['相同rule和evidence不同对象仍是两处soft',r=>{retainSoft(r.pages[0],'S4');r.pages[0].findings[0].element='#a';r.pages[0].untouched_concerns[0].element='#a';r.pages[0].findings.push({...r.pages[0].findings[0],element:'#b'});r.pages[0].untouched_concerns.push({...r.pages[0].untouched_concerns[0],element:'#b'});},/2处软问题/],
  ['完全重复findings也不静默去重',r=>{retainSoft(r.pages[0],'S4');r.pages[0].findings.push({...r.pages[0].findings[0]});},/重复或矛盾/]
])test(name,()=>{const r=base();change(r);const got=evaluate(r);assert.equal(got.pass,false);assert.match(got.errors.join(' '),pattern);});
test('合理不对称按原版S3条件不适用，不被强迫居中或等分',()=>{
  const r=base();markRule(r.pages[0],'S3','not_applicable','Synthetic observation: the declared 2:8 image/text composition intentionally places its anchor off center, so S3 center alignment is inapplicable.');
  assert.equal(evaluate(r).pass,true);
});
test('有理由保留一处soft遵守原版≤1，不改为零容忍',()=>{const r=base();retainSoft(r.pages[0],'S4');assert.equal(evaluate(r).pass,true);});
test('跨页同一软问题必须有一次整套决定，真实留存决定可被记录',()=>{
  const r=base();retainSoft(r.pages[0],'S4',{evidence:'same synthetic recurring grid concern'});r.pages.push({...structuredClone(r.pages[0]),slide:2});
  const two={...pack,states:[...pack.states,{...pack.states[0],slide:2}]};
  assert.equal(evaluateReviewEvidence({review:r,pack:two,packHash:'pack-hash'}).pass,false);
  for(const p of r.pages)Object.assign(p.untouched_concerns[0],{reason:'deck_wide',deckDecisionId:'synthetic-deck-decision'});
  r.deckReview.softDecisions=[{id:'synthetic-deck-decision',rule:'S4',decision:'retain',rationale:'Synthetic conditional design judgment for both pages; not actual viewing.',slides:[1,2]}];
  assert.equal(evaluateReviewEvidence({review:r,pack:two,packHash:'pack-hash'}).pass,true);
});
test('跨页初态重复问题不能用末态clear绕过整套决定',()=>{
  const r=base(),clean=structuredClone(r.pages[0]);retainSoft(r.pages[0],'S4',{evidence:'same synthetic initial-state concern'});
  r.pages.push({...structuredClone(clean),state:1},{...structuredClone(r.pages[0]),slide:2},{...structuredClone(clean),slide:2,state:1});
  const states=r.pages.map(p=>({...pack.states[0],slide:p.slide,state:p.state}));
  const got=evaluateReviewEvidence({review:r,pack:{...pack,states},packHash:'pack-hash'});assert.equal(got.pass,false);assert.match(got.errors.join(' '),/跨页重复/);
});
test('显隐状态可以复用末态覆盖，但必须实际描述变化；不能直接冒充看过',()=>{
  const r=base();r.pages.push({...structuredClone(r.pages[0]),state:1});delete r.pages[0].ruleChecks;
  const two={...pack,states:[pack.states[0],{...pack.states[0],state:1}]};
  assert.equal(evaluateReviewEvidence({review:r,pack:two,packHash:'pack-hash'}).pass,false);
  r.pages[0].stateReview={baselineState:1,observation:'Synthetic state-only test: explanation label absent before click; remaining visible objects unchanged.'};
  assert.equal(evaluateReviewEvidence({review:r,pack:two,packHash:'pack-hash'}).pass,true);
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
