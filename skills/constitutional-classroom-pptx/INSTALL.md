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

命令保存源副本及逐页来源凭据。已有演示程序可借用接口，但只打开并关闭本次只读副本，不改动或关闭用户文稿。它导出静态图片，不证明动画放映。显式 `--backend libreoffice` 可调用现有 LibreOffice 作替代渲染；`PPT_SKILL_LIBREOFFICE`、`PPT_SKILL_PDFTOPPM` 可指定程序路径，显式配置错误会停止。Office 失败不会自动切换软件。替代渲染不会冒充 WPS。直接调用底层PowerShell脚本没有完整来源凭据，不能直接用于新交付审阅。

LibreOffice 的 PDF→PNG 步骤优先使用已安装的 `pdftoppm`。仅在自动发现不到它时，可使用可选的 PDFium 回退；需要时安装：

```powershell
node scripts/setup.mjs --pdf-rendering
# 离线安装可追加 --offline <wheel目录>
```

此选项在本技能 `.venv` 中安装核心依赖和 `requirements-rendering.txt` 固定的 `pypdfium2`，不改系统 Python。若使用 `PPT_SKILL_PYTHON`，须在该解释器中安装相同依赖。核心 `doctor` 通过不代表可选渲染已配置；实际回退前会加载 PDFium 并在内存中试渲染、核对版本，未安装会明确报错，不自动下载。渲染记录标明真实工具、版本、脚本哈希和回退原因。LibreOffice 成功退出但未生成 PDF 时最多重试一次，各次输出和错误均保留；其他错误不按此条件自动重试。

遇到办公软件环境问题时，可显式追加`--output-dir <全新短路径>`，把本次只读副本及渲染证据放在另一目录；相对路径按调用者当前目录解析，原工程和源课件不会迁移，收据仍绑定原工程。目录必须尚不存在，每次另取新名以保留失败记录。短ASCII路径是可尝试的排障选择，不代表所有中文路径都不支持，也不自动掩盖先前失败。

v0.5.2增加原版规则覆盖要求，旧审阅须按 `render → review-pack → 真正独立审阅 → review-import → release-check` 重新验证，不能批量补PASS或编造宿主回执。没有改动且来源绑定仍有效的实际渲染可以复用，不能伪造重新观看。无独立上下文的宿主可制作和自审，但不能给出独立通过状态。

v0.5.3进一步要求逐页`spec_says`完整保留冻结页卡。旧报告只引用标题或片段时须对照完整要求重新审阅，不能只拼接文字补签。构图仍可按原版调整，程序不要求每页新增Structure等数量字段。

更新其他宿主已安装技能时保留自己的 `.venv`、`node_modules`、`runtime.local.json`；先比较其本地修改并备份，不覆盖正在制作课件的安装目录。升级后重新加载技能，确认实际读取的路径和版本，再运行doctor。其他宿主自己追加的门禁不属于本包验证范围，须单独核查，不能只改版本号算合并完成。程序环境和核心测试可运行 `npm test`、`npm run test:integration`；后者使用临时合成材料，不读取个人课程，也不作美感评价。

公开仓库：[takehaya1111/course-ppt-skill](https://github.com/takehaya1111/course-ppt-skill)。版本与上游来源见 [UPSTREAM.md](UPSTREAM.md)。
