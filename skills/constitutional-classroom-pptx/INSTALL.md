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
node <技能目录>/scripts/run.mjs render <工程> <成品或状态.pptx> --backend office
```

命令保存源副本及逐页来源凭据。已有演示程序可借用接口，但只打开并关闭本次只读副本，不改动或关闭用户文稿。它导出静态图片，不证明动画放映。显式 `--backend libreoffice` 可调用现有 LibreOffice 和 `pdftoppm` 作替代渲染；可用 `PPT_SKILL_LIBREOFFICE`、`PPT_SKILL_PDFTOPPM` 指定路径，缺少时明确失败，不自动安装。替代渲染不会冒充 WPS。直接调用底层PowerShell脚本没有完整来源凭据，不能直接用于新交付审阅。

v0.5.2增加原版规则覆盖要求，旧审阅须按 `render → review-pack → 真正独立审阅 → review-import → release-check` 重新验证，不能批量补PASS或编造宿主回执。没有改动且来源绑定仍有效的实际渲染可以复用，不能伪造重新观看。无独立上下文的宿主可制作和自审，但不能给出独立通过状态。

更新其他宿主已安装技能时保留自己的 `.venv`、`node_modules`、`runtime.local.json`；先比较其本地修改并备份，不覆盖正在制作课件的安装目录。升级后重新加载技能，确认实际读取的路径和版本，再运行doctor。其他宿主自己追加的门禁不属于本包验证范围，须单独核查，不能只改版本号算合并完成。程序环境和核心测试可运行 `npm test`、`npm run test:integration`；后者使用临时合成材料，不读取个人课程，也不作美感评价。

公开仓库：[takehaya1111/course-ppt-skill](https://github.com/takehaya1111/course-ppt-skill)。版本与上游来源见 [UPSTREAM.md](UPSTREAM.md)。
