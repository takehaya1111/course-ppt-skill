/** Render receipts extend PPT Master's pure-renderer records to actual PPTX pages.
 * Rendering records no aesthetic verdict, reviewer identity, or claim of viewing.
 * Like upstream visual_review.py, only a real renderer invocation produces a receipt.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import JSZip from 'jszip';

const moduleFile=fileURLToPath(import.meta.url);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=async file=>hash(await fs.readFile(file));
const read=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.resolve(a)===path.resolve(b);
const save=async(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');

export function pngDimensions(bytes){
  assert(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR','渲染结果不是有效PNG头');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  assert(width>0&&height>0&&width<=32768&&height<=32768,'PNG尺寸无效');
  return{width,height};
}

async function imageEntry(file){const bytes=await fs.readFile(file);return{path:path.resolve(file),sha256:hash(bytes),...pngDimensions(bytes)};}
function officialCanvas(canvas){
  assert(canvas&&Array.isArray(canvas.view_box)&&canvas.view_box.length===4&&canvas.view_box.every(Number.isFinite),'缺少原版完整SVG view_box');
  assert(canvas.width>0&&canvas.height>0&&canvas.width===canvas.view_box[2]&&canvas.height===canvas.view_box[3]&&canvas.png_width===Math.ceil(canvas.width)&&canvas.png_height===Math.ceil(canvas.height),'原版SVG画布尺寸记录不完整或不一致');
  return canvas;
}
async function newOutput(projectDir,outputDir,kind){
  const output=path.resolve(outputDir||path.join(projectDir,'validation',`render-${kind}-${stamp()}`));
  await fs.mkdir(path.dirname(output),{recursive:true});
  // No overwriting an earlier report, including an unsuccessful invocation.
  await fs.mkdir(output,{recursive:false});
  return output;
}
async function assertSnapshot(source){
  assert(await digest(source.path)===source.sha256,`渲染期间源文件已变化：${source.path}`);
  if(source.snapshotPath)assert(await digest(source.snapshotPath)===source.sha256,'实际渲染副本与源文件不一致');
}
async function finish(output,manifest){
  const file=path.join(output,'render-manifest.json');
  await save(file,{schema:'course-render-manifest.v1',status:'RENDERED_ONLY',createdAt:new Date().toISOString(),generatedBy:{name:'course-ppt-skill/render',moduleSha256:await digest(moduleFile)},...manifest,
    limitations:['仅证明本次运行登记的源文件、页号及图片对应；不证明审美通过、真实观看或放映效果。','本机文件可被拥有写权限的程序篡改；本记录不是对抗同权限伪造者的密码学证明。']});
  return{status:'RENDERED_ONLY',manifestFile:file,manifestSha256:await digest(file),...(await read(file))};
}

/** Actual Office rendering; source is copied byte-for-byte into a unique run folder.
 * An existing application is attached read-only without changing settings or quitting it.
 */
export async function renderPptx({runtime,projectDir,sourceFile,outputDir,pages,backend='auto'}){
  assert(['auto','office','libreoffice'].includes(backend),'未知渲染后端；仅支持auto、office、libreoffice');
  const selectedBackend=backend==='auto'?(process.platform==='win32'?'office':'libreoffice'):backend;
  assert(selectedBackend!=='office'||process.platform==='win32','Office渲染需要Windows的PowerPoint兼容COM；可显式选择libreoffice，不能用SVG预览冒充PPTX实显。');
  projectDir=await fs.realpath(projectDir);sourceFile=await fs.realpath(sourceFile);
  const bytes=await fs.readFile(sourceFile),zip=await JSZip.loadAsync(bytes);
  const presentation=zip.file('ppt/presentation.xml');assert(presentation,'不是有效PPTX');
  const pageCount=((await presentation.async('string')).match(/<p:sldId\b/g)||[]).length;
  assert(pageCount>0,'PPTX没有页面');
  const selected=pages??Array.from({length:pageCount},(_,i)=>i+1);
  assert(Array.isArray(selected)&&selected.length&&new Set(selected).size===selected.length&&selected.every(n=>Number.isInteger(n)&&n>0&&n<=pageCount),'渲染页号重复、为空或越界');
  const output=await newOutput(projectDir,outputDir,'pptx');
  const source={path:sourceFile,sha256:hash(bytes),snapshotPath:path.join(output,'source.pptx')};
  await fs.writeFile(source.snapshotPath,bytes,{flag:'wx'});
  const images=path.join(output,'images');await fs.mkdir(images);
  if(selectedBackend==='libreoffice')return renderLibreOffice({runtime,projectDir,source,output,images,selected,pageCount});
  const script=path.join(runtime.skillDir,'scripts/render-office-com.ps1');
  const command={file:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InputPptx',source.snapshotPath,'-OutputDir',images,'-Pages',selected.join(',')],scriptSha256:await digest(script)};
  // Cross-project application lock. Never delete someone else's lock or kill their app.
  const lockPath=path.join(os.tmpdir(),'course-ppt-skill-office-render.lock');let lock;
  try{lock=await fs.open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,output,startedAt:new Date().toISOString()}));}
  catch(error){await save(path.join(output,'render-failure.json'),{status:'FAILED',reason:'另一次Office渲染正在运行，或上次锁需人工检查',lockPath});throw new Error(`Office渲染锁已存在，请先核实原进程，不自动抢锁：${lockPath}`,{cause:error});}
  try{
    const result=await runtime.run(command.file,command.args,{timeout:300000});
    await fs.writeFile(path.join(output,'renderer.log'),`${result.stdout||''}\n${result.stderr||''}`,{flag:'wx'});
    const reportFile=path.join(images,'render-report.json'),report=await read(reportFile);
    assert(report.status==='success'&&samePath(report.input,source.snapshotPath),'渲染器没有确认实际输入成功');
    assert(report.slideCount===pageCount&&Array.isArray(report.slides)&&report.slides.length===selected.length,'渲染器页数与实际PPTX/请求不一致');
    const records=[];
    for(const page of selected){
      const raw=report.slides.find(item=>item.index===page);
      assert(raw&&report.slides.filter(item=>item.index===page).length===1,`渲染器漏页或重复：${page}`);
      const image=await imageEntry(raw.image);
      assert(samePath(image.path,path.join(images,`slide-${String(page).padStart(2,'0')}.png`)),'渲染器输出路径与本次独立目录不符');
      records.push({page,source,image});
    }
    await assertSnapshot(source);
    return await finish(output,{kind:'pptx',projectDir,command,engine:{name:report.application,backend:'office',version:report.version,method:report.method},rawReport:{path:reportFile,sha256:await digest(reportFile)},records});
  }catch(error){await save(path.join(output,'render-failure.json'),{status:'FAILED',error:error.message}).catch(()=>{});throw new Error(`${error.message}\nOffice实显失败；不会静默更换软件。若已配置LibreOffice与PDF光栅化程序，可显式重试 --backend libreoffice；安装说明见INSTALL.md。`,{cause:error});}
  finally{await lock.close();await fs.unlink(lockPath);}
}

async function discoverRenderer(runtime,variable,candidates,versionArgs){
  const explicit=process.env[variable],files=explicit?[explicit]:[...new Set(candidates.filter(Boolean))];
  for(const [index,file] of files.entries()){try{const args=typeof versionArgs==='function'?versionArgs(index):versionArgs,result=await runtime.run(file,args,{timeout:20000});return{file,version:(result.stdout||result.stderr||'').trim()};}catch(error){if(explicit)throw new Error(`${variable}指定的程序不可用：${file}；${error.message}`,{cause:error});}}
  throw new Error(`缺少可用的${candidates[0]}；请安装所需程序或设置${variable}。不自动安装或改用SVG。`);
}

/** WB's PDFium fallback, constrained to automatic discovery only. Explicit broken
 * configuration is an error, not permission to silently change the chosen tool.
 * Availability means a real in-memory native render and PNG encoding, not --version.
 */
async function resolveLibreOfficeRasterizer(runtime){
  let fallbackReason;
  try{
    const found=await discoverRenderer(runtime,'PPT_SKILL_PDFTOPPM',['pdftoppm'],['-v']);
    return{...found,args:[],mode:'external-cli',label:'pdftoppm',scriptSha256:null,fallbackReason:null};
  }catch(error){
    if(process.env.PPT_SKILL_PDFTOPPM)throw error;
    fallbackReason=error.message;
  }
  const script=path.join(runtime.skillDir,'scripts/pdf-raster.py');
  assert(await fs.access(script).then(()=>true,()=>false),'缺少技能内PDF光栅化脚本，请恢复完整安装或安装poppler。');
  const command={file:runtime.config.executable,args:[script,'--probe-json']};
  let output;
  try{output=await runtime.run(command.file,command.args,{timeout:20000});}
  catch(error){throw new Error(`pdftoppm自动发现失败，PDFium回退也不可用。请运行 node scripts/setup.mjs --pdf-rendering；如设置PPT_SKILL_PYTHON，须在该解释器中安装requirements-rendering.txt。${error.stderr||error.message}`,{cause:error});}
  const probe=JSON.parse(output.stdout.trim());
  assert(probe.schema==='course-pdf-raster-probe.v1'&&probe.status==='AVAILABLE'&&probe.nativeRenderAndPng===true&&probe.pdfiumVersion,'PDF光栅化探测未确认实际原生渲染及PNG编码');
  const lock=runtime.lock??await read(path.join(runtime.skillDir,'runtime-lock.json'));
  const expected=lock.optionalPythonPackages?.pdfRendering?.pypdfium2;
  assert(expected&&probe.packages?.pypdfium2===expected,`可选渲染依赖版本不符：pypdfium2=${probe.packages?.pypdfium2??'未知'}，要求${expected??'缺少依赖锁'}；请按requirements-rendering.txt安装。`);
  return{file:command.file,args:[script],mode:'skill-local',label:'pypdfium2（技能内pdf-raster.py）',version:`pypdfium2 ${probe.packages.pypdfium2}; PDFium ${probe.pdfiumVersion}`,scriptSha256:await digest(script),fallbackReason,probe};
}

function executionError(error){
  const detail=error.cause??error;
  return{message:error.message,code:detail.code??null,signal:detail.signal??null,stdout:detail.stdout||'',stderr:detail.stderr||''};
}

async function renderLibreOffice({runtime,projectDir,source,output,images,selected,pageCount}){
  const resolved={soffice:null,rasterizer:null},attempts=[],rasterizationAttempts=[];
  const logs=[],records=[];
  const listing=async dir=>(await fs.readdir(dir).catch(()=>[])).sort();
  const invoke=async(command,collection,timeout)=>{
    const entry={attempt:collection.length+1,command,startedAt:new Date().toISOString(),finishedAt:null,stdout:'',stderr:'',exitCode:null,error:null};
    collection.push(entry);
    try{
      const result=await runtime.run(command.file,command.args,{timeout});
      Object.assign(entry,{stdout:result.stdout||'',stderr:result.stderr||'',exitCode:0});
      return result;
    }catch(error){
      const detail=executionError(error);Object.assign(entry,{stdout:detail.stdout,stderr:detail.stderr,exitCode:Number.isInteger(detail.code)?detail.code:null,error:detail});throw error;
    }finally{entry.finishedAt=new Date().toISOString();logs.push(JSON.stringify(entry));}
  };
  try{
    const windowsCandidates=['soffice.com',...['ProgramFiles','ProgramFiles(x86)'].map(key=>process.env[key]&&path.join(process.env[key],'LibreOffice/program/soffice.com')),'soffice',...['ProgramFiles','ProgramFiles(x86)'].map(key=>process.env[key]&&path.join(process.env[key],'LibreOffice/program/soffice.exe'))];
    const candidates=process.platform==='win32'?windowsCandidates:['soffice',process.platform==='darwin'?'/Applications/LibreOffice.app/Contents/MacOS/soffice':null];
    // Windows .com is the console launcher; GUI .exe can hang on --version.
    // Version probes must also use a unique profile so they never attach to user sessions.
    const soffice=await discoverRenderer(runtime,'PPT_SKILL_LIBREOFFICE',candidates,index=>[`-env:UserInstallation=${pathToFileURL(path.join(output,`version-profile-${index}`)).href}`,'--headless','--version']);
    resolved.soffice=soffice;
    const rasterizer=await resolveLibreOfficeRasterizer(runtime);resolved.rasterizer=rasterizer;
    logs.push(JSON.stringify({resolved}));
    const pdfDir=path.join(output,'pdf'),profile=path.join(output,'libreoffice-profile');await fs.mkdir(pdfDir);
    const command={file:soffice.file,args:[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--convert-to','pdf:impress_pdf_Export','--outdir',pdfDir,source.snapshotPath]};
    const pdfFile=path.join(pdfDir,'source.pdf');
    for(let attempt=1;attempt<=2;attempt++){
      try{await invoke(command,attempts,300000);}
      finally{
        const entry=attempts.at(-1);entry.pdfDir=await listing(pdfDir);entry.outputDir=await listing(output);
        entry.pdfPresent=await fs.access(pdfFile).then(()=>true,()=>false);
      }
      if(attempts.at(-1).pdfPresent)break;
      // Only a successful process with a missing PDF is retried, at most once.
      // The cause is not assumed; independent profiles do not prove an old instance.
      if(attempt===1)await new Promise(resolve=>setTimeout(resolve,3000));
    }
    assert(attempts.at(-1).pdfPresent,'LibreOffice成功退出但两次均未生成PDF；已保存两次转换记录');
    const pdfBytes=await fs.readFile(pdfFile);
    assert(pdfBytes.subarray(0,5).toString()==='%PDF-','LibreOffice没有生成有效PDF');
    const report={input:source.snapshotPath,status:'success',renderer:'libreoffice',slideCount:pageCount,application:`LibreOffice Impress + ${rasterizer.label}`,version:soffice.version,method:'Alternative-software static rendering: isolated LibreOffice profile PPTX→PDF→PNG; not WPS/PowerPoint display or slideshow playback',conversion:command,conversionAttempts:attempts,pdf:{path:pdfFile,sha256:hash(pdfBytes)},rasterizer,rasterizationAttempts,slides:[]};
    for(const page of selected){
      const prefix=path.join(images,`slide-${String(page).padStart(2,'0')}`),args=[...rasterizer.args,'-png','-scale-to-x','1600','-scale-to-y','-1','-f',String(page),'-l',String(page),'-singlefile',pdfFile,prefix];
      await invoke({file:rasterizer.file,args},rasterizationAttempts,120000);
      const image=await imageEntry(`${prefix}.png`);records.push({page,source,image});report.slides.push({index:page,image:image.path,command:{file:rasterizer.file,args}});
    }
    assert(await digest(pdfFile)===report.pdf.sha256,'PDF在逐页渲染期间已变化');await assertSnapshot(source);
    const reportFile=path.join(output,'libreoffice-render-report.json');await save(reportFile,report);await fs.writeFile(path.join(output,'renderer.log'),logs.join('\n'),{flag:'wx'});
    return await finish(output,{kind:'pptx',projectDir,command,engine:{name:report.application,backend:'libreoffice',version:report.version,method:report.method,rasterizerMode:rasterizer.mode},rawReport:{path:reportFile,sha256:await digest(reportFile)},records});
  }catch(error){
    const failure={status:'FAILED',error:error.message,processError:executionError(error),resolved,conversionAttempts:attempts,rasterizationAttempts};
    await save(path.join(output,'render-failure.json'),failure).catch(()=>{});
    logs.push(JSON.stringify({failure}));await fs.writeFile(path.join(output,'renderer.log'),logs.join('\n'),{flag:'wx'}).catch(()=>{});
    throw error;
  }
}

/** Use the unchanged official SVG renderer and its project-identity health check.
 * svgProjectDir is the original early authoring snapshot, not final author SVGs.
 * A live-preview server for that exact directory must already be running.
 */
export async function renderSvgPreview({runtime,projectDir,svgProjectDir=projectDir,outputDir,pages,serverUrl}){
  projectDir=await fs.realpath(projectDir);svgProjectDir=await fs.realpath(svgProjectDir);
  // The official preview/export use numeric filename ordering, not JS lexical sort.
  const rosterCode="import sys,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from slide_roster import discover_slide_svgs; print(json.dumps([p.name for p in discover_slide_svgs(Path(sys.argv[2]))]))";
  const roster=JSON.parse((await runtime.run(runtime.config.executable,['-c',rosterCode,path.join(runtime.official,'scripts'),path.join(svgProjectDir,'svg_output')])).stdout.trim());
  const selected=pages??roster.map((_,i)=>i+1);
  assert(roster.length&&Array.isArray(selected)&&selected.length&&new Set(selected).size===selected.length&&selected.every(n=>Number.isInteger(n)&&n>0&&n<=roster.length),'SVG渲染页号重复、为空或越界');
  const sources=await Promise.all(selected.map(async page=>{const file=path.join(svgProjectDir,'svg_output',roster[page-1]);return{page,path:file,sha256:await digest(file)};}));
  const output=await newOutput(projectDir,outputDir,'svg');
  const script=path.join(runtime.official,'scripts/visual_review.py');
  const command={file:runtime.config.executable,args:[script,svgProjectDir,'--pages',...selected.map(page=>roster[page-1]),...(serverUrl?['--server-url',serverUrl]:[])],scriptSha256:await digest(script)};
  const lockPath=path.join(svgProjectDir,'.course-render.lock');let lock;
  try{lock=await fs.open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,output}));}
  catch(error){throw new Error(`此SVG快照正在渲染或旧锁需核实：${lockPath}`,{cause:error});}
  try{
    const result=await runtime.run(command.file,command.args,{timeout:300000});
    const report=JSON.parse(result.stdout.trim());
    assert(report.failed===0&&report.rendered===selected.length&&samePath(report.project,svgProjectDir),'原版SVG渲染报告未覆盖本次快照');
    const reportFile=path.join(output,'official-render-report.json');await save(reportFile,report);
    await fs.writeFile(path.join(output,'renderer.log'),result.stderr||'',{flag:'wx'});
    const records=[];
    for(const source of sources){
      const raw=report.pages.find(item=>item.page===path.basename(source.path));
      assert(raw?.ok===true&&raw.path,'原版SVG渲染未成功');assert(raw.all_background===false,'原版渲染报告提示全背景或缺少空白检测，不能收录为有效审阅图片');
      const canvas=officialCanvas(raw.canvas);
      const actualImage=await imageEntry(raw.path),imageFile=path.join(output,`slide-${String(source.page).padStart(2,'0')}.png`);
      await fs.copyFile(raw.path,imageFile,fs.constants.COPYFILE_EXCL);
      const image=await imageEntry(imageFile);assert(image.sha256===actualImage.sha256,'原版预览在收录期间变化');
      assert(image.width===raw.canvas?.png_width&&image.height===raw.canvas?.png_height,'PNG尺寸不符合原版SVG画布记录');
      await assertSnapshot(source);
      records.push({page:source.page,source:{path:source.path,sha256:source.sha256},image,upstreamImage:{path:actualImage.path,sha256:actualImage.sha256},canvas,allBackground:false});
    }
    return await finish(output,{kind:'svg',projectDir,command,engine:{name:'PPT Master visual_review.py',method:'Original Playwright Chromium SVG preview; not PPTX display'},rawReport:{path:reportFile,sha256:await digest(reportFile)},records});
  }catch(error){await save(path.join(output,'render-failure.json'),{status:'FAILED',error:error.message}).catch(()=>{});throw error;}
  finally{await lock.close();await fs.unlink(lockPath);}
}

/** Recheck generated receipt, real source, page identity and pixels together.
 * Identical pixels are allowed: the source/page pairing must still be genuine.
 */
export async function verifyRenderEvidence({projectDir,manifestFile,manifestSha256,imageFile,imageSha256,sourceFile,sourceSha256,page,kind}){
  const errors=[];let record;
  try{
    assert(manifestFile&&manifestSha256,'缺少运行器生成的渲染记录与哈希');
    assert(await digest(manifestFile)===manifestSha256,'渲染记录已变化');
    const manifest=await read(manifestFile),expectedKind=kind==='early'?'svg':kind==='final'?'pptx':kind;
    assert(manifest.schema==='course-render-manifest.v1'&&manifest.status==='RENDERED_ONLY'&&manifest.generatedBy?.name==='course-ppt-skill/render'&&['svg','pptx'].includes(manifest.kind),'不是运行器的渲染记录');
    assert(!expectedKind||manifest.kind===expectedKind,'预览种类不匹配；SVG不能代替PPTX实显');
    assert(samePath(manifest.projectDir,projectDir),'渲染记录属于另一课程工程');
    assert(manifest.command?.file&&Array.isArray(manifest.command.args)&&manifest.engine?.name,'缺少实际引擎或命令');
    assert(Array.isArray(manifest.records),'渲染记录缺少页面');
    const candidates=manifest.records.filter(item=>item.page===page&&samePath(item.source?.path,sourceFile));
    assert(candidates.length===1,'渲染记录未绑定本次源文件及实际页号');record=candidates[0];
    assert(record.source.sha256===sourceSha256,'渲染源哈希与当前状态不符');
    assert(samePath(record.image?.path,imageFile)&&record.image.sha256===imageSha256,'实际看图文件不属于该源文件/页号的渲染记录');
    await assertSnapshot(record.source);
    const actual=await imageEntry(imageFile);assert(actual.sha256===imageSha256&&actual.width===record.image.width&&actual.height===record.image.height,'图片字节或尺寸已变化');
    assert(await digest(manifest.rawReport.path)===manifest.rawReport.sha256,'原版/Office实际渲染报告已变化');
    const raw=await read(manifest.rawReport.path);
    if(manifest.kind==='pptx'){
      assert(raw.status==='success'&&samePath(raw.input,record.source.snapshotPath),'Office报告未渲染绑定副本');
      assert((raw.slides||[]).some(item=>item.index===page&&samePath(item.image,imageFile)),'Office报告中的页号和图片不对应');
      if(manifest.engine.backend==='libreoffice')assert(raw.renderer==='libreoffice'&&raw.pdf?.path&&await digest(raw.pdf.path)===raw.pdf.sha256,'LibreOffice中间PDF已缺失或变化');
    }else{
      const item=(raw.pages||[]).find(item=>item.page===path.basename(sourceFile));
      assert(item?.ok===true&&samePath(item.path,record.upstreamImage?.path)&&record.upstreamImage.sha256===imageSha256,'原版SVG记录中的源页与复制图片不对应');
      assert(item.all_background===false&&record.allBackground===false,'原版SVG为全背景或缺少空白检查');
      officialCanvas(item.canvas);assert(JSON.stringify(record.canvas)===JSON.stringify(item.canvas),'收录画布与原版画布记录不符');
      assert(item.canvas?.png_width===actual.width&&item.canvas?.png_height===actual.height,'原版SVG画布与实看图片不符');
    }
  }catch(error){errors.push(error.message);}
  return{pass:errors.length===0,errors,record};
}
