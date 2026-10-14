/** Evidence checks extracted from quality-gate.mjs / validatePilotReview / checkPilot.
 * Pure: callers provide actual file hashes. This does not score design or certify viewing.
 */
export function evaluateReviewEvidence({review,bindings,expectedStates,fileHashes,kind='final'}) {
  const errors=[];
  const fail=m=>errors.push(m),text=v=>typeof v==='string'&&v.trim();
  if(!review||typeof review!=='object')return{pass:false,errors:['缺少独立设计审阅']};
  for(const [key,value]of Object.entries(bindings))if(review[key]!==value)fail(`审阅${key}未绑定当前证据`);
  if(review.status!=='pass')fail('独立设计审阅未通过');
  if(!['human','agent'].includes(review.reviewer?.kind)||!text(review.reviewer?.name)||review.reviewer?.independent!==true)fail('须由有身份记录的独立看图者审阅');
  if(!Number.isFinite(Date.parse(review.reviewedAt||'')))fail('审阅时间无效');
  if('userAccepted'in review||'userApproved'in review)fail('审阅不得冒充用户认可');
  if(!Array.isArray(review.unresolvedIssues)||review.unresolvedIssues.length)fail('整套仍有未解决问题或未列问题清单');
  if(!Array.isArray(review.limitations)||!review.limitations.length||!review.limitations.every(text))fail('须记载静态检查和实际播放的真实边界');
  const deck=review.deckReview;
  for(const field of ['continuity','hierarchy','compositionByJob','referenceComparison'])if(!text(deck?.[field]))fail(`缺少整套设计审阅：${field}`);
  const target=review.designTarget;
  if(target?.status!=='met')fail('设计目标尚未明确达到；缺失或未达标的旧审阅不能直接放行');
  for(const field of ['reference','comparison'])if(!text(target?.[field]))fail(`缺少设计目标的实际参照或比较：${field}`);
  if(!Array.isArray(target?.criteria)||!target.criteria.length||!target.criteria.every(text))fail('设计目标须列出非空的具体判断准则');
  if(!Array.isArray(target?.remainingGaps)||target.remainingGaps.length)fail('设计目标仍有差距或未列差距清单');
  const pages=Array.isArray(review.pages)?review.pages:[],seen=new Set();
  if(pages.length!==expectedStates.length)fail(`审阅须覆盖${expectedStates.length}个有效页面状态`);
  for(const page of pages){
    const identity=`${page.slide}:${page.state}`,wanted=expectedStates.find(p=>p.slide===page.slide&&p.state===page.state);
    if(!wanted||seen.has(identity)){fail(`重复或未计划审阅状态：${identity}`);continue;}seen.add(identity);
    if(page.status!=='pass'||!Array.isArray(page.unresolvedIssues)||page.unresolvedIssues.length)fail(`第${identity}页状态仍有未解决问题`);
    for(const field of ['pageJob','relationships','realization','observations'])if(!text(page[field]))fail(`第${identity}页缺少${field}实际判断`);
    for(const field of ['imagePath','imageHash'])if(!text(page[field]))fail(`第${identity}页缺少${field}`);
    if(fileHashes[page.imagePath]!==page.imageHash||!fileHashes[page.imagePath])fail(`第${identity}页实看图片缺失或哈希已变`);
    if(page.renderSourcePath!==wanted.renderSourcePath||page.renderSourceHash!==wanted.renderSourceHash)fail(`第${identity}页图片来源未绑定本次${kind==='early'?'SVG':'PPTX状态'}`);
    if(fileHashes[wanted.renderSourcePath]!==wanted.renderSourceHash)fail(`第${identity}页渲染源文件已变`);
  }
  return{pass:errors.length===0,errors:[...new Set(errors)],expectedStates:expectedStates.length,
    scope:'仅核当前证据、逐页状态覆盖和独立审阅结论；不自动判定语义、美感、真实观看或用户认可'};
}
