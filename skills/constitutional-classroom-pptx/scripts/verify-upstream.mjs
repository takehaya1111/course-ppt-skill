import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const skillDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest=JSON.parse(await fs.readFile(path.join(skillDir,'upstream-manifest.json'),'utf8'));
const failures=[];
for(const file of manifest.files){
  const candidate=path.resolve(skillDir,'vendor/ppt-master',file.path);
  const relative=path.relative(path.join(skillDir,'vendor/ppt-master'),candidate);
  if(relative.startsWith('..') || path.isAbsolute(relative)){failures.push(file.path);continue;}
  try{
    const actual=crypto.createHash('sha256').update(await fs.readFile(candidate)).digest('hex');
    if(actual!==file.sha256) failures.push(file.path);
  }catch{failures.push(file.path);}
}
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',upstream:manifest.commit,checked:manifest.files.length,failures},null,2));
if(failures.length) process.exitCode=1;
