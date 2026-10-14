/** Creates a skill-local virtual environment. Does not install into system Python. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {findPython, loadLocalConfig} from './lib/environment.mjs';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const run = (file, argv) => new Promise((resolve,reject) => {
  const child = spawn(file, argv, {cwd:skillDir, stdio:'inherit', windowsHide:true, env:{...process.env, PYTHONUTF8:'1'}});
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`安装命令退出码 ${code}`)));
});
try {
  if (args.includes('--help')) {
    console.log('先运行 npm ci，然后 node scripts/setup.mjs；可选 PDF 光栅化：node scripts/setup.mjs --pdf-rendering；离线安装可追加 --offline <wheel目录>。只创建技能目录内 .venv，不改全局环境。');
  } else {
    let offline=null,pdfRendering=false;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--pdf-rendering'&&!pdfRendering){pdfRendering=true;continue;}
      if(args[i]==='--offline'&&offline===null&&args[i+1]&&!args[i+1].startsWith('--')){offline=path.resolve(args[++i]);continue;}
      throw new Error('只接受一次 --pdf-rendering 和一次 --offline <wheel目录>');
    }
    const base = await findPython(skillDir, await loadLocalConfig(skillDir));
    const venv = path.join(skillDir, '.venv');
    const python = path.join(venv, process.platform==='win32'?'Scripts/python.exe':'bin/python');
    // Re-running setup must not try to overwrite the currently selected venv interpreter.
    if(!await fs.access(python).then(()=>true,()=>false))await run(base, ['-m','venv',venv]);
    await run(python, ['-m','pip','install',...(offline?['--no-index','--find-links',offline]:[]),'-r',path.join(skillDir,'requirements.txt'),...(pdfRendering?['-r',path.join(skillDir,'requirements-rendering.txt')]:[])]);
    console.log('Python 本地环境已安装。运行 node scripts/run.mjs doctor 检查；若设置了 PPT_SKILL_PYTHON，该变量优先于 .venv。');
  }
} catch (error) { console.error(error.message); process.exitCode=1; }
