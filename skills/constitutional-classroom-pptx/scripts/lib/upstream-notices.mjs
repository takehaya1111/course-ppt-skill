/** Surface the unchanged upstream advisory without promoting it to a gate or
 * executing the suggested source rewrite. Adapted from the WB handoff. */
import path from 'node:path';

export function authoringAdvisories(report,{python,official,project,reportPath}){
  const issues=(report.categories?.introduced?.issues||[]).filter(issue=>
    /Noncanonical compact authoring:/i.test(typeof issue==='string'?issue:issue?.message||''));
  const files=[...new Set(issues.map(issue=>typeof issue==='object'?issue.file:null).filter(Boolean))];
  const messages=issues.map(issue=>typeof issue==='string'?issue:issue.message);
  const actions=[];
  // Only project the two commands actually named by the upstream report.
  // Structured templates may explicitly request keeping their authoring form.
  for(const script of ['compact_svg_styles.py','compact_svg_coordinates.py'])if(messages.some(message=>message.includes(script))){
    actions.push({file:python,args:[path.join(official,'scripts',script),path.join(project,'svg_output'),'--inplace',...(script==='compact_svg_coordinates.py'?['--keep-native-frames']:[])]});
  }
  return {severity:'advisory',issueCount:issues.length,affectedFileCount:files.length,files,issues,reportPath,
    note:'这是作者稿紧凑写法提示，不是版面或审美失败；原版允许保留显式写法。程序不自动改稿。',
    optionalNormalization:actions.length?{
      commands:actions,
      after:'若自行采用：含Chart/Table回退的页面须按原版重新生成对应标记，再重跑最终检查和build；不能沿用修改前的产物/审阅。'
    }:null};
}
