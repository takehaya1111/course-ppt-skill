import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {findPython,loadLocalConfig} from '../scripts/lib/environment.mjs';
import {pngDimensions} from '../scripts/lib/rendering.mjs';

const exec=promisify(execFile),skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(skillDir,'scripts/pdf-raster.py');
let python;try{python=await findPython(skillDir,await loadLocalConfig(skillDir));}catch{}
const run=(args,options={})=>exec(python,[...args],{windowsHide:true,timeout:30000,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},...options});

function smallPdf(){
  const stream='0.1 0.4 0.8 rg 10 10 200 100 re f\n';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1280 720] /Resources << >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
  let pdf='%PDF-1.4\n',offsets=[0];
  for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  return Buffer.from(pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
const rasterArgs=(pdf,prefix)=>[script,'-png','-scale-to-x','1600','-scale-to-y','-1','-f','1','-l','1','-singlefile',pdf,prefix];
test('optional PDF renderer is separate from core requirements and version lock',async()=>{
  const lock=JSON.parse(await fs.readFile(path.join(skillDir,'runtime-lock.json'))),core=await fs.readFile(path.join(skillDir,'requirements.txt'),'utf8'),optional=await fs.readFile(path.join(skillDir,'requirements-rendering.txt'),'utf8');
  assert.equal(lock.pythonPackages.pypdfium2,undefined);assert.doesNotMatch(core,/^pypdfium2/m);
  assert.equal(lock.optionalPythonPackages.pdfRendering.pypdfium2,'5.14.0');assert.match(optional,/^pypdfium2==5\.14\.0$/m);
});
test('setup documents optional and offline installation without changing core default',async()=>{
  const result=await exec(process.execPath,[path.join(skillDir,'scripts/setup.mjs'),'--help'],{windowsHide:true});assert.match(result.stdout,/--pdf-rendering/);assert.match(result.stdout,/--offline/);
  await assert.rejects(exec(process.execPath,[path.join(skillDir,'scripts/setup.mjs'),'--pdf-rendering','--pdf-rendering'],{windowsHide:true}),/只接受一次/);
});
test('version and probe fail without dependency instead of falsely reporting ready',{skip:!python},async()=>{
  for(const flag of ['--version','--probe-json'])await assert.rejects(run(['-S',script,flag]),error=>error.code===3&&/--pdf-rendering/.test(error.stderr));
});
test('unsupported dimensions or page range are rejected rather than silently changed',{skip:!python},async()=>{
  for(const update of [args=>args[args.indexOf('-f')+1]='0',args=>args[args.indexOf('-l')+1]='2',args=>args[args.indexOf('-scale-to-x')+1]='0',args=>args[args.indexOf('-scale-to-y')+1]='900',args=>args.push('--ignored-flag')]){
    const args=rasterArgs('absent.pdf','absent-prefix');update(args);
    await assert.rejects(run(['-S',...args]),error=>error.code===2);
  }
});
test('real PDFium probe and a small synthetic PDF produce an exact-aspect PNG when installed',{skip:!python},async t=>{
  let output;
  try{output=await run([script,'--probe-json']);}catch(error){if(error.code===3){t.skip(`可选PDFium未配置：${error.stderr.trim()}`);return;}throw error;}
  const probe=JSON.parse(output.stdout);assert.equal(probe.status,'AVAILABLE');assert.equal(probe.nativeRenderAndPng,true);assert.equal(probe.packages.pypdfium2,'5.14.0');assert.ok(probe.pdfiumVersion);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'course-pdf-raster-'));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()),'course-pdf-raster-')));await fs.rm(dir,{recursive:true});});
  const pdf=path.join(dir,'source.pdf'),prefix=path.join(dir,'page');await fs.writeFile(pdf,smallPdf());
  await run(rasterArgs(pdf,prefix));const bytes=await fs.readFile(`${prefix}.png`);assert.deepEqual(pngDimensions(bytes),{width:1600,height:900});assert.ok(bytes.length>1000);
  await assert.rejects(run(rasterArgs(pdf,prefix)),error=>error.code===4);assert.deepEqual(await fs.readFile(`${prefix}.png`),bytes);
  const outOfRange=rasterArgs(pdf,path.join(dir,'absent'));outOfRange[outOfRange.indexOf('-f')+1]='2';outOfRange[outOfRange.indexOf('-l')+1]='2';
  await assert.rejects(run(outOfRange),error=>error.code===4&&/只有 1 页/.test(error.stderr));await assert.rejects(fs.access(path.join(dir,'absent.png')));
});
