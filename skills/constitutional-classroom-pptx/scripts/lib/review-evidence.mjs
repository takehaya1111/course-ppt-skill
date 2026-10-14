/** Validate a raw isolated-context review against a previously frozen factual pack.
 * Disk/provenance checks happen in review-package; this function never scores art.
 */
import {evaluatePolicyEvidence} from './review-policy.mjs';
export function evaluateReviewEvidence({review,pack,packHash}){
  const errors=[],fail=m=>errors.push(m),text=v=>typeof v==='string'&&v.trim(),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const normalizeBlock=v=>typeof v==='string'?v.replace(/\r\n?/g,'\n').trim():null;
  if(!pack||pack.schema!=='course-review-pack.v1')return{pass:false,errors:['缺少程序冻结的真实审阅包；旧版自填pass/independent不能沿用']};
  if(!review||review.schema!=='course-raw-review.v1')return{pass:false,errors:['缺少独立上下文原始逐页报告']};
  errors.push(...evaluatePolicyEvidence({review,pack}));
  if(review.reviewPackHash!==packHash)fail('原始审阅未绑定当前派发包');
  if(review.status!=='pass')fail('独立设计审阅未通过');
  if(!['agent','human'].includes(review.reviewer?.kind)||!text(review.reviewer?.name)||review.reviewer?.contextId!==pack.reviewerContextId||review.reviewer?.contextId===pack.authorContextId)fail('审阅上下文不独立或不属于实际指派');
  if(!Number.isFinite(Date.parse(review.reviewedAt||'')))fail('审阅时间无效');
  if('userAccepted'in review||'userApproved'in review)fail('审阅不得冒充用户认可');
  if(!Array.isArray(review.unresolvedIssues)||review.unresolvedIssues.length)fail('整套仍有未解决问题或未列问题清单');
  if(!Array.isArray(review.limitations)||!review.limitations.length||!review.limitations.every(text))fail('须记载静态检查和实际播放的真实边界');
  for(const field of ['continuity','hierarchy','compositionByJob','referenceComparison'])if(!text(review.deckReview?.[field]))fail(`缺少整套设计审阅：${field}`);
  const target=review.designTarget;
  if(target?.status!=='met')fail('设计目标尚未达到，不能以无溢出代替专业表达');
  if(target?.specQuote!==pack.designTarget.specQuote||!same(target?.criteria,pack.designTarget.criteria))fail('设计目标漂移：审阅不得改写派发时冻结的目标或准则');
  if(!text(target?.comparison))fail('缺少对真实参照图的具体比较');
  if(!Array.isArray(target?.remainingGaps)||target.remainingGaps.length)fail('设计目标仍有差距或未列差距清单');
  const pages=Array.isArray(review.pages)?review.pages:[],seen=new Set();
  if(pages.length!==pack.states.length)fail(`审阅须覆盖${pack.states.length}个有效页面状态`);
  for(const p of pages){
    if(!p||typeof p!=='object'){fail('逐页报告必须是对象');continue;}
    const id=`${p.slide}:${p.state}`,wanted=pack.states.find(s=>s.slide===p.slide&&s.state===p.state);
    if(!wanted||seen.has(id)){fail(`重复或未计划审阅状态：${id}`);continue;}seen.add(id);
    // Review is read-only: fixed cannot bypass re-rendering and re-dispatch.
    if(p.status!=='ok'||!Array.isArray(p.findings)||p.findings.some(f=>f?.severity==='hard')||!Array.isArray(p.needs_human_items)||p.needs_human_items.length)fail(`第${id}页未通过原版逐页审阅或仍需人工处理`);
    for(const f of ['pageJob','relationships','realization','observations'])if(!text(p[f]))fail(`第${id}页缺少${f}实际判断`);
    const intent=p.design_intent_check;
    if(!text(intent?.spec_says)||normalizeBlock(wanted.specSection)!==normalizeBlock(intent.spec_says)||intent.render_delivers!==true||!text(intent.note))fail(`第${id}页未兑现既定§IX任务与关系，或design_intent_check未完整引用本页冻结页卡`);
    if(p.state===Math.max(...pack.states.filter(s=>s.slide===p.slide).map(s=>s.state))){
      if(!text(p.carrierCheck))fail(`第${id}页缺少carrierCheck实际载体判断`);
      if(!Array.isArray(p.referenceComparisons)||!p.referenceComparisons.length||p.referenceComparisons.some(r=>!pack.references.some(x=>x.id===r.referenceId)||!text(r.observation)))fail(`第${id}页缺少真实参照图比较`);
      for(const focus of pack.styleFocus||[])if(!p.styleChecks?.some(c=>c.path===focus.path&&text(c.observation)&&c.met===true))fail(`第${id}页缺少或未达到原版STYLE观察`);
    }
  }
  return{pass:errors.length===0,errors:[...new Set(errors)],expectedStates:pack.states.length,scope:'核当前文件绑定、原版逐页报告和隔离上下文记录；不自动判定语义、美感、真实观看、反伪造或用户认可'};
}
