# 课程pptskill

面向高校日常课堂的可编辑 PPTX 制作技能，当前版本 **0.5.2**。从课程总纲、分纲、完整口播和教学材料出发，把教学要求接入 **PPT Master 的完整设计与原生导出流程**。

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

v0.5.2沿原版审阅补足逐项覆盖与软问题处置：明确传入阅读方式、间距原文、页角色、真实画布，拒绝“报告仍列多处问题却整体通过”的矛盾结果；不把有意非对称、标签字号或未识别关系的间距统计变成新硬规则。高频教学任务按需使用固定来源的内容页参照，核规划与成品差别，保留原版作者改变构图的能力。旧审阅不能补填默认通过后沿用，须重新实际审阅。详见[教学任务校准](skills/constitutional-classroom-pptx/references/teaching-calibration.md)。

v0.5.0 已将材料分层、语义提炼、跨讲共同设计与实际页面审阅写入原版制作主线。v0.5.1 把先前仍可绕过的执行环节补齐：

1. `prepare/build` 直接调用原版设计纲和执行锁的版本化校验，缺标记不能跳过。
2. 使用原版实际载体收据，对照逐页任务检查图文、关系和素材是否落在画面；统计不是图片配额或自动美感分数。
3. 实际 PPTX 渲染登记源文件、页号、PNG 与软件；状态报告绑定本次构建，终态图片不能冒充其他点击状态。
4. 原版逐页审阅格式进入独立上下文；冻结完整设计目标、真实参照、材料与风格观察项，保留宿主实际指派和返回。作者自填 `independent:true` 或改弱目标不能获得交付通过。

具体流程是 **材料 → 原版策划和唯一设计纲 → 逐页制作 → 实际渲染 → 独立看图 → 修复和交付检查**。方法见[材料到表达](skills/constitutional-classroom-pptx/references/material-to-expression.md)、[课程整体感](skills/constitutional-classroom-pptx/references/course-design-continuity.md)和[设计审阅](skills/constitutional-classroom-pptx/references/design-review.md)。不增加平行规划器、固定页型目录或教师逐批审批。

旧审阅记录不能自动升级为通过。缺独立上下文能力的宿主可制作和自审，但只能如实标记自审稿。程序核记录一致性，不证明实际理解、审美水平或抵抗同权限伪造全部文件。**尚未证明整门课程、所有模型或所有操作系统有同等质量和速度**。包内不附个人讲稿、实验课件或对话记录。

## 来源与许可

基于 [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) 6.7.0，固定提交 `ca04346de145ed6462ddf34682848e71df5e20a2`。原作者、赞助信息、许可、第三方素材声明和完整性检查全部保留，参见 [UPSTREAM.md](skills/constitutional-classroom-pptx/UPSTREAM.md)。本项目是独立教学定制，不代表原作者背书。

新增适配部分采用 MIT 许可；上游及第三方素材按各自许可使用。仓库采用原字节保存规则，避免换行转换破坏上游完整性校验。
