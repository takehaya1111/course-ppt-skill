import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Runtime assets follow this file; user project paths follow the caller's working directory.
const scriptsDir = await fs.realpath(path.dirname(fileURLToPath(import.meta.url)));
const skillDir = path.dirname(scriptsDir);
const root = process.cwd();
const args = process.argv.slice(2);
const command = args[0] || 'doctor';
const help = `宪法课堂课件：默认使用 PPT Master 原生制作路线
  doctor                           检查原生路线和固定上游分发
  init <项目路径>                  创建独立课件制作目录
  prepare <项目路径> [--revision-of <基线PPTX>]  制作前材料、计划及官方字体校准
  gate <项目路径> early            仅前5页时技术检查，独立看图后再次收录
  build <项目路径>                 校验既有设计输入并导出原生动效PPTX
  check <项目路径> <PPTX路径>      回读实际文件，核正文、图片、备注及点击
  states <项目路径> <PPTX路径>     制作静态显隐核对副本（不是放映）
  release-check <项目路径> <PPTX路径> 核本次输入、成品及独立设计审阅
模型完成设计判断和完整页面作者稿；build不是自动设计器。
安装：先在技能目录运行 npm ci，再运行 node scripts/setup.mjs。
相对项目及PPTX路径以调用者当前目录为基准：${root}`;

try {
  if (['help','--help','-h'].includes(command)) {
    console.log(help);
  } else if (command === 'legacy') {
    throw new Error('独立技能包仅维护 PPT Master 原生路线。历史实验入口保留在原工作区，请在那里使用原来的历史工具；本包不会自动重建或改写旧实验。');
  } else if (['doctor','init','prepare','gate','build','check','states','release-check'].includes(command)) {
    const {runNativeCommand} = await import('./native-route.mjs');
    await runNativeCommand(args.length ? args : ['doctor'],{root,skillDir});
  } else {
    throw new Error(`未知命令：${command}。\n${help}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
