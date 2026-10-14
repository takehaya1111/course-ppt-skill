# 安装与运行

这是“课程pptskill”的独立技能目录。完整复制本文件所在的 `constitutional-classroom-pptx` 文件夹到自己的 `~/.codex/skills/`；如果已有旧版，请先保留旧版。不要只复制 `SKILL.md`。

需要 Node.js 22+、Python 3.10+。在本目录执行：

```powershell
npm ci
node scripts/setup.mjs
node scripts/run.mjs doctor
node scripts/verify-upstream.mjs
```

`setup` 创建本目录的 `.venv` 并安装固定核心依赖，不改系统 Python。首次安装需要访问 npm 和 Python 包源；离线 Python 安装可运行 `node scripts/setup.mjs --offline <已准备好的wheel目录>`，Node 依赖也须事先缓存。技能规则与上游资源已在本包中，不需要额外克隆实验库。

已配置好的 Python 可由环境变量 `PPT_SKILL_PYTHON` 指定。可选 OfficeCLI 可由 `PPT_SKILL_OFFICECLI` 指定；设为 `disabled` 明确关闭，未安装时附加格式校验标记为跳过。技能内 `runtime.local.json` 也可设置 `python` 与 `officeCli`，仅保存在本机，不能随公开包分发。

核心安装提供原生 PPTX 导出。布尔图形、文字轮廓、图片处理与获取等扩展按需求查阅 `vendor/ppt-master/skills/ppt-master/requirements.txt`，在同一 Python 环境中安装对应依赖；核心环境通过不等于所有可选扩展已配置。没有配置的收费服务不会自动启用。

从任意工作目录调用本技能绝对入口：

```powershell
node <技能目录>/scripts/run.mjs init <新工程目录>
```

相对工程路径按调用者当前目录解释。后续制作流程看 [SKILL.md](SKILL.md)。不要运行内嵌原版的 `update_repo.py` 来更新本包；上游固定版本随本项目经过验证的发行版更新。

Windows 上可用已安装的 WPS 或 PowerPoint 进行真实静态渲染：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File <技能目录>/scripts/render-office-com.ps1 -InputPptx <成品.pptx> -OutputDir <新渲染目录>
```

助手检测到已运行的演示程序会退出，不接管正在编辑的文件。它导出静态图片，不证明动画放映已经验证。程序环境和核心测试可运行 `npm test`、`npm run test:integration`；后者使用临时合成材料，不读取个人课程，也不作美感评价。

公开仓库：[takehaya1111/course-ppt-skill](https://github.com/takehaya1111/course-ppt-skill)。版本与上游来源见 [UPSTREAM.md](UPSTREAM.md)。
