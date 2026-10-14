/** Thin coverage contract for the unchanged upstream rubric. No design rules or
 * default judgments live here: rule IDs and the residual-soft budget come from
 * the pinned upstream text; observations remain the independent reviewer's job. */
export const REVIEW_POLICY='ppt-master-rubric-coverage.v1';
const text=v=>typeof v==='string'&&v.trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const assert=(v,m)=>{if(!v)throw new Error(m);};
const ruleName=v=>typeof v==='string'&&v.length>0&&v===v.trim()&&!/\s/.test(v);
const issueKey=f=>JSON.stringify([f?.rule,f?.evidence,f?.element??f?.selector??f?.fix_applied?.element??null]);

export function specSection(spec,roman){
  return spec.match(new RegExp(`^## ${roman}\\.\\s[^\\n]*\\n[\\s\\S]*?(?=^##\\s|$(?![\\s\\S]))`,'m'))?.[0]?.trim()||'';
}
function lockSection(lock,name){
  return lock.match(new RegExp(`^## ${name}\\s*\\n[\\s\\S]*?(?=^##\\s|$(?![\\s\\S]))`,'mi'))?.[0]?.trim()||'';
}
function row(block,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return block.split('\n').find(line=>new RegExp(`^\\|\\s*${escaped}\\s*\\||^-\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:`,'i').test(line))?.trim()||null;
}
export function extractReadingMode(spec,lock){
  const specRow=row(specSection(spec,'I'),'Reading Mode'),lockRow=row(lockSection(lock,'communication'),'consumption_mode');
  const specValue=specRow?.replace(/^\|\s*Reading Mode\s*\|\s*|^-\s*(?:\*\*)?Reading Mode(?:\*\*)?\s*:\s*/i,'').replace(/\s*\|\s*$/,'').replace(/`/g,'').trim()||null;
  const lockValue=lockRow?.replace(/^-\s*(?:\*\*)?consumption_mode(?:\*\*)?\s*:\s*/i,'').replace(/`/g,'').trim()||null;
  return {spec:specRow,lock:lockRow,specValue,lockValue};
}
export function pageRole(specSection){
  const source=specSection.split('\n').find(line=>/^\s*(?:-\s*(?:\*\*)?(?:Page[ _]Role|Role)(?:\*\*)?\s*:|\|\s*Page[ _]Role\s*\|)/i.test(line))?.trim()||null;
  const value=source?.replace(/^\s*-\s*(?:\*\*)?(?:Page[ _]Role|Role)(?:\*\*)?\s*:\s*/i,'').replace(/^\|\s*Page[ _]Role\s*\|\s*/i,'').replace(/\s*\|\s*$/,'').replace(/^`|`$/g,'').trim()||null;
  return {value,source,declared:Boolean(source)};
}
export function extractReviewContext(spec,lock,rubric){
  const projectInformation=specSection(spec,'I'),layoutPrinciples=specSection(spec,'V'),communication=lockSection(lock,'communication');
  assert(projectInformation&&layoutPrinciples,'审阅必须取得完整原版§I及§V，不得用摘句替代阅读方式与间距依据');
  const canvas=lockSection(lock,'canvas'),viewBoxRow=row(canvas,'viewBox');
  const numbers=viewBoxRow?.replace(/^-\s*(?:\*\*)?viewBox(?:\*\*)?\s*:/i,'').replace(/`/g,'').trim().split(/[\s,]+/).map(Number);
  assert(numbers?.length===4&&numbers.every(Number.isFinite)&&numbers[2]>0&&numbers[3]>0,'缺少有效的原版锁canvas.viewBox；不能把渲染像素猜作作者画布');
  const hard=[...rubric.matchAll(/^\|\s*(H\d+)\s*\|/gm)].map(m=>m[1]);
  const soft=[...rubric.matchAll(/^\|\s*(S\d+)\s*\|/gm)].map(m=>m[1]);
  const residual=rubric.match(/zero Hard hits and ≤\s*(\d+)\s*Soft hit/);
  assert(hard.length&&soft.length&&residual,'固定原版审阅规则或退出条件无法读取；不能自行补造规则');
  const readingMode=extractReadingMode(spec,lock);
  assert(['text','balanced','presentation'].includes(readingMode.specValue)&&readingMode.specValue===readingMode.lockValue,'阅读模式前提缺失或§I与锁communication冲突；须明确原版模式，不能猜测');
  return {projectInformation,layoutPrinciples,communication,readingMode,authorCanvas:{viewBox:numbers,source:viewBoxRow},rules:{hard,soft,residualSoftLimit:Number(residual[1])},sourceSections:{rubric:'§§0–4, especially §2 conditions/exemptions and §4.2 clean exit',executor:'§2.1 fixed inputs; Spacing; §2.2 Step 2 reading-mode check'}};
}

/** Check completeness and contradictions in a report; never infer a rule hit
 * from geometry, or infer whether a written observation is aesthetically true. */
export function evaluatePolicyEvidence({review,pack}){
  const errors=[],fail=m=>errors.push(m),context=pack.reviewContext;
  if(pack.reviewPolicy!==REVIEW_POLICY||review.reviewPolicy!==REVIEW_POLICY||!context?.rules){return ['审阅缺少当前reviewPolicy；旧报告不得自动升级，须重新派发实际审阅'];}
  const {hard,soft,residualSoftLimit}=context.rules;
  if(!Array.isArray(hard)||!Array.isArray(soft)||!Number.isInteger(residualSoftLimit)||residualSoftLimit<0)return ['原版审阅规则覆盖字段无效'];
  const known=[...hard,...soft],pages=Array.isArray(review.pages)?review.pages:[],deckDecisions=review.deckReview?.softDecisions===undefined?[]:review.deckReview.softDecisions;
  if(!Array.isArray(deckDecisions))fail('整套软问题决定必须为数组');
  const decisionIds=new Set();
  for(const d of Array.isArray(deckDecisions)?deckDecisions:[]){
    if(!d||!text(d.id)||decisionIds.has(d.id)||!ruleName(d.rule)||hard.includes(d.rule)||!['retain','needs_decision'].includes(d.decision)||!text(d.rationale)||!Array.isArray(d.slides)||!d.slides.length||d.slides.some(n=>!Number.isInteger(n)||n<1))fail('整套软问题决定缺少唯一标识、规则、理由或适用页');
    if(d?.decision==='needs_decision')fail('整套仍有needs_decision事项，不能用空未解决清单放行');
    if(d)decisionIds.add(d.id);
  }
  const remaining=[];
  for(const p of pages){
    if(!p||typeof p!=='object'){fail('逐页报告必须是对象');continue;}
    const id=`${p.slide}:${p.state}`,state=pack.states.find(s=>s.slide===p.slide&&s.state===p.state);if(!state)continue;
    const finalState=Math.max(...pack.states.filter(s=>s.slide===p.slide).map(s=>s.state)),terminal=p.state===finalState;
    const findings=Array.isArray(p.findings)?p.findings:[],concerns=Array.isArray(p.untouched_concerns)?p.untouched_concerns:[];
    if(!Array.isArray(p.untouched_concerns))fail(`第${id}页缺少原版untouched_concerns清单`);
    for(const f of findings)if(!['hard','soft'].includes(f?.severity))fail(`第${id}页发现缺少有效severity，不能静默视作无问题`);
    for(const [label,items]of [['findings',findings],['untouched_concerns',concerns]]){
      const keys=new Set();for(const f of items){const key=issueKey(f);if(keys.has(key))fail(`第${id}页${label}重复或矛盾事项不能静默合并`);keys.add(key);}
    }
    if(terminal)for(const field of ['readingMode','spacing','pageRole'])if(!text(p.planChecks?.[field]))fail(`第${id}页缺少${field}原版计划上下文的实际核对`);
    for(const f of [...findings,...concerns]){
      if(!f||typeof f!=='object'){fail(`第${id}页问题记录必须为对象`);continue;}
      if(!ruleName(f?.rule)||!text(f?.evidence))fail(`第${id}页问题须有无首尾空白的合法规则与实际证据`);
      if(f&&/^[HS]\d+$/.test(f.rule)&&!known.includes(f.rule))fail(`第${id}页引用未知原版规则${f.rule}`);
      if(hard.includes(f.rule)&&f.severity!==undefined&&f.severity!=='hard')fail(`第${id}页不能把原版${f.rule}降为软问题`);
      if(soft.includes(f.rule)&&f.severity!==undefined&&f.severity!=='soft')fail(`第${id}页${f.rule}须保持原版软规则身份`);
      if(hard.includes(f?.rule))fail(`第${id}页仍有原版硬问题${f.rule}`);
      if(f.severity==='hard'&&!hard.includes(f.rule))fail(`第${id}页仍有明确报告的硬问题${f.rule}`);
      if(f.rule==='STYLE')fail(`第${id}页明确未达到原版STYLE重点，须返回作者/needs_human，不能靠styleChecks.met覆盖`);
      if(f.decision==='needs_decision')fail(`第${id}页仍有needs_decision事项`);
    }
    let checks=p.ruleChecks;
    if(!terminal&&!Array.isArray(checks)){
      const inherited=p.stateReview;
      if(inherited?.baselineState!==finalState||!text(inherited.observation))fail(`第${id}页须实际检查显隐变化，并说明继承末态规则的适用性`);
      // A state-only finding still needs disposition below, even when coverage is inherited.
    }else{
      if(!Array.isArray(checks))checks=[];
      const covered=new Set();
      for(const c of checks){
        if(!c||!Array.isArray(c.rules)||!c.rules.length||!['clear','not_applicable','issue'].includes(c.result)||!text(c.observation)){fail(`第${id}页ruleChecks缺少规则、判断或具体观察/不适用理由`);continue;}
        for(const rule of c.rules){
          if(!known.includes(rule)||covered.has(rule))fail(`第${id}页规则覆盖未知或重复：${rule}`);covered.add(rule);
          const hit=[...findings,...concerns].some(f=>f?.rule===rule);
          if(c.result==='issue'&&!hit)fail(`第${id}页${rule}声明问题却无发现及处置记录`);
          if(c.result!=='issue'&&hit)fail(`第${id}页${rule}覆盖结论与发现矛盾`);
        }
      }
      for(const rule of known)if(!covered.has(rule))fail(`第${id}页未覆盖原版${rule}`);
    }
    const softHits=findings.filter(f=>f?.severity==='soft');
    for(const f of concerns)if(f&&!hard.includes(f.rule)&&!softHits.some(x=>issueKey(x)===issueKey(f)))softHits.push(f);
    if(softHits.length>residualSoftLimit)fail(`第${id}页仍有${softHits.length}处软问题，超过原版允许的${residualSoftLimit}处`);
    for(const f of softHits){
      const decision=concerns.find(c=>issueKey(c)===issueKey(f));
      if(!decision||!['soft-cap reached','ambiguous_design_intent','deck_wide'].includes(decision.reason)||decision.decision!=='retain'||!text(decision.rationale))fail(`第${id}页${f.rule}未说明留存理由及对设计目标的影响`);
      if(decision?.reason==='deck_wide'){
        const d=Array.isArray(deckDecisions)&&deckDecisions.find(x=>x?.id===decision.deckDecisionId);
        if(!d||d.rule!==f.rule||d.decision!=='retain'||!text(d.rationale)||!Array.isArray(d.slides)||!d.slides.includes(p.slide))fail(`第${id}页${f.rule}跨页问题缺少整套统一决定`);
      }
      remaining.push({slide:p.slide,rule:f.rule,evidence:f.evidence,decision});
    }
  }
  // Equal reported conditions on different slides must not be silently accepted
  // independently. Semantic recurrence with different wording remains the viewer's job.
  for(const item of remaining){
    const peers=remaining.filter(x=>x.rule===item.rule&&x.evidence===item.evidence&&x.slide!==item.slide);
    if(peers.length&&(!item.decision?.deckDecisionId||item.decision.reason!=='deck_wide'||peers.some(x=>x.decision?.deckDecisionId!==item.decision.deckDecisionId)))fail(`跨页重复的${item.rule}须一次整套决定，不能逐页分散放行`);
  }
  return [...new Set(errors)];
}

export function assertReviewContext(actual,expected){assert(same(actual,expected),'冻结审阅上下文与原版§I/§V、锁或规则原文不一致');}
