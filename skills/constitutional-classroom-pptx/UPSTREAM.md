# 上游来源与分发边界

本技能在 PPT Master 的完整设计制作能力上加入高校课堂教学定制。

- 原项目：[hugohe3/ppt-master](https://github.com/hugohe3/ppt-master)
- 固定提交：`ca04346de145ed6462ddf34682848e71df5e20a2`
- 原技能版本：`6.7.0`
- 分发来源：该提交的 `skills/ppt-master/`，完整放在本包 `vendor/ppt-master/skills/ppt-master/`；共享 `docs/` 和根许可按原目录层级保留，策划方法中的跨目录引用仍然可读。
- 本地 Python 缓存不是官方分发内容，不纳入打包。
- 原版文件保持原字节，不删减设计方法、模板、图标、编译能力、署名或完整性检查。`upstream-manifest.json` 记录逐文件摘要；`scripts/verify-upstream.mjs` 可复核。

教学定制文件位于本包自己的 `SKILL.md`、`references/` 和 `scripts/`。它们整理课程材料、设计任务、简单点击、来源及审阅证据；原项目负责成熟设计方法和原生 PowerPoint 导出。加入教学定制不等于改用固定框线版式。

`references/calibration/`另含PPT Master Examples固定提交`5f9923ad9bb1882a88aa29e5311a6a8a28cfc77a`的五张公开矢量内容页预览及该仓MIT许可。逐文件来源、规划与成品差异见该目录`SOURCES.md`和`sources.json`。预览只作视觉校准，不证明Office实显、原始生成次数或跨模型稳定；照片未另行打包。

PPT Master 原代码按 [MIT 许可](vendor/ppt-master/LICENSE)分发，保留 [原作者与赞助信息](vendor/ppt-master/skills/ppt-master/SPONSORS.md)。第三方素材遵守其各自许可，特别是[图标声明](vendor/ppt-master/skills/ppt-master/templates/icons/THIRD_PARTY_NOTICES.md)和原技能 `scripts/pptx_shapes/data/` 内的声明。本包新增适配部分采用根目录 MIT 许可；此许可不覆盖第三方品牌标识、照片或独立素材的权利。

不随包分发个人课程大纲、逐字稿、实验课件、对话、密钥、字体文件、OfficeCLI、办公软件或 Python/Node 依赖二进制。依赖按安装说明在本机配置。上游包含可选扩展，但教学默认路线不启用视频、旁白或付费图像接口；确有需求时按所选扩展配置。

这是独立的教学定制项目，不代表 PPT Master 原作者背书。升级上游应单独核对变更和兼容性，不在每次制作课件时自动追踪最新版。
