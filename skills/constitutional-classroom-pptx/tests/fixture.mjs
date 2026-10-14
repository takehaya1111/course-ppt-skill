/** Entirely synthetic source, intended only for integration tests; never a design example. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {renderPptx} from '../scripts/lib/rendering.mjs';
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export const json=async(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');

/** New-protocol fixture: real wrapper commands, mocked rendering/viewer only. */
export async function writeEvidenceFixture({project,skillDir,report,run}){
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');
  const runtime={skillDir,run:async(file,args)=>{
    if(file!=='powershell.exe')throw new Error('Fixture expected explicit Office test double');
    const input=args[args.indexOf('-InputPptx')+1],out=args[args.indexOf('-OutputDir')+1],pages=args[args.indexOf('-Pages')+1].split(',').map(Number),slides=[];
    for(const index of pages){const image=path.join(out,`slide-${String(index).padStart(2,'0')}.png`);await fs.writeFile(image,png);slides.push({index,image});}
    await json(path.join(out,'render-report.json'),{input,status:'success',slideCount:report.slides.length,application:'SOFTWARE TEST DOUBLE',version:'test',method:'not actual viewing',slides});return{stdout:'',stderr:''};
  }};
  const request={schema:'course-review-request.v1',authorContextId:'synthetic-author-context',reviewerContextId:'synthetic-fresh-review-context',stateReportPath:report.reportPath,referenceImages:[],states:[]};
  const ref=path.join(project,'SYNTHETIC-reference.png');await fs.writeFile(ref,png);request.referenceImages.push({id:'test-ref',caption:'Synthetic fixture, not a design reference',path:ref,sha256:hash(png)});
  const renders=[];
  for(const s of report.staticStates)renders.push(await renderPptx({runtime,projectDir:project,sourceFile:s.file,backend:'office'}));
  for(const slide of report.slides)for(let state=0;state<=slide.clickGroups.length;state++){
    const render=renders[state],record=render.records.find(r=>r.page===slide.slide);
    request.states.push({slide:slide.slide,state,imagePath:record.image.path,imageHash:record.image.sha256,renderManifestPath:render.manifestFile,renderManifestHash:render.manifestSha256});
  }
  const requestFile=path.join(project,'SYNTHETIC-review-request.json');await json(requestFile,request);
  const made=await run(['review-pack',project,requestFile]),pack=await read(made.reviewPack.path);
  const raw={schema:'course-raw-review.v1',reviewPackHash:made.reviewPack.sha256,reviewer:{kind:'agent',name:'SYNTHETIC TEST FIXTURE NOT ACTUAL VIEWER',contextId:request.reviewerContextId},reviewedAt:new Date().toISOString(),status:'pass',unresolvedIssues:[],limitations:['Software protocol fixture; not real independent review, art validation or delivery'],deckReview:{continuity:'test',hierarchy:'test',compositionByJob:'test',referenceComparison:'test'},designTarget:{...pack.designTarget,status:'met',comparison:'synthetic test only',remainingGaps:[]},pages:pack.states.map(s=>({slide:s.slide,state:s.state,status:'ok',findings:[],needs_human_items:[],design_intent_check:{spec_says:s.specSection,render_delivers:true,note:'synthetic test only'},pageJob:'test',relationships:'test',realization:'test',observations:'test',carrierCheck:'test',referenceComparisons:[{referenceId:'test-ref',observation:'synthetic test only'}],styleChecks:[]}))};
  const rawFile=path.join(project,'SYNTHETIC-raw-review.json');await json(rawFile,raw);
  const dispatch={schema:'course-review-dispatch.v1',reviewPackHash:made.reviewPack.sha256,authorContextId:request.authorContextId,reviewerContextId:request.reviewerContextId,host:'TEST DOUBLE',method:'TEST ONLY',invocationId:'test-call-id',dispatchedAt:new Date().toISOString(),contextIsolation:'fresh'};
  const sent=path.join(project,'SYNTHETIC-host-dispatch.txt'),received=path.join(project,'SYNTHETIC-host-response.txt');
  await fs.writeFile(sent,`SYNTHETIC TEST ONLY\n${dispatch.invocationId}\n${dispatch.reviewerContextId}\n${dispatch.reviewPackHash}`);
  await fs.writeFile(received,`SYNTHETIC TEST ONLY\n${dispatch.reviewerContextId}\n${hash(await fs.readFile(rawFile))}`);
  dispatch.sourceEvidence={dispatch:{path:sent,sha256:hash(await fs.readFile(sent))},response:{path:received,sha256:hash(await fs.readFile(received))}};
  const dispatchFile=path.join(project,'SYNTHETIC-dispatch.json');await json(dispatchFile,dispatch);
  await run(['review-import',project,rawFile,dispatchFile]);return{request,requestFile,rawFile,dispatchFile,renders};
}
export async function writeFixture(project,skillDir,{pages=2,authored=pages}={}){
  for(const dir of ['sources','svg_output','notes','images','templates','validation','exports'])await fs.mkdir(path.join(project,dir),{recursive:true});
  const paragraphs=Array.from({length:pages},(_,i)=>`Synthetic source paragraph ${i+1}. This is software test input, not course material.`);
  const source=paragraphs.join('\n\n')+'\n';await fs.writeFile(path.join(project,'sources/synthetic.md'),source);
  const stems=paragraphs.map((_,i)=>`${String(i+1).padStart(2,'0')}_synthetic`);
  const contract={version:1,title:'Synthetic software test',sources:[{id:'test',kind:'synthetic test',path:'sources/synthetic.md',sha256:hash(source)}],assets:[],requireFullScriptCoverage:['test'],slides:stems.map((stem,i)=>({stem,clicks:1,noteParagraphs:[{sourceId:'test',indices:[i+1]}],requiredText:[`Test page ${i+1}`]}))};
  await json(path.join(project,'course-project.json'),contract);
  const lock=`<!-- ppt-master-schema: spec-lock/v1 -->
# Execution Lock
## canvas
- viewBox: 0 0 1280 720
- format: ppt169
## communication
- primary_language: en
- audience: software test runner
- objective: verify the export chain
- core_message: synthetic export test
- consumption_mode: presentation
## mode
- mode: instructional
## visual_style
- visual_style: editorial
## colors
- bg: #FFFFFF
- primary: #202C35
- accent: #A02B2D
- text: #202C35
## typography
- font_family: Arial
- title_family: Arial
- body_family: Arial
- body: 28
- title: 44
## icons
- library: none
- inventory: none
## page_rhythm
${stems.map((_,i)=>`- P${String(i+1).padStart(2,'0')}: dense`).join('\n')}
## pptx_structure
- mode: flat
## forbidden
- \`mask\`, \`<style>\`, \`class\`, external CSS, \`<foreignObject>\`, \`textPath\`, \`@font-face\`, \`<animate*>\`, \`<set>\`, \`<script>\` / event attributes, \`<iframe>\`
- HTML named entities in text; write typography as raw Unicode and escape XML reserved characters
`;
  await fs.writeFile(path.join(project,'spec_lock.md'),lock);
  let spec=await fs.readFile(path.join(skillDir,'vendor/ppt-master/skills/ppt-master/templates/scaffolds/design_spec.md'),'utf8');
  spec=spec.replaceAll('{{PROJECT_NAME}}','Synthetic export test').replaceAll('{{CANVAS_NAME}}','ppt169').replaceAll('{{CANVAS_DIMENSIONS}}','1280 × 720').replaceAll('{{VIEWBOX}}','0 0 1280 720').replaceAll('{{CREATED_DATE}}','2026-01-01');
  const table={
    'Page Count':String(pages),'Target Audience':'software test runner','Communication Intent':'verify the export chain','Desired Audience Outcome':'verify the export chain','Core Message / Ask / Action':'synthetic export test','Delivery Context':'automated integration test','Artifact Afterlife':'temporary test output','Reading Mode':'presentation','Content Strategy':'synthetic test text','Design Style':'editorial','AI Image Acquisition Path':'not applicable','Generation Mode':'continuous','Spec Refinement':'disabled — synthetic fixture','Speaker Notes':'enabled — software test','Custom Animations':'enabled — software test','Narration Audio':'disabled — no audio',
    'Background':'#FFFFFF | test background','Primary':'#202C35 | test text','Accent':'#A02B2D | test accent','Body text':'#202C35 | test text','Body':'28','Page title':'44','Subtitle':'32','Annotation':'20','Footnote':'16'
  };
  spec=spec.replace(/^\| ([^|]+) \| .+\|$/gm,(line,label)=>Object.hasOwn(table,label)?`| ${label} | ${table[label]} |`:line);
  spec=spec.replace('- **Mode**: [fill]','- **Mode**: instructional').replace('- **Visual style**: [fill]','- **Visual style**: editorial');
  spec=spec.replace(/\| Title \| \[fill\].+\|/,'| Title | test | Arial | Arial | Arial |').replace(/\| Body \| 28 \|/,'| Body | 28 |');
  spec=spec.replace(/\| Body \| \[fill\].+\|/,'| Body | test | Arial | Arial | Arial |');
  // The scaffold contains both a Body font-plan row and a Body size row.
  const fontPlanStart=spec.indexOf('### Font Plan'),fontPlanEnd=spec.indexOf('### Font Size Hierarchy');
  spec=spec.slice(0,fontPlanStart)+spec.slice(fontPlanStart,fontPlanEnd).replace('| Body | 28 |','| Body | test | Arial | Arial | Arial |')+spec.slice(fontPlanEnd);
  spec=spec.replace('- **Title stack**: [fill]','- **Title stack**: Arial').replace('- **Body stack**: [fill]','- **Body stack**: Arial');
  spec=spec.replace(/## IX\. Content Outline[\s\S]*?## X\. Speaker Notes Requirements/,`## IX. Content Outline\n\n### Part 1: Synthetic test\n\n${stems.map((_,i)=>`#### Slide ${String(i+1).padStart(2,'0')} - Test page ${i+1}\n\n- **Audience move**: inspect synthetic text\n- **Composition**: title and one revealed statement\n- **Title**: Test page ${i+1}\n- **Core message**: synthetic export test\n- **Content**: software fixture only\n- **Relationships**: title names one revealed statement; no factual relationship is asserted\n`).join('\n')}\n## X. Speaker Notes Requirements`);
  spec=spec.replace('- **Generation**: [fill enabled or disabled]','- **Generation**: enabled').replace(/\[fill[^\]]*\]/g,'synthetic software test');
  await fs.writeFile(path.join(project,'design_spec.md'),spec);
  await json(path.join(project,'animations.json'),{version:1,defaults:{transition:{effect:'fade',duration:0.3},animation:{effect:'none',trigger:'on-click',duration:0.2}},slides:Object.fromEntries(stems.map(stem=>[stem,{groups:{reveal:{effect:'entrance_fade',order:1,trigger:'on-click'}}}]))});
  for(let i=0;i<authored;i++){
    await fs.writeFile(path.join(project,`svg_output/${stems[i]}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/><text x="64" y="112" font-family="Arial" font-size="44" fill="#202C35">Test page ${i+1}</text><g id="reveal"><text x="64" y="240" font-family="Arial" font-size="28" fill="#202C35">Synthetic export test</text></g></svg>`);
    await fs.writeFile(path.join(project,`notes/${stems[i]}.md`),paragraphs[i]+'\n');
  }
  return contract;
}
