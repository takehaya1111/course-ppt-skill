# 课程pptskill

面向高校日常课堂的可编辑 PPTX 制作技能，当前版本 **0.5.0**。从课程总纲、分纲、完整口播和教学材料出发，把教学要求接入 **PPT Master 的完整设计与原生导出流程**。

保留成熟的页面设计能力，再加入课程定制：学生应理解什么、知识之间是什么关系、画面怎样表达、真实材料如何使用、整讲如何统一、教师何时点击。具体构图由内容决定，不固定成一种模板。

## 能做什么

- 编排可执行的 PPT 设计纲，保留讲稿、引用、来源和关键条件。
- 按需要调用原版的构图、图片、图标、原生形状、图表与表格能力。
- 制作可编辑 PPTX 和简单点击淡入；SVG 是制作中间稿。
- 检查文字与备注、素材、动画目标、有效显隐状态和输入版本一致性。
- 将“文件机械检查通过”和“看图后设计目标达成”分别记录；后者需要实际审阅。

默认不制作 HTML 成品、视频、旁白或自动播放课件。原版包含的其他能力按需启用。

## 安装

技能目录是 [`skills/constitutional-classroom-pptx`](skills/constitutional-classroom-pptx)，包含完整上游源码与设计资源。可以下载 [发布页](https://github.com/takehaya1111/course-ppt-skill/releases)的“课程pptskill”压缩包，也可以克隆本仓库。

1. 将 `constitutional-classroom-pptx` 文件夹放入自己的 Codex 技能目录（通常是 `~/.codex/skills/`）。如已有同名版本，先保留旧版本再更新。
2. 安装 Node.js 22 或更新版本、Python 3.10 或更新版本。
3. 在该技能文件夹打开 PowerShell，执行：

```powershell
npm ci
node scripts/setup.mjs
node scripts/run.mjs doctor
```

安装过程会创建技能内的 Python 虚拟环境，不更改全局 Python。也可以通过 `PPT_SKILL_PYTHON` 指定已经配好依赖的解释器。详细选项以 `node scripts/setup.mjs --help` 和技能内安装说明为准。

如需 Windows 办公软件真实渲染，可使用已有 WPS 或 PowerPoint；`scripts/render-office-com.ps1` 只用于静态渲染，不代表真实放映验证。OfficeCLI 是可选的附加格式校验工具，缺失会明确标记跳过。布尔形状、字形轮廓、图片获取等扩展的依赖见原版 `vendor/ppt-master/skills/ppt-master/requirements.txt`，按实际需求安装。

## 使用

在新对话中指定技能及材料，例如：

> 使用 $constitutional-classroom-pptx。读取我指定的本讲大纲和逐字稿，先编排 PPT 设计纲，再制作课堂可编辑 PPTX。保持整讲色调、字体和共同元素统一，构图随教学关系变化；文字精简，必要时配真实图片，动画只用简单点击。先做我指定范围，不自行扩展整套课程。

制作入口与通用模板见 [SKILL.md](skills/constitutional-classroom-pptx/SKILL.md)。程序不会代替模型进行教学取舍和艺术判断，也不会自动生成“已实际看图”的审查结论。

## 这一版落实了什么

本版沿原项目的策划、逐页九步与关系表达方法补强四项：

1. 分清总纲、分纲、完整口播各自提供的内容与实际版本，处理真实冲突。
2. 用“原稿含义→教学任务→屏幕需要→实际验收”的合成正反例说明怎样提炼，而非只填栏目。
3. 独立讲次实际读取同一课程设计依据与已认可代表页，将共同角色写入原版设计纲和设计锁；具体构图保持开放。
4. 当前页面既对照原材料，也和已有讲次代表页一起看；区分语义准确、成套感与专业完成度。

方法见[材料到表达](skills/constitutional-classroom-pptx/references/material-to-expression.md)和[独立讲次的整体感](skills/constitutional-classroom-pptx/references/course-design-continuity.md)。主线仍为 **总纲＋分纲＋完整口播 → 原版策划与唯一正式设计纲 → 制作、导出和实际审阅**。具体分工见[教学主线](docs/教学主线与落实方案.md)。不增加平行规划器、固定页型目录或教师逐批审批。

继续保留 v0.4.0 的完整原版作者能力与独立设计目标审阅。明确未达标或缺少真实审阅的成果不能被作为完成版交付；已有成品修订、前段校准和最终检查仍分别绑定实际输入、PPTX 与图片。本次主线修订不修改导出器或增加一套平行制作框架。

已完成小样制作与本版独立包技术验证。**尚未证明整门课程、所有模型或所有操作系统具有同等质量和速度**。本包不附个人课程讲稿、实验课件和对话记录；使用自己的材料与参考作品。

## 来源与许可

基于 [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) 6.7.0，固定提交 `ca04346de145ed6462ddf34682848e71df5e20a2`。原作者、赞助信息、许可、第三方素材声明和完整性检查全部保留，参见 [UPSTREAM.md](skills/constitutional-classroom-pptx/UPSTREAM.md)。本项目是独立教学定制，不代表原作者背书。

新增适配部分采用 MIT 许可；上游及第三方素材按各自许可使用。仓库采用原字节保存规则，避免换行转换破坏上游完整性校验。
