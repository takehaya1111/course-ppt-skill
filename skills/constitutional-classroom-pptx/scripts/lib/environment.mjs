/** Portable process discovery. No machine paths or credentials belong in this file. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const exists = p => fs.access(p).then(() => true, () => false);
const read = async p => JSON.parse((await fs.readFile(p, 'utf8')).replace(/^\uFEFF/, ''));
export async function loadLocalConfig(skillDir) {
  const file = path.join(skillDir, 'runtime.local.json');
  return await exists(file) ? read(file) : {};
}

export async function findPython(skillDir, local = {}) {
  const explicit = process.env.PPT_SKILL_PYTHON || local.python;
  const venv = path.join(skillDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const candidates = explicit ? [[explicit, []]] : [
    ...(await exists(venv) ? [[venv, []]] : []),
    ['python3', []], ['python', []], ...(process.platform === 'win32' ? [['py', ['-3']]] : [])
  ];
  for (const [file, args] of candidates) {
    try {
      const result = await exec(file, [...args, '-c', 'import sys; assert sys.version_info >= (3,10); print(sys.executable)'], {windowsHide:true, timeout:15000, encoding:'utf8'});
      return result.stdout.trim();
    } catch (error) {
      if (explicit) throw new Error(`指定的 Python 不可用（需 3.10+）：${file}；${error.message}`);
    }
  }
  throw new Error('未找到 Python 3.10+。安装 Python，或设置 PPT_SKILL_PYTHON 为解释器路径。');
}

export async function findOfficeCli(local = {}) {
  const configured = process.env.PPT_SKILL_OFFICECLI || local.officeCli;
  if (configured === 'disabled') return {status:'SKIPPED', reason:'显式关闭可选 OfficeCLI 格式校验'};
  const file = configured || 'officecli';
  try {
    const result = await exec(file, ['--version'], {windowsHide:true, timeout:20000, encoding:'utf8', env:{...process.env, OFFICECLI_SKIP_UPDATE:'1', OFFICECLI_NO_AUTO_RESIDENT:'1'}});
    return {status:'AVAILABLE', path:file, version:result.stdout.trim()};
  } catch (error) {
    // An explicit but broken executable is a configuration error, never a silent skip.
    if (configured) throw new Error(`指定的 OfficeCLI 不可用：${file}；${error.message}`);
    return {status:'SKIPPED', reason:'PATH 中未找到可用 OfficeCLI；仍执行必需的原生正文、备注、媒体与点击检查'};
  }
}

export async function createEnvironment(root, skillDir) {
  const local = await loadLocalConfig(skillDir);
  const lock = await read(path.join(skillDir, 'runtime-lock.json'));
  const config = {executable:await findPython(skillDir, local), packages:lock.pythonPackages};
  const official = path.join(skillDir, 'vendor/ppt-master/skills/ppt-master');
  if (!await exists(path.join(official, 'SKILL.md'))) throw new Error('缺少完整 vendor/ppt-master/skills/ppt-master；请重新安装完整技能包，不能仅复制脚本。');
  const officeCli = await findOfficeCli(local);
  const env = {...process.env, PYTHONUTF8:'1', PYTHONDONTWRITEBYTECODE:'1', OFFICECLI_SKIP_UPDATE:'1', OFFICECLI_NO_AUTO_RESIDENT:'1'};
  const run = (file, args, options={}) => exec(file, args, {cwd:root, env, windowsHide:true, encoding:'utf8', maxBuffer:32*1024*1024, ...options});
  const python = (entry, args=[]) => run(config.executable, [path.join(official, 'scripts', entry), ...args]);
  return {root, skillDir, config, lock, official, officeCli, run, python};
}
