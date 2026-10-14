# 实际设计审阅与交付证据

审阅回答两类问题：内容是否准确、可用；画面是否实际完成教学任务并达到选定参照的完成度。前者通过不自动推出后者。依据当前真实图像，程序只填写路径/哈希等事实，不能替审阅者生成“看过”“满意”或审美PASS。

## 必须实看的内容

- 最终PPTX的全部终态，以及每页0..clicks的有效显隐状态。无动画页只看state0；其他页面在某阶段重复出现的同一终态不另算新状态。
- 页面主张、法条条件、素材身份，及其与备注的对应。
- 关系页的方向、并列、归属、共同分母或限制是否在画面上清楚可见。不能以存在几个箭头、字体清楚来替代这一判断。
- 相邻页是否保持共同对象及阅读方向；不同教学任务是否无理由地重复同一中性排列。
- 本次选定参照与代表页的实际差距。比较表达方法与完成度，不按像素复制、不按图片/图形数量打分。纯文字确实更能完成本页任务时允许通过。

每页给简短可核观察，例如“同一分母比例尺上标出两个门槛，但过半线未区分严格大于，需修”；不得写成“符合高级风格”这类无法回到画面核查的结论。

关系页还要核对象身份和所处阶段：引入多个对象后，回到原对象应能唯一辨认；结果尚未产生时，图形不能提前暗示它已完成。检查具体语义，不普遍禁止某种造型。由总图进入一路、再回到总图时，看学生能否通过持续的视觉定位理解变化，而不只靠重读标题。共同条件写在计划中还不够，图中的共同区域、对应字段或必要文字也要实际出现。

## 最终记录

实际独立审阅者写`validation/design-review.json`，格式由[design-review.schema.json](design-review.schema.json)约束。它不是给模型预填PASS的模板。

顶层字段：

- `artifactHash`：当前PPTX SHA256。
- `buildRecordHash`：`validation/current-build.json`中的sha256，其file指向不可覆盖的本次build记录。
- `designSpecHash/specLockHash`：来自该build记录；current-build记录已绑定完整SVG、素材、备注、动画和课程契约输入。
- `reviewer:{kind:"agent"或"human",name,independent:true}`，`reviewedAt`为实际ISO时刻。
- `status:"pass"或"fail"`，`unresolvedIssues`为未解决问题清单，通过时为空。
- `limitations`至少写明实际取得的渲染/显隐/放映边界。
- `deckReview`含`continuity,hierarchy,compositionByJob,referenceComparison`四段具体观察。
- `designTarget`独立记录专业完成度：`status:"met"或"not_met"`，`reference`写实际对照的作品及页面，`criteria`列本次既定准则，`comparison`写当前画面与参照的具体比较，`remainingGaps`列尚未达到目标的差距。达到时差距数组为空；不能只填“符合要求”。
- 有动画时另有`stateReportPath/stateReportHash`，指向本次states命令reportDir中的artifact-check.json。

`pages`一条对应一个有效`slide/state`，包括：`imagePath/imageHash`、`renderSourcePath/renderSourceHash`、`pageJob`、`relationships`、`realization`、`observations`、`status`、`unresolvedIssues`。全部路径用真实绝对路径。`realization`指出承担关系的对象或空间安排；文字页说明文字表达怎样完成任务。

有动画时renderSourcePath取本次实际渲染的stage副本；无动画全套的state0直接取终稿PPTX。不允许用旧图、别组稿、源SVG截图冒充最终PPTX渲染。哈希可以由脚本采集，观察和结论必须来自实际看图。

完成后运行`release-check <工程> <PPTX>`。它核当前制作输入、生成记录、PPTX、状态副本与图像证据链。只改SVG却沿用旧成品/旧审阅会被拒绝；重build后也不能原样沿用旧PPTX哈希。

`designTarget.status`为`not_met`时，总状态应为`fail`，明确差距并修复后重新审阅。程序会拒绝缺少此结论或未达到目标的记录；它不会自动判定图好看。已达到目标后仍有不影响目标的精修建议，可放入观察段，不伪装成尚未解决的目标差距。v0.3及更早审阅缺少该字段，不能为兼容性自动补`met`，须实际对照当前产物补充审阅。

## 前5页内部设计回看

写`validation/early-design-review.json`，结构同上，但用`earlyRecordHash`替代artifactHash/buildRecordHash。前5页各state0一条；renderSourcePath/Hash取`validation/current-early.json`指向的run.json中`pages[].path/sha256`，该路径是独立SVG快照及对应素材，设计/锁哈希也取early记录。实际预览要与快照字节对应。

早期稿无需notes已完成；审阅重点是方法是否正确、共同语言和代表性构图是否成立。发现问题修复后重新形成真实检查/审阅证据，不把后面已经画完的页面隐藏起来补造历史。独立审阅写完后，在仍只有5页时第二次调用gate early收录，取得EARLY_REVIEWED再写第6页；这一步不能事后补办。这里不需要教师再次审批。

## 审阅独立性的边界

审阅者应与本批作者分开，拿到教学任务和原始依据、实际渲染、选定参照，自己判断而非照作者自评填表。模型审阅可能失误，证据绑定也不是防篡改安全系统；它们用于暴露遗漏、错误版本和明确未解决问题，不证明任意模型美感稳定。用户认可和真人教学效果另记。
