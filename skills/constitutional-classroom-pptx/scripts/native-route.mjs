/** Course adapter for the intact PPT Master ca04346 distribution (MIT).
 * Does not generate designs or replace the official SVG/native compiler.
 * Click inspection/static copies adapt tools/pptmaster-runtime/check-course-artifact.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import xmljs from 'xml-js';
import {runStageCommand, assertBuildStages, collectProductionInputs, finishBuildRecord,finishStatesRecord,validateOriginalDesign} from './native-stages.mjs';
import {createEnvironment as environment} from './lib/environment.mjs';
import {renderPptx,renderSvgPreview} from './lib/rendering.mjs';
import {authoringAdvisories} from './lib/upstream-notices.mjs';

const require=createRequire(import.meta.url);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const save=async(p,x)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});};
const exists=async p=>{try{await fs.access(p);return true;}catch{return false;}};
const assert=(yes,message)=>{if(!yes)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sort=a=>[...a].sort();
const normalize=s=>s.replace(/\r\n/g,'\n').trim();
const parse=s=>xmljs.xml2js(s,{compact:false});
const walk=(n,p,out=[])=>{if(p(n))out.push(n);for(const c of n.elements||[])walk(c,p,out);return out;};
const child=(n,name)=>(n?.elements||[]).find(e=>e.name===name);
const first=(n,name)=>walk(n,e=>e.name===name)[0];
const elements=n=>(n?.elements||[]).filter(e=>e.type==='element');
const texts=n=>walk(n,e=>e.name==='a:t').map(e=>(e.elements||[]).filter(c=>c.type==='text').map(c=>c.text).join('')).join('');
const objectTypes=new Set(['p:sp','p:pic','p:cxnSp','p:graphicFrame','p:grpSp']);

// Validate the small, explicitly supported JSON Schema vocabulary without adding a new dependency.
function validateSchema(value,schema,document,at='$'){
  if(schema.$ref){assert(schema.$ref.startsWith('#/'),'Only local schema refs supported');schema=schema.$ref.slice(2).split('/').reduce((n,k)=>n[k],document);}
  if('const'in schema)assert(value===schema.const,`${at} 必须为 ${schema.const}`);
  if(schema.type){const ok=schema.type==='array'?Array.isArray(value):schema.type==='integer'?Number.isInteger(value):schema.type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):typeof value===schema.type;assert(ok,`${at} 类型应为 ${schema.type}`);}
  if(typeof value==='string'){
    if(schema.minLength!==undefined)assert(value.length>=schema.minLength,`${at} 不得为空`);
    if(schema.pattern)assert(new RegExp(schema.pattern).test(value),`${at} 格式无效`);
  }
  if(typeof value==='number'&&schema.minimum!==undefined)assert(value>=schema.minimum,`${at} 数值小于下限`);
  if(Array.isArray(value)){
    if(schema.minItems!==undefined)assert(value.length>=schema.minItems,`${at} 条目不足`);
    if(schema.uniqueItems)assert(new Set(value.map(v=>JSON.stringify(v))).size===value.length,`${at} 含重复项`);
    if(schema.items)value.forEach((v,i)=>validateSchema(v,schema.items,document,`${at}[${i}]`));
  }else if(value&&typeof value==='object'){
    for(const key of schema.required||[])assert(Object.hasOwn(value,key),`${at}.${key} 缺失`);
    for(const [key,v]of Object.entries(value)){
      if(schema.additionalProperties===false)assert(Object.hasOwn(schema.properties||{},key),`${at}.${key} 是未声明字段`);
      if(schema.properties?.[key])validateSchema(v,schema.properties[key],document,`${at}.${key}`);
    }
  }
}

async function localFile(project,relative){
  assert(typeof relative==='string'&&relative&&!path.isAbsolute(relative),'需要项目内相对路径');
  const target=path.resolve(project,relative),rel=path.relative(project,target);
  assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),`路径越过课程工程：${relative}`);
  const actual=await fs.realpath(target),actualRel=path.relative(await fs.realpath(project),actual);
  assert(actualRel&&!actualRel.startsWith('..')&&!path.isAbsolute(actualRel),`链接越过课程工程：${relative}`);
  return actual;
}

async function doctor(runtime){
  const {config,lock,run,python}=runtime;
  assert(Number(process.versions.node.split('.')[0])>=lock.nodeMinimumMajor,`Node.js 需要${lock.nodeMinimumMajor}或更高版本`);
  const dependencies={};
  for(const name of ['jszip','xml-js']){
    const found=await read(require.resolve(`${name}/package.json`));
    assert(found.version===lock.packages[name],`${name}版本漂移：${found.version}`);dependencies[name]=found.version;
  }
  await python('attribution_guard.py');
  for(const relative of ['scripts/project_manager.py','scripts/svg_quality_checker.py','scripts/finalize_svg.py','scripts/animation_config.py','scripts/total_md_split.py','scripts/svg_to_pptx.py','scripts/svg_to_pptx/pptx_package/builder.py','scripts/svg_to_pptx/drawingml/converter.py'])assert(await exists(path.join(runtime.official,relative)),`官方完整分发缺文件：${relative}`);
  const version=await run(config.executable,['-c',"import json,importlib.metadata as m; import pptx,PIL,lxml,xlsxwriter,openpyxl; print(json.dumps({n:m.version(n) for n in ['python-pptx','Pillow','lxml','XlsxWriter','openpyxl']}))"]);
  const packages=JSON.parse(version.stdout.trim());
  for(const [name,expected]of Object.entries(config.packages))assert(packages[name]===expected,`Python依赖版本漂移：${name}`);
  return{status:'PASS',node:process.versions.node,python:config.executable,packages,dependencies,officeCli:runtime.officeCli,optionalDependencies:{pdfRendering:{status:'NOT_CHECKED',packages:lock.optionalPythonPackages?.pdfRendering||{},install:'node scripts/setup.mjs --pdf-rendering',note:'仅实际LibreOffice→PDFium分支验证；核心通过不代表可选渲染已配置。'}},officialCommit:lock.officialCommit,integrity:'official attribution guard + required core files + dependency versions',limitations:['归属检查不等于逐个源码文件的密码学校验。','OfficeCLI 为可选附加格式检查；SKIPPED 不表示该项通过。','环境可用不等于设计、视觉或真实放映通过。']};
}

// Call the upstream converter itself rather than guessing Markdown-to-notes behavior.
async function plainNotes(runtime,files){
  const code="import sys,json,pathlib; sys.path.insert(0,sys.argv[1]); from svg_to_pptx.pptx_package.notes import markdown_to_plain_text; print(json.dumps([markdown_to_plain_text(pathlib.Path(p).read_text(encoding='utf-8-sig')) for p in sys.argv[2:]],ensure_ascii=False))";
  const result=await runtime.run(runtime.config.executable,['-c',code,path.join(runtime.official,'scripts'),...files]);
  return JSON.parse(result.stdout.trim());
}

async function plainSourceParagraphs(runtime,files){
  const code="import sys,json,pathlib,re; sys.path.insert(0,sys.argv[1]); from svg_to_pptx.pptx_package.notes import markdown_to_plain_text; print(json.dumps([[markdown_to_plain_text(p) for p in re.split(r'\\n\\s*\\n',pathlib.Path(f).read_text(encoding='utf-8-sig').strip())] for f in sys.argv[2:]],ensure_ascii=False))";
  return JSON.parse((await runtime.run(runtime.config.executable,['-c',code,path.join(runtime.official,'scripts'),...files])).stdout.trim());
}

export async function validateNativeProject(project,runtime,{mode='complete'}={}){
  project=await fs.realpath(project);
  const contractPath=await localFile(project,'course-project.json'),c=await read(contractPath);
  const schema=await read(path.join(runtime.skillDir,'references/native-contract.schema.json'));validateSchema(c,schema,schema);
  assert(c.version===1&&typeof c.title==='string'&&c.title.trim(),'course-project.json 需要 version:1 与非空 title');
  assert(Array.isArray(c.sources)&&c.sources.length&&Array.isArray(c.assets)&&Array.isArray(c.slides)&&c.slides.length,'需要非空 sources/slides 和 assets 数组（可为空）');
  const sourceMap=new Map(),assetMap=new Map(),stems=new Set();
  for(const item of c.sources){
    assert(item.id&&!sourceMap.has(item.id)&&item.kind&&/^[a-f0-9]{64}$/i.test(item.sha256),'来源id/kind/hash缺失或重复');
    const file=await localFile(project,item.path),bytes=await fs.readFile(file);
    assert(hash(bytes)===item.sha256.toLowerCase(),`冻结来源已改变：${item.id}；不得自动更新hash`);
    sourceMap.set(item.id,{...item,file,paragraphs:normalize(bytes.toString('utf8').replace(/^\uFEFF/,'' )).split(/\n\s*\n/u)});
  }
  for(const slide of c.slides){
    assert(typeof slide.stem==='string'&&/^[^./\\][^/\\]*$/.test(slide.stem)&&!stems.has(slide.stem),'页stem无效/重复');stems.add(slide.stem);
    assert(Number.isInteger(slide.clicks)&&slide.clicks>=0,`点击数必须是非负整数：${slide.stem}`);
    assert(slide.requiredText===undefined||(Array.isArray(slide.requiredText)&&slide.requiredText.every(s=>typeof s==='string'&&s.length)),`requiredText须为非空字串数组：${slide.stem}`);
    assert(slide.noteParagraphs===undefined||Array.isArray(slide.noteParagraphs),`noteParagraphs须为数组：${slide.stem}`);
    for(const assignment of slide.noteParagraphs||[]){
      const source=sourceMap.get(assignment.sourceId);
      assert(source&&Array.isArray(assignment.indices)&&assignment.indices.length,`无效口播段落分配：${slide.stem}`);
      assert(new Set(assignment.indices).size===assignment.indices.length&&assignment.indices.every(index=>Number.isInteger(index)&&index>=1&&index<=source.paragraphs.length),`重复或越界口播段号：${slide.stem}`);
    }
    if(mode==='plan')continue;
    if(mode==='partial'&&!await exists(path.join(project,`svg_output/${slide.stem}.svg`)))continue;
    if(mode==='complete'){
      slide.noteFile=await localFile(project,`notes/${slide.stem}.md`);slide.noteRaw=normalize(await fs.readFile(slide.noteFile,'utf8'));
      assert(slide.noteRaw,`缺少逐页教师备注：${slide.stem}`);
    }
    const svg=await localFile(project,`svg_output/${slide.stem}.svg`),svgDom=parse(await fs.readFile(svg,'utf8'));
    slide.svgFile=svg;slide.imageRefs=walk(svgDom,n=>n.name==='image').map(n=>n.attributes?.href||n.attributes?.['xlink:href']);
    const sourceText=walk(svgDom,n=>n.type==='text'||n.type==='cdata').map(n=>n.text??n.cdata).join('');
    for(const literal of slide.requiredText||[])assert(sourceText.includes(literal),`源稿未包含受控字面内容：${slide.stem} / ${literal}`);
    for(const assignment of slide.noteParagraphs||[]){
      const source=sourceMap.get(assignment.sourceId);
      assert(source&&Array.isArray(assignment.indices)&&assignment.indices.length,`无效口播段落分配：${slide.stem}`);
      assert(new Set(assignment.indices).size===assignment.indices.length,`重复段号：${slide.stem}`);
      for(const index of assignment.indices){assert(Number.isInteger(index)&&index>=1&&index<=source.paragraphs.length,`口播段号越界：${slide.stem}/${index}`);if(mode==='complete')assert(slide.noteRaw.includes(source.paragraphs[index-1]),`冻结第${index}段未全文进入源备注：${slide.stem}`);}
    }
  }
  const actual=await exists(path.join(project,'svg_output'))?(await fs.readdir(path.join(project,'svg_output'))).filter(n=>n.endsWith('.svg')).sort().map(n=>n.slice(0,-4)):[];
  assert(same([...stems].sort(),[...stems]),'计划slides必须按SVG文件名顺序排列');
  if(mode==='complete')assert(same(actual,c.slides.map(s=>s.stem)),`实际SVG页序/页数与slides不符：${JSON.stringify(actual)}`);
  else assert(actual.every(s=>stems.has(s)),`实际SVG含未计划页：${JSON.stringify(actual)}`);
  assert(c.requireFullScriptCoverage===undefined||Array.isArray(c.requireFullScriptCoverage),'requireFullScriptCoverage须为sourceId数组');
  for(const id of c.requireFullScriptCoverage||[]){
    const src=sourceMap.get(id);assert(src,`全稿覆盖要求引用未知来源：${id}`);
    const indices=c.slides.flatMap(s=>(s.noteParagraphs||[]).filter(p=>p.sourceId===id).flatMap(p=>p.indices));
    assert(same([...indices].sort((a,b)=>a-b),src.paragraphs.map((_,i)=>i+1)),`逐字稿未恰好分配一次：${id}`);
  }
  for(const a of c.assets){
    assert(a.id&&!assetMap.has(a.id)&&a.kind&&a.sourceUrl&&/^[a-f0-9]{64}$/i.test(a.sha256),'图片id/kind/sourceUrl/hash缺失或重复');
    assert(a.exactBytes===undefined||a.exactBytes===true,'当前路线要求exactBytes=true；如需裁切，登记裁切后的实际嵌入文件及其来源');
    assert(Array.isArray(a.slides)&&a.slides.length&&a.slides.every(s=>stems.has(s))&&new Set(a.slides).size===a.slides.length,`图片页绑定无效：${a.id}`);
    const file=await localFile(project,a.path);assert(hash(await fs.readFile(file))===a.sha256.toLowerCase(),`图片已改变：${a.id}`);assetMap.set(a.id,{...a,file});
  }
  for(const slide of c.slides.filter(s=>s.svgFile)){
    const used=new Set();
    for(const href of slide.imageRefs){
      assert(typeof href==='string'&&href,`空图片引用：${slide.stem}`);let digest;
      if(/^data:image\/[^;,]+;base64,/.test(href))digest=hash(Buffer.from(href.slice(href.indexOf(',')+1),'base64'));
      else{
        assert(!/^[a-z]+:/i.test(href)&&!path.isAbsolute(href),`源稿图片必须为本工程相对路径或已登记data URI：${slide.stem}`);
        const relative=path.relative(project,path.resolve(path.dirname(slide.svgFile),href));digest=hash(await fs.readFile(await localFile(project,relative)));
      }
      const matches=[...assetMap.values()].filter(a=>a.sha256.toLowerCase()===digest&&a.slides.includes(slide.stem));assert(matches.length,`源稿图片未登记字节及使用页：${slide.stem}`);matches.forEach(a=>used.add(a.id));
    }
    for(const a of assetMap.values())if(a.slides.includes(slide.stem))assert(used.has(a.id),`登记图片未出现在源稿：${slide.stem}/${a.id}`);
  }
  assert(c.export===undefined||(typeof c.export==='object'&&c.export!==null&&(c.export.nativeChartsAndTables===undefined||typeof c.export.nativeChartsAndTables==='boolean')),'export.nativeChartsAndTables须为布尔值');
  const authored=c.slides.filter(s=>s.noteFile),notePlain=authored.length?await plainNotes(runtime,authored.map(s=>s.noteFile)):[];
  authored.forEach((s,i)=>{s.notePlain=normalize(notePlain[i]);assert(s.notePlain,`备注转换后为空：${s.stem}`);});
  const referenced=[...new Set(c.slides.flatMap(s=>(s.noteParagraphs||[]).map(p=>p.sourceId)))];
  const plainParagraphs=await plainSourceParagraphs(runtime,referenced.map(id=>sourceMap.get(id).file));referenced.forEach((id,i)=>sourceMap.get(id).plainParagraphs=plainParagraphs[i]);
  return{project,contract:c,contractSha256:hash(await fs.readFile(contractPath)),sourceMap,assetMap};
}

function readClicks(page){
  const tree=first(page,'p:spTree');assert(tree,'Missing slide shape tree');
  const objects=elements(tree).filter(n=>objectTypes.has(n.name)).map(n=>({node:n,type:n.name,...first(n,'p:cNvPr')?.attributes}));
  assert(!objects.some(o=>!o.id||!o.name)&&new Set(objects.map(o=>o.id)).size===objects.length,'Missing/duplicate top-level object identity');
  const allIds=new Set(walk(tree,n=>n.name==='p:cNvPr').map(n=>n.attributes.id)),timing=first(page,'p:timing');
  const missingTargets=walk(timing||{},n=>n.name==='p:spTgt').map(n=>n.attributes.spid).filter(id=>!allIds.has(id));
  const mains=walk(timing||{},n=>n.name==='p:cTn'&&n.attributes?.nodeType==='mainSeq'),allEffects=walk(timing||{},n=>n.name==='p:cTn'&&n.attributes?.presetClass);
  assert(mains.length===1||!allEffects.length,'Effects do not belong to one main sequence');
  if(!mains.length)return{objects,groups:[],missingTargets,effectCount:0};
  const seen=new Set(),collected=new Set();
  const groups=elements(child(mains[0],'p:childTnLst')).map((group,index)=>{
    assert(group.name==='p:par'&&child(child(child(group,'p:cTn'),'p:stCondLst'),'p:cond')?.attributes?.delay==='indefinite',`Click bucket ${index+1} is not waiting for a click`);
    const effects=walk(group,n=>n.name==='p:cTn'&&n.attributes?.presetClass);assert(effects.length,'Empty click bucket');
    const targets=effects.map((effect,j)=>{
      collected.add(effect);const a=effect.attributes;
      assert(a.presetClass==='entr'&&a.presetID==='10'&&a.nodeType===(j===0?'clickEffect':'withEffect'),`Only click-led fade groups supported (${index+1})`);
      const filters=walk(effect,n=>n.name==='p:animEffect');assert(filters.length===1&&filters[0].attributes.filter==='fade'&&filters[0].attributes.transition==='in','Only native entrance fade is allowed');
      assert(!walk(effect,n=>['p:anim','p:animMotion','p:animRot','p:animScale','p:animClr','p:cmd','p:audio','p:video'].includes(n.name)).length,'Additional animation behavior found');
      const targetNodes=walk(effect,n=>n.name==='p:spTgt'),ids=[...new Set(targetNodes.map(n=>n.attributes.spid))];assert(ids.length===1&&!targetNodes.some(n=>elements(n).length),'Effect must target one whole object/group');
      const object=objects.find(o=>o.id===ids[0]);assert(object,`Missing/non-top-level target ${ids[0]}`);
      assert(!seen.has(object.id),`Repeated entrance ${object.name}`);seen.add(object.id);
      return{id:object.id,name:object.name,type:object.type,trigger:a.nodeType,effect:'entrance_fade'};
    });return{click:index+1,targets};
  });
  assert(collected.size===allEffects.length,'Effects found outside click sequence');
  return{objects,groups,missingTargets,effectCount:allEffects.length};
}

async function artifact(projectData,pptx,runtime,reportDir,makeStates=false){
  const {contract:c,project,assetMap,sourceMap}=projectData;
  const bytes=await fs.readFile(pptx),zip=await JSZip.loadAsync(bytes),cache=new Map();
  const dom=async p=>{if(!cache.has(p)){assert(zip.file(p),`Missing package part ${p}`);cache.set(p,parse(await zip.file(p).async('string')));}return cache.get(p);};
  const relationships=async part=>{const p=path.posix.join(path.posix.dirname(part),'_rels',path.posix.basename(part)+'.rels');if(!zip.file(p))return[];return walk(await dom(p),n=>n.name==='Relationship').map(n=>({...n.attributes,resolved:n.attributes.TargetMode==='External'?null:n.attributes.Target.startsWith('/')?n.attributes.Target.slice(1):path.posix.normalize(path.posix.join(path.posix.dirname(part),n.attributes.Target))}));};
  const checks=[],check=(name,pass,details)=>checks.push({name,pass:Boolean(pass),details});
  const pres=await dom('ppt/presentation.xml'),presRels=await relationships('ppt/presentation.xml');
  const slideParts=walk(pres,n=>n.name==='p:sldId').map(n=>presRels.find(r=>r.Id===n.attributes['r:id'])?.resolved);
  check('实际页数',slideParts.length===c.slides.length,{actual:slideParts.length,expected:c.slides.length});
  const slides=[];
  for(const [i,part]of slideParts.entries()){
    const page=await dom(part),spec=c.slides[i],rels=await relationships(part),notesRel=rels.filter(r=>r.Type.endsWith('/notesSlide'));
    check(`第${i+1}页备注关系`,notesRel.length===1&&zip.file(notesRel[0]?.resolved),notesRel.map(r=>r.resolved));
    const notes=notesRel.length===1?await dom(notesRel[0].resolved):{};
    const noteText=normalize(walk(notes,n=>n.name==='p:sp'&&walk(n,p=>p.name==='p:ph'&&p.attributes?.type==='body').length).flatMap(n=>walk(n,p=>p.name==='a:p').map(texts)).join('\n'));
    check(`第${i+1}页备注全文`,spec&&noteText===spec.notePlain,{expectedStem:spec?.stem,actualChars:noteText.length,expectedChars:spec?.notePlain.length});
    let click={objects:[],groups:[],missingTargets:[],effectCount:0};
    try{click=readClicks(page);}catch(e){check(`第${i+1}页动画语义`,false,e.message);}
    check(`第${i+1}页点击次数`,spec&&click.groups.length===spec.clicks,{expected:spec?.clicks,actual:click.groups.length,groups:click.groups});
    check(`第${i+1}页动画引用闭合`,click.missingTargets.length===0,click.missingTargets);
    const transitions=walk(page,n=>n.name==='p:transition');
    check(`第${i+1}页仅简单转场且无自动翻页`,transitions.every(t=>!t.attributes?.advTm&&elements(t).every(e=>e.name==='p:fade')),transitions.map(t=>t.attributes));
    const visible=walk(page,n=>n.name==='a:p').map(texts).join('\n');
    for(const literal of spec?.requiredText||[])check(`第${i+1}页受控原文：${literal}`,visible.replace(/\n/g,'').includes(literal.replace(/\n/g,'')),{literal});
    const nativeText=walk(page,n=>n.name==='p:sp'&&walk(n,p=>p.name==='a:t').length).length;
    check(`第${i+1}页保有原生文字`,nativeText>0,{nativeText});
    for(const assignment of spec?.noteParagraphs||[])for(const index of assignment.indices){const p=sourceMap.get(assignment.sourceId).plainParagraphs[index-1];check(`第${i+1}页冻结口播${assignment.sourceId}:${index}`,noteText.includes(p),{sourceId:assignment.sourceId,index});}
    // A media relationship may outlive the picture. Only count actual picture objects,
    // including group descendants, whose embedded blip resolves to an image part.
    const pictureReferences=[];
    const findPictures=node=>{
      if(objectTypes.has(node.name)&&['1','true'].includes(first(node,'p:cNvPr')?.attributes?.hidden))return;
      if(node.name==='p:pic')for(const blip of walk(node,n=>n.name==='a:blip')){
        const id=blip.attributes?.['r:embed'],rel=rels.find(r=>r.Id===id&&r.Type.endsWith('/image')&&r.TargetMode!=='External');
        pictureReferences.push({objectId:first(node,'p:cNvPr')?.attributes?.id,relationshipId:id,part:rel?.resolved,valid:Boolean(id&&rel?.resolved&&zip.file(rel.resolved))});
      }
      for(const nested of node.elements||[])findPictures(nested);
    };findPictures(first(page,'p:spTree')||{});
    check(`第${i+1}页实际图片引用闭合`,pictureReferences.every(r=>r.valid),pictureReferences);
    slides.push({slide:i+1,stem:spec?.stem,part,notesPart:notesRel[0]?.resolved,notesText:noteText,visibleText:visible,nativeTextShapes:nativeText,clickGroups:click.groups,effectCount:click.effectCount,pictureReferences,imageParts:[...new Set(pictureReferences.filter(r=>r.valid).map(r=>r.part))],_dom:page,_objects:click.objects});
  }
  const media=await Promise.all(Object.keys(zip.files).filter(n=>/^ppt\/media\//.test(n)&&!zip.files[n].dir).map(async part=>({part,sha256:hash(await zip.file(part).async('nodebuffer'))})));
  for(const a of assetMap.values()){
    const embedded=media.filter(m=>m.sha256===a.sha256.toLowerCase()),actual=slides.filter(s=>s.imageParts.some(p=>embedded.some(m=>m.part===p))).map(s=>s.stem);
    check(`图片字节与页绑定：${a.id}`,embedded.length>0&&same(sort(actual),sort(a.slides)),{embedded:embedded.map(m=>m.part),actual,expected:a.slides});
  }
  check('无未登记媒体',media.every(m=>c.assets.some(a=>a.sha256.toLowerCase()===m.sha256)),media);
  const external=[],av=[];
  for(const p of Object.keys(zip.files).filter(n=>n.endsWith('.rels')))for(const r of walk(await dom(p),n=>n.name==='Relationship').map(n=>n.attributes)){
    if(r.TargetMode==='External')external.push({part:p,...r});if(/\/(audio|video|media)$/.test(r.Type))av.push({part:p,...r});
  }
  check('无外链媒体',!external.some(r=>/\/(image|audio|video|media)$/.test(r.Type)),external);
  check('无音视频',!av.length&&!Object.keys(zip.files).some(n=>/\.(mp4|m4v|avi|wmv|mov|webm|mp3|wav|m4a|aac|ogg|wma)$/i.test(n))&&!walk(await dom('[Content_Types].xml'),n=>/^(audio|video)\//.test(n.attributes?.ContentType||'')).length,av);
  let officeValidation={status:'SKIPPED',reason:runtime.officeCli.reason};
  if(runtime.officeCli.status==='AVAILABLE'){
    const schema=JSON.parse((await runtime.run(runtime.officeCli.path,['validate',pptx,'--json'])).stdout);
    check('OfficeCLI格式校验',schema.success===true&&schema.data?.count===0,schema);
    officeValidation={status:schema.success===true&&schema.data?.count===0?'PASS':'FAIL',version:runtime.officeCli.version};
  }
  const report={schema:'native-course-artifact.v1',status:checks.every(c=>c.pass)?'PASS':'FAIL',pptx,sha256:hash(bytes),sourceProject:project,contractSha256:projectData.contractSha256,checks,officeValidation,slides:slides.map(({_dom,_objects,...s})=>s),visualReview:'NOT_REVIEWED',actualPlayback:'NOT_TESTED',limitations:['原生结构和字节核对不等于手动编辑测试。','OfficeCLI SKIPPED 时未进行该工具的附加 OOXML 格式校验。','机械通过不代表教学准确性、审美或真实放映已经通过。']};
  if(makeStates&&report.status==='PASS'){
    const stateDir=path.join(reportDir,'states');await fs.mkdir(stateDir,{recursive:true});report.staticStates=[];
    for(let stage=0;stage<=Math.max(0,...slides.map(s=>s.clickGroups.length));stage++){
      const copy=await JSZip.loadAsync(bytes),states=[];
      for(const s of slides){
        const page=structuredClone(s._dom),hidden=new Set(s.clickGroups.filter(g=>g.click>stage).flatMap(g=>g.targets.map(t=>t.id))),tree=first(page,'p:spTree');
        tree.elements=tree.elements.filter(n=>!objectTypes.has(n.name)||!hidden.has(first(n,'p:cNvPr')?.attributes.id));
        const remove=n=>{if(!n.elements)return;n.elements=n.elements.filter(c=>c.name!=='p:timing'&&c.name!=='p:transition');n.elements.forEach(remove);};remove(page);copy.file(s.part,xmljs.js2xml(page,{compact:false}));
        states.push({stem:s.stem,appliedClicks:Math.min(stage,s.clickGroups.length),hidden:s._objects.filter(o=>hidden.has(o.id)).map(o=>o.name)});
      }
      const file=path.join(stateDir,`stage-${stage}.pptx`),data=await copy.generateAsync({type:'nodebuffer',compression:'DEFLATE'});await fs.writeFile(file,data,{flag:'wx'});report.staticStates.push({stage,file,sha256:hash(data),slides:states});
    }
    report.limitations.push('显隐副本去除转场/动画，仅供静态查看，不模拟真实淡入播放。');
  }
  assert(hash(await fs.readFile(pptx))===hash(bytes),'被检查PPTX发生变化');
  await save(path.join(reportDir,'artifact-check.json'),report);
  assert(report.status==='PASS',`产物检查未通过：${checks.filter(c=>!c.pass).map(c=>c.name).join('；')}；见${reportDir}`);
  return report;
}

export function parseRenderOptions(extra,root){
  const options={backend:'auto'},seen=new Set();
  for(let i=0;i<extra.length;i+=2){
    const key=extra[i],value=extra[i+1];
    assert(['--backend','--output-dir'].includes(key)&&!seen.has(key)&&typeof value==='string'&&value.trim()&&!value.startsWith('--'),'render仅接受一次--backend和一次--output-dir，均须提供有效值');
    seen.add(key);
    if(key==='--backend'){assert(['office','libreoffice'].includes(value),'未知显式渲染后端');options.backend=value;}
    else options.outputDir=path.resolve(root,value);
  }
  return options;
}

export async function runNativeCommand(args,{root,skillDir}){
  const [command,projectArg,pptxArg,...extra]=args;
  assert(['doctor','init','prepare','gate','build','check','states','render','render-svg','review-pack','review-import','release-check'].includes(command),'原生路线命令：doctor | init | prepare | gate | build | check | states | render | render-svg | review-pack | review-import | release-check');
  assert(['prepare','review-pack','review-import','render'].includes(command)||!extra.length,'不接受未声明参数');
  const runtime=await environment(root,skillDir);
  if(command==='doctor'){assert(!projectArg,'doctor不接受工程参数');const result=await doctor(runtime);console.log(JSON.stringify(result,null,2));return result;}
  assert(projectArg,'缺少课程工程路径');const project=path.resolve(root,projectArg);
  if(command==='init'){
    assert(!pptxArg,'init只接受新工程路径');assert(!await exists(project),'新工程路径已存在；不覆盖');await doctor(runtime);
    // Official init decorates names without a date. Use a sibling temporary name, then move only the newly-created directory.
    const initName=`${path.basename(project)}_${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).replace(/-/g,'')}`;
    const created=path.join(path.dirname(project),initName);assert(!await exists(created),'官方初始化暂存目录已存在');
    await runtime.python('project_manager.py',['init',initName,'--format','ppt169','--dir',path.dirname(project)]);
    if(created!==project)await fs.rename(created,project);
    await fs.writeFile(path.join(project,'课程制作起点.md'),'# 课程制作起点\n\n此目录由官方标准路线初始化，目前未完成设计或制作。\n\n先冻结课程大纲/逐字稿/材料到 sources/，核真实SHA256；填写 design_spec.md、spec_lock.md 和 course-project.json。契约格式见技能 references/native-contract.schema.json。逐页 SVG 和同名 notes 必须由实际课程设计产生，不能用假hash/空备注骗过检查。新作品输出到独立exports时间戳文件；不得覆盖旧交付件。\n',{flag:'wx'});
    const result={status:'INITIALIZED_NOT_AUTHORED',project};console.log(JSON.stringify(result,null,2));return result;
  }
  if(['render','render-svg'].includes(command)){
    const options=command==='render'?parseRenderOptions(extra,root):{};
    assert(pptxArg,'缺少渲染源路径');await doctor(runtime);
    const result=command==='render'?await renderPptx({runtime,projectDir:project,sourceFile:path.resolve(root,pptxArg),...options}):await renderSvgPreview({runtime,projectDir:project,svgProjectDir:path.resolve(root,pptxArg)});
    console.log(JSON.stringify(result,null,2));return result;
  }
  if(!['prepare','gate','review-pack','review-import','release-check'].includes(command))assert(command==='build'?!pptxArg:Boolean(pptxArg),command==='build'?'build输出由时间戳确定，不接受覆盖目标':'缺少PPTX路径');
  const reportDir=path.join(project,'validation',`native-${command}-${stamp()}`);await fs.mkdir(reportDir,{recursive:true});
  const timings=[];let output;
  const step=async(name,fn)=>{const start=performance.now();try{const result=await fn();timings.push({name,status:'PASS',milliseconds:Math.round(performance.now()-start)});return result;}catch(e){timings.push({name,status:'FAIL',milliseconds:Math.round(performance.now()-start),error:e.message});throw e;}};
  const upstream=(name,argv)=>step(name,async()=>{
    const log=path.join(reportDir,`${name}.log`);
    try{const r=await runtime.python(name,argv);await fs.writeFile(log,r.stdout+'\n'+r.stderr,{flag:'wx'});return r;}
    catch(error){await fs.writeFile(log,String(error.stdout||'')+'\n'+String(error.stderr||error.message),{flag:'wx'});throw new Error(`${name} 执行失败；查看 ${log}`);}
  });
  try{
    if(['prepare','gate','review-pack','review-import','release-check'].includes(command)){
      const result=await runStageCommand({command,project,args:args.slice(2),runtime,validate:validateNativeProject,doctor,reportDir,upstream});
      console.log(JSON.stringify({...result,reportDir},null,2));return{...result,reportDir};
    }
    await step('environment',()=>doctor(runtime));let data=await step('course-input',()=>validateNativeProject(project,runtime));
    let inputFingerprint,stages,upstreamAdvisories;
    if(command==='build'){
      await step('original-design-schema',()=>validateOriginalDesign(runtime,project,reportDir));
      stages=await step('production-stages',()=>assertBuildStages(project,data.contract));
      inputFingerprint=await collectProductionInputs(project,data.contract);
      for(const file of ['design_spec.md','spec_lock.md'])assert((await fs.readFile(await localFile(project,file),'utf8')).trim(),`缺少设计文件：${file}`);
      await upstream('project_manager.py',['validate',project]);
      await upstream('svg_quality_checker.py',[project,'--canonical-authoring','--stage','final','--json']);
      const qualityFile=path.join(project,'validation/svg_quality_report.json');
      upstreamAdvisories=authoringAdvisories(await read(qualityFile),{python:runtime.config.executable,official:runtime.official,project,reportPath:qualityFile});
      if(await exists(path.join(project,'animations.json')))await upstream('animation_config.py',['validate',project]);
      else assert(data.contract.slides.every(s=>s.clicks===0),'有点击计划但缺少 animations.json');
      if(await exists(path.join(project,'notes/total.md'))){
        const splitDir=path.join(reportDir,'split-notes');await fs.mkdir(splitDir);
        await upstream('total_md_split.py',[project,'--output',splitDir]);
        await step('notes-split-match',async()=>{const split=await plainNotes(runtime,data.contract.slides.map(s=>path.join(splitDir,`${s.stem}.md`)));for(const [i,s]of data.contract.slides.entries())assert(normalize(split[i])===s.notePlain,`total.md与逐页备注冲突：${s.stem}；保持原备注不改写`);});
      }
      await upstream('finalize_svg.py',[project]);
      output=path.join(project,'exports',`course-${stamp()}.pptx`);await fs.mkdir(path.dirname(output),{recursive:true});
      await upstream('svg_to_pptx.py',[project,'--with-notes','--no-image-optimize','--output',output,...(data.contract.export?.nativeChartsAndTables?['--native-charts-and-tables']:[])]);
      data=await step('course-input-after-build',()=>validateNativeProject(project,runtime));
    }else output=path.resolve(root,pptxArg);
    const report=await step('actual-artifact',()=>artifact(data,output,runtime,reportDir,command==='states'));
    if(command==='states')await step('register-actual-states',()=>finishStatesRecord(project,reportDir,report,data.contract));
    const result={status:'MECHANICAL_PASS',project,pptx:output,reportDir,sha256:report.sha256,timings,officeValidation:report.officeValidation,visualReview:'NOT_REVIEWED',actualPlayback:'NOT_TESTED'};
    if(upstreamAdvisories)result.upstreamAdvisories=upstreamAdvisories;
    if(command==='build'){
      const copiedReport=path.join(reportDir,'svg_quality_report.json');await fs.copyFile(path.join(project,'validation/svg_quality_report.json'),copiedReport);
      await finishBuildRecord(project,reportDir,result,inputFingerprint,await collectProductionInputs(project,data.contract),stages,copiedReport);
    }else await save(path.join(reportDir,'run.json'),result);
    console.log(JSON.stringify(result,null,2));return result;
  }catch(e){if(!await exists(path.join(reportDir,'run.json')))await save(path.join(reportDir,'run.json'),{status:'FAIL',project,pptx:output,timings,error:e.message});throw e;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const skillDir=await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  runNativeCommand(process.argv.slice(2),{root:process.cwd(),skillDir}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
