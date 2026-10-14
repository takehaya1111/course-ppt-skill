# 课程材料到设计纲与制作输入

本文件用于新课制作。模式是模型读懂内容并设计，程序核对已明确的输入；不能把机器契约当作自动理解教材的替代品。

## 1. 当前材料与固定副本

从用户指定课程的当前入口定位认可大纲与现稿。记录文件实际哈希和读取日期，复制到本次工程的`sources/`；保留完整材料，不把历史演示节选升为当前全稿。`sources`保存原件身份，课程仓原文件保持只读。需要摘录、分段或转换时另存派生文件，记清对应原文位置，不覆盖原件。

至少区分：课程/本讲纲、逐字稿、真实材料、法条/引文、设计参考。旧课件可以提供材料或反例，但不自动决定新课的页数和构图。源文件改变时先明确版本变化，不能自动改哈希让校验继续通过。

## 2. 设计纲的固定基础

先读技能内`vendor/ppt-master/skills/ppt-master/`的官方策划指导，再采用其`design_spec.md`结构作为正式PPT设计纲，字段和章节按官方`templates/design_spec_reference.md`，具体内容用中文。另由它生成`spec_lock.md`，格式遵官方`templates/spec_lock_reference.md`。这两个文件各负其责，不另写一份与它们冲突的自动生成大纲。[教学定制需求模板](teaching-customization-template.md)提供需要填进相应章节的教学内容，不取代官方结构。

| 我们的教学需要 | 设计纲中的落点 |
| --- | --- |
| 本讲目的、受众、课时、授课方式与材料边界 | §I Project Information |
| 整讲共同色彩、字体、图像与节奏 | §III—V，投影到执行锁 |
| 所用叙事/视觉资源及实际采用行为 | §III的Mode References/Behavior与Visual Style References/Behavior；自定义方向也写明借用何种能力 |
| 专业内容页参照与可检查的完成度目标 | §V的设计目标/参照段；最终审阅单独作designTarget结论 |
| 真实图像身份、作用、来源、完整/可裁切 | §VIII Image Resource List |
| 这一页学生从什么认识走到什么认识 | §IX Audience move |
| 教师在此讲什么、原稿哪些段落与备注如何对应 | §IX Notes，及机器契约noteParagraphs |
| 屏幕承担什么，哪些文案必须原样保留 | §IX Content、Core message；字面锁进入requiredText |
| 并列、顺序、归属、对应、因果或限制 | §IX Relationships；不能因版面方便改语义 |
| 推荐构图与跨页延续对象 | §IX Composition；是设计参照，不提前冻结所有坐标 |
| 真实材料及教学示意怎样进入本页 | §IX Images / Visualization |
| 教师何时点击，什么常驻、什么揭示 | §IX Motion；对应animations.json与clicks |
| 完整口播、来源及必要辨析 | §X及逐页notes |

先建立整讲页序和理解推进，再画具体页。连续对象由内容关系产生，例如同一法律主体、同一材料的局部、同一总图的分支。章节封面、回扣和比较页按内容需要设置，不机械一章一页或把所有段落变成标题列表。

设计纲同时分解实际制作需要：材料图取得或生成、图像裁切与说明、原生图形/图标、关系组织、投影排版、备注、点击和检查。按[上游复用落点](upstream-adaptation-map.md)优先选择现成方法和工具；没有对应能力时才限定范围改造。图像、表格和效果由用途触发，不要求每页凑齐。

`Relationships`保留中文完整语义，并按实际关系附上内部类型`order/link/parent/membership/contrast/overlap`或明确的`none`。它们只是结构提示，不代替法律含义。官方统计只识别其中部分英文词，不能因为统计为0就跳过中文关系审阅。页型`anchor`只用于真正封面、章节、目录、收束等结构页，不把普通内容页批量标为anchor。

构图可以改变；改变后，页面仍须清楚呈现相同的主体、关系、条件和比较基准。比如目标写了“区分产生与监督方向”，不能只把相应词语放在不同位置就算完成；如果文字/对齐比连线更合适，应具体说明它怎样帮助学生理解，而不是笼统说“简洁”。简短设计摘要留在现有页卡/作者记录里，不要求暴露内部思维过程。

## 3. 最小机器契约

本次工程根目录保存`course-project.json`，格式权威是[native-contract.schema.json](native-contract.schema.json)。它只记录可机械核对的事实，不能代替设计纲。

| 字段 | 填法与意义 |
| --- | --- |
| version / title | `1`与本次课件标题 |
| sources | 每个实际冻结文件的`id,path,sha256,kind`，可附原件`originalPath`。`path`相对本次工程，不能指向工程外或外部目录链接 |
| slides | 按最终顺序逐页列`stem,clicks`。stem与`svg_output/<stem>.svg`、`notes/<stem>.md`完全同名；建议01、02等足够宽度的序号。clicks可为0 |
| slides[].requiredText | 必須上屏且保持字面的法条、引文等；校验作者稿和实际PPTX。不应把全页所有解释文案机械锁死 |
| slides[].noteParagraphs | `{sourceId,indices:[1,2,...]}`，索引对应冻结源按空行分开的段落，1起算。源备注保留这些原段，实际备注按官方Markdown转换结果比对 |
| requireFullScriptCoverage | 应完整进入备注的逐字稿sourceId列表。列入的源段须在页分配中恰好一次；课件中回扣可以重复意思，完整原稿段落的归档只需一次 |
| assets | 实际嵌入文件的`id,path,sha256,kind,sourceUrl,slides`。无图可为`[]`。slides列实际使用的stem；原件/艺术图/教学示意身份写清 |
| assets[].exactBytes | 默认且只接受`true`，防止换图或暗改；若事先制作裁切件，登记实际嵌入裁切件，并另保留原图及裁切来源记录。SVG中允许的原生显示裁切仍需目视核对 |
| export.nativeChartsAndTables | 只有教学确需真实Chart/Table数据编辑时设`true`；否则省略或false |

Markdown标题也占一个源段，不要按目测行数猜段号；用固定分段结果建立索引。标题/粗体等合法Markdown格式在备注中会按官方规则去除，检查同时核原段进入源备注和转换后的实际文本。若源材料混有非口播记录，先保存可追溯的口播派生文件，再对它要求全文覆盖，不能删掉真正的口述内容来降低验收量。

每页同名备注必须存在且非空。可另外维护`notes/total.md`；若两者同时存在，build会在独立目录拆总稿并核对与逐页备注一致，不替你覆盖冲突。备注要与当前页面、来源身份相符，不能把工程日志或模型自评放进去。

`assets`登记全部实际图片，含合法生成的示意配图；本地用户图没有网页时sourceUrl可写明确的本地原件标识。完整出处、许可/取得范围和生成图身份另存`assets-sources.md`，不要往机器契约擅加未声明字段。不得将语义审查或用户认可写成程序默认通过项。
