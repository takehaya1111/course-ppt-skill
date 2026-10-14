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
    console.log('先运行 npm ci，然后 node scripts/setup.mjs；离线 Python 安装：node scripts/setup.mjs --offline <wheel目录>。只创建技能目录内 .venv，不改全局环境。');
  } else {
    if (args.length && !(args.length===2 && args[0]==='--offline')) throw new Error('只接受 --offline <wheel目录>');
    const base = await findPython(skillDir, await loadLocalConfig(skillDir));
    const venv = path.join(skillDir, '.venv');
    const python = path.join(venv, process.platform==='win32'?'Scripts/python.exe':'bin/python');
    // Re-running setup must not try to overwrite the currently selected venv interpreter.
    if(!await fs.access(python).then(()=>true,()=>false))await run(base, ['-m','venv',venv]);
    await run(python, ['-m','pip','install',...(args.length?['--no-index','--find-links',path.resolve(args[1])]:[]),'-r',path.join(skillDir,'requirements.txt')]);
    console.log('Python 本地环境已安装。运行 node scripts/run.mjs doctor 检查；若设置了 PPT_SKILL_PYTHON，该变量优先于 .venv。');
  }
} catch (error) { console.error(error.message); process.exitCode=1; }
