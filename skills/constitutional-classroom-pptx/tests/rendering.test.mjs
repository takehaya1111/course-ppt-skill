import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {renderPptx,renderSvgPreview,verifyRenderEvidence,pngDimensions} from '../scripts/lib/rendering.mjs';

const skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=async f=>hash(await fs.readFile(f));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');
async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'course-render-test-'));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()),'course-render-test-')));await fs.rm(dir,{recursive:true});});
  const zip=new JSZip();zip.file('ppt/presentation.xml','<p:presentation><p:sldIdLst><p:sldId id="1"/><p:sldId id="2"/></p:sldIdLst></p:presentation>');
  const source=path.join(dir,'source.pptx');await fs.writeFile(source,await zip.generateAsync({type:'nodebuffer'}));
  // Mock only the Office boundary: tests do not claim real rendering or viewing.
  const runtime={skillDir,run:async(file,args)=>{
    const input=args[args.indexOf('-InputPptx')+1],out=args[args.indexOf('-OutputDir')+1],pages=args[args.indexOf('-Pages')+1].split(',').map(Number);
    assert.equal(file,'powershell.exe');assert.notEqual(input,source);assert.equal(await digest(input),await digest(source));
    const report={input,status:'success',slideCount:2,application:'TEST DOUBLE',version:'test',method:'not a real renderer',slides:[]};
    for(const index of pages){const image=path.join(out,`slide-${String(index).padStart(2,'0')}.png`);await fs.writeFile(image,png);report.slides.push({index,image});}
    await fs.writeFile(path.join(out,'render-report.json'),JSON.stringify(report));return{stdout:'',stderr:''};
  }};
  return{dir,source,runtime};
}
function evidence(result,record,overrides={}){return{projectDir:result.projectDir,manifestFile:result.manifestFile,manifestSha256:result.manifestSha256,imageFile:record.image.path,imageSha256:record.image.sha256,sourceFile:record.source.path,sourceSha256:record.source.sha256,page:record.page,kind:'final',...overrides};}

test('PNG validation rejects non-image and zero-sized outputs',()=>{
  assert.deepEqual(pngDimensions(png),{width:1,height:1});assert.throws(()=>pngDimensions(Buffer.from('text')));
  const zero=Buffer.from(png);zero.writeUInt32BE(0,16);assert.throws(()=>pngDimensions(zero));
});
test('render receipts bind actual source, page and output; identical pixels remain legitimate',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),result=await renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source});
  assert.equal(result.status,'RENDERED_ONLY');assert.equal(result.records.length,2);
  assert.equal(result.records[0].image.sha256,result.records[1].image.sha256);
  for(const r of result.records)assert.equal((await verifyRenderEvidence(evidence(result,r))).pass,true);
  assert.equal(result.designTarget,undefined);assert.equal(result.reviewer,undefined);
});
test('reusing terminal image with another page fails even when pixels are equal',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),result=await renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source});
  const wrong=evidence(result,result.records[0],{page:2});assert.equal((await verifyRenderEvidence(wrong)).pass,false);
});
test('reusing a terminal receipt for a different PPTX state fails',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),result=await renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source});
  const other=path.join(f.dir,'stage-0.pptx');await fs.copyFile(f.source,other);
  assert.equal((await verifyRenderEvidence(evidence(result,result.records[0],{sourceFile:other}))).pass,false);
});
test('image substitution and source drift are rejected',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),result=await renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source});
  const r=result.records[0];await fs.appendFile(r.image.path,'drift');assert.equal((await verifyRenderEvidence(evidence(result,r))).pass,false);
  await fs.writeFile(r.image.path,png);await fs.appendFile(f.source,'source drift');assert.equal((await verifyRenderEvidence(evidence(result,r))).pass,false);
});
test('receipt and raw renderer report cannot be silently changed',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),result=await renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source});
  await fs.appendFile(result.rawReport.path,' ');assert.equal((await verifyRenderEvidence(evidence(result,result.records[0]))).pass,false);
  await fs.appendFile(result.manifestFile,' ');assert.equal((await verifyRenderEvidence(evidence(result,result.records[0]))).pass,false);
});
test('source changes during renderer invocation produce no passing receipt',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),run=f.runtime.run;f.runtime.run=async(...args)=>{const r=await run(...args);await fs.appendFile(f.source,'drift');return r;};
  const outputDir=path.join(f.dir,'result');await assert.rejects(renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source,outputDir}),/源文件已变化/);
  await assert.rejects(fs.access(path.join(outputDir,'render-manifest.json')));
});
test('existing output folders are never overwritten',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t),outputDir=path.join(f.dir,'preserved');await fs.mkdir(outputDir);
  await assert.rejects(renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source,outputDir}),{code:'EEXIST'});
});
test('original SVG renderer records are copied and bound to the actual snapshot',async t=>{
  const f=await fixture(t),svgDir=path.join(f.dir,'snapshot','svg_output');await fs.mkdir(svgDir,{recursive:true});
  const source=path.join(svgDir,'01.svg');await fs.writeFile(source,'<svg viewBox="0 0 1 1"/>');
  f.runtime.official=path.join(skillDir,'vendor/ppt-master/skills/ppt-master');f.runtime.config={executable:'TEST-PYTHON'};
  f.runtime.run=async(file,args)=>{
    if(args[0]==='-c')return{stdout:'["01.svg"]',stderr:''};
    assert.equal(path.basename(args[0]),'visual_review.py');const project=args[1],preview=path.join(project,'.preview');await fs.mkdir(preview);
    const image=path.join(preview,'01.png');await fs.writeFile(image,png);
    return{stdout:JSON.stringify({project,rendered:1,failed:0,pages:[{page:'01.svg',ok:true,path:image,bytes:png.length,all_background:false,canvas:{view_box:[0,0,1,1],width:1,height:1,png_width:1,png_height:1}}]}),stderr:''};
  };
  const result=await renderSvgPreview({runtime:f.runtime,projectDir:f.dir,svgProjectDir:path.dirname(svgDir)}),r=result.records[0];
  assert.equal((await verifyRenderEvidence(evidence(result,r,{kind:'early'}))).pass,true);
  assert.equal((await verifyRenderEvidence(evidence(result,r,{kind:'final'}))).pass,false);
});
test('legacy arbitrary source/image pairs without render receipts fail',async t=>{
  const f=await fixture(t);assert.equal((await verifyRenderEvidence({projectDir:f.dir,sourceFile:f.source,page:1,kind:'final'})).pass,false);
});
test('LibreOffice rendering uses an isolated profile and binds the intermediate PDF',async t=>{
  const f=await fixture(t);let conversionArgs;
  f.runtime.run=async(file,args)=>{
    if(args.includes('--version')||args[0]==='-v')return{stdout:'TEST DOUBLE VERSION',stderr:''};
    if(args.includes('--convert-to')){
      conversionArgs=args;assert.ok(args[0].startsWith('-env:UserInstallation=file:'));assert.ok(args.includes('--headless'));
      const dir=args[args.indexOf('--outdir')+1];await fs.writeFile(path.join(dir,'source.pdf'),'%PDF-1.7\nTEST DOUBLE');return{stdout:'',stderr:''};
    }
    assert.equal(args[0],'-png');await fs.writeFile(`${args.at(-1)}.png`,png);return{stdout:'',stderr:''};
  };
  const result=await renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source,pages:[2],backend:'libreoffice'});
  assert.ok(conversionArgs);assert.equal(result.engine.backend,'libreoffice');assert.match(result.engine.method,/not WPS/);
  assert.equal((await verifyRenderEvidence(evidence(result,result.records[0]))).pass,true);
  const report=JSON.parse(await fs.readFile(result.rawReport.path,'utf8'));await fs.appendFile(report.pdf.path,'changed');
  assert.equal((await verifyRenderEvidence(evidence(result,result.records[0]))).pass,false);
});
test('LibreOffice missing executables fail explicitly without another renderer',async t=>{
  const f=await fixture(t);f.runtime.run=async()=>{throw new Error('TEST unavailable');};
  const outputDir=path.join(f.dir,'no-renderer');await assert.rejects(renderPptx({runtime:f.runtime,projectDir:f.dir,sourceFile:f.source,outputDir,backend:'libreoffice'}),/缺少可用|指定的程序不可用/);
  await assert.rejects(fs.access(path.join(outputDir,'render-manifest.json')));
});
test('SVG preview refuses all-background results and incomplete upstream canvas',async t=>{
  for(const issue of ['blank','canvas']){
    const f=await fixture(t),svgDir=path.join(f.dir,'snapshot','svg_output');await fs.mkdir(svgDir,{recursive:true});await fs.writeFile(path.join(svgDir,'01.svg'),'<svg/>');
    f.runtime.official=path.join(skillDir,'vendor/ppt-master/skills/ppt-master');f.runtime.config={executable:'TEST-PYTHON'};
    f.runtime.run=async(file,args)=>{
      if(args[0]==='-c')return{stdout:'["01.svg"]',stderr:''};
      const project=args[1],image=path.join(project,'01.png');await fs.writeFile(image,png);
      return{stdout:JSON.stringify({project,rendered:1,failed:0,pages:[{page:'01.svg',ok:true,path:image,all_background:issue==='blank',canvas:issue==='canvas'?{png_width:1,png_height:1}:{view_box:[0,0,1,1],width:1,height:1,png_width:1,png_height:1}}]}),stderr:''};
    };
    await assert.rejects(renderSvgPreview({runtime:f.runtime,projectDir:f.dir,svgProjectDir:path.dirname(svgDir)}),/全背景|view_box/);
  }
});
