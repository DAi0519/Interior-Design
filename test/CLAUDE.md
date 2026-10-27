# test/
> L2 | 父级: ../CLAUDE.md

成员清单
image-upscale-area-cap.test.mjs: 两KS全档位整图/严格padding后20MP、最大偶数比例尺寸、无外部分块、推理/插值交付分离、非KS隔离、15分钟与异常不重提；无GPU
image-mask-fill-qwen.test.mjs: Qwen双模式条件/遮罩同尺度、4步完整重绘/恢复回贴、独立目录/路由/零GPU阻断、真实尺寸及模型附件归档
image-mask-fill-qwen-fixture.mjs: 2026-10-21 MaaS节点端口/模型固定快照，独立于执行图供Qwen离线合同验证
image-mask-fill-ui.test.mjs: 框选/圈选入口常显且非GPT禁用并明确模型提示/GPT可用，画笔/矩形/自由圈选三历史独立/触屏闭合/取消保旧轮廓/换图清除/长轨迹简化≤2048、多边形归一化深拷贝及坏点退化准入、逐工具旧目录能力阻断/恢复、两模式mask互斥/推荐占位/手写保留/档位质量任务回归
oneapi-image-async.test.mjs: Responses后台提交/同ID轮询、PNG和图序保真、终态与ID异常、单次POST、总deadline及取消清理的离线合同测试
oneapi-image-client.test.mjs: 异步客户端鉴权/完整PNG与图序、真实request从POST到GET、费用/URL/Base64归一化、正文取消及空结果不重提的内存集成测试
image-mask-fill-oneapi.test.mjs: GPT无mask异步/透明mask同步分流与即时上游ID进度、双模式可选mask/独立矩形与凹多边形真实蓝线且不画bbox、形状中立物体Prompt与图2身份、归一化及像素区域冻结/队列嵌套点deepcopy/容量退化互斥零付费、送模PNG精确归档与原生字节直出、三档五质量/权限/Schema/错误无重试，全部替身
image-mask-fill-archive.test.mjs: 七字段Schema及GPT矩形/多边形双模式真实圈选PNG独立附件/送模字节一致/原件保留/无mask附件留空；坏摘要size和非区域注入阻断，完整Prompt及区域像素元数据冻结、两次字段附件回读/同步故障及普通功能兼容，无真实飞书调用
image-mask-fill.test.mjs: Flux2 两模式独立节点/模型/端口准入、首图latent与裁剪回贴/实际提示词与用户原文来源/单次三图载荷/唯一产物、真实PNG红通道/EXIF遮罩对齐/6MB与4096边界、三档原尺度裁剪/横竖图最高2K/小图不放大/错误交付尺寸阻断、专用客户端与单项任务/独立飞书scope、合同409零入队、无调度本机试跑回归，不调用GPU或外网
room-renovation-workflow.test.mjs: 旧房原图→清空→空房Agent/设计的真实PNG字节隔离、三图/两步关联归档/尺寸/SHA、全部家电含壁挂空调与嵌入式移除且保留硬装固定柜体/清空v2版本归档、参数/Agent/模型准入零收费、清空/设计失败零自动重试及失败保留中间图、任务多项/独立恢复/阶段/Schema漂移合同；模型和飞书使用内存替身
camera-sphere-scene.test.mjs: 前后半球网与原图/动态相机的真实绘制顺序、双缓存逐帧不重分配或重建、尺寸/DPR变化重建、前后遮挡/极限机位有限坐标/隐藏不分配/最短弧跨零度过渡，不调用GPU
image-multi-angle-oneapi.test.mjs: 三方逐项权限与断开、Sunburst五档quality透传及结果/费用归档/默认medium/非法质量零调用、统一路由/任务模型身份冻结、真实输入2K与原生/交付尺寸、实际指令归档、反打背景约束、只缩小/失败不重试/角度语义，不调用收费接口
image-multi-angle-integration.test.mjs: 统一任务→专用客户端→2K压缩实际字节→飞书原图/结果/指令归档及脱敏元数据，单图准入/失败无重试/同ID幂等/按功能恢复，内存替身不调用GPU
image-multi-angle.test.mjs: 长边2K直接推理/无后置放大/小图不放大/大图EXIF与真实压缩字节/准入边界、独立试跑三档景别仅文本变化/远景后退构图优先/连续值拒绝及摄影机方向闭合/后半圈背面语义与90/270边界/非法输入、VAE参考与采样尺寸同源、节点模型准入、错误尺寸与真实身份回归，不调用GPU

beta-style-transfer.test.mjs: Beta风格转换显式平台/参考图来源、独立版本冻结、样本功能/成员/Agent权限前置阻断、主图惰性单图与共享参考图去重、双Provider/Prompt缓存/瞬时重试、三附件/来源/配置逐字段回读与轻量预览合同测试，全用内存替身

style-transfer-workflow.test.mjs: 风格转换平台风格/必填参考图独立 Agent 与版本、缺失目标及智能默认拒绝、空间保护、主图单图出图、OneAPI/Flux矩阵与负向Prompt、跨功能/参考图缓存隔离、strict JSON、后台入队与Schema 409阻断内存集成测试，不调用模型或真实Base

beta-style-transfer-ui.test.mjs: Beta十功能目录中的风格转换明确目标、无智能默认/首项自动选择、平台/参考图独立版本、下拉真实交互及参考图上传锁平台/删除重选/白模恢复、十功能样本集与路线快照持久化、跨样本模型共享参考图去重测试

style-transfer-ui.test.mjs: 风格转换单主图必填、明确目标必选且无智能默认/首项自动选择、白模选择隔离、参考图上传切换/平台禁用/删除清空重选、平台/参考图独立版本和Agent语义、共享图片载荷、提示词复用及任务恢复测试，不调用付费模型或真实飞书
room-renovation-ui.test.mjs: 旧房单主图与空房双模式配置复用、空房后端路由/两阶段标记/单份图片载荷、独立任务恢复及服务端设计阶段消息优先/禁止Prompt复用、三图默认设计与按钮/ARIA/下载目标真实绑定、流程说明幂等显隐测试，不调用模型或真实飞书

beta-base-schema.test.mjs: live Store实时三表读取、含AI扩图的十功能和普通/独立扩图/图片输入Agent单选标签准入及历史附加项兼容，缺扩图功能或模型选项、字段/类型/附件/关联漂移在入队及样本保存前阻断，复用现有版本/配置/三图字段和晚遇CLI合同错误不重生成的内存测试
beta-id-flow.test.mjs: 跨功能按原样本ID运行及目标功能真实字节校验， ID 批次成员/功能绑定、超过20MB整集零原图入队、两并发按需取图、实际单图8MB/MIME保护、草稿显式空状态及逐张幂等保存/完成回读测试，使用内存CLI/模型替身
beta-sample-reuse.test.mjs: 真实源图/内存CLI的跨来源ID复用及目标功能全景/空房/扩图合同，源集和样本零复制/写入、free可信prompt与纯文字缺图阻断、成员/记录关联/状态/8MB/MIME守卫、新建按当前功能归属；不调用真实模型或飞书
beta-sample-library.test.mjs: 跨图像功能复用原样本ID/零重传、提示词集分流、保存选集优先/同功能回退、新建归当前目标、同目标保留本次房型与两级异步防串；缺图缺词整集阻断及目标全景元数据校验；24MB逐张读取/上传、稳定ID、部分失败后只重试剩余项、全景 2:1 源图准入与拒绝后释放预览、保存忙碌守卫与完成回读后ready、元数据无原图测试，使用假DOM/假API

effect-beautification-ui.test.mjs: 效果图美化浏览器合同，六组合与失效缺省、独立单图主题、脱敏版本/就绪无常驻说明/失败原因及不携带环境控件的挂载语义骨架，使用纯函数/静态源码不触发真实生成

image-outpaint.test.mjs: 扩图真实尺寸/EXIF/双UNET/固定2K与HTTP合同；超分整图保留VAE编解码槽位且无需外部分块节点、后置ImageScale准入及主/Beta缺节点同因阻断，均用内存替身
image-outpaint-workflow.test.mjs: AI扩图1082来源/643线索、4K输入/32与8对齐、OneReward FP8默认与原版Flux Fill UNET/dtype唯一变化及metadata身份、原Janus/采样参数保真与19节点含SaveText实际正文透传/History捕获、传输适配/请求隔离及实际尺寸追溯测试，不提交GPU任务
image-outpaint-oneapi.test.mjs: Sunburst 与 Flux 独立的16384原图/3840适配图边界、4000源图单次等比缩放与狭长源图完整内容/目标短边最小补边及归档事实、原尺寸/透明画布/不透明矩形 mask、九个2K预设及原比例16px/像素/长边/3:1边界、普通生图1K/4K目录隔离、产物身份/费用/权限/HTTP路由及错尺寸多图零重试合同测试，使用假客户端
image-outpaint-canvas.test.mjs: 三引擎原比例与五预设的固定2K目标、可信源比例/8及16网格误差/缩放保持目标、Sunburst原比例超3:1只最小扩大目标短边、省略档位默认2K与显式1K/4K/null拒绝、4K源图适配/定位总和、非法400、EXIF真实方向重算与实际resize字节、透明遮罩及合法旧2K四边兼容测试，不提交GPU或付费任务
image-outpaint-scale.test.mjs: 三引擎固定2K目标下显式scale/动态32px下限/非法范围、真实Sharp等比重采样与EXIF、零扩展提交阻断、scale/实际源图字节归档测试，缺省旧合同保持兼容
image-outpaint-fixture.mjs: 含原比例首项的固定2K共享内存DOM/冒泡捕获/可控RAF/写入统计/transform视觉矩形夹具，默认显式16:9保留旧轨迹，ratio:null验证真实初始默认，供缩放/性能/连续轨迹测试复用
image-outpaint-performance.test.mjs: 高频输入合帧/末坐标提交/失效帧取消与局部绘制隔离测试，覆盖30/60/120Hz输入和60Hz帧调度，不访问网络或GPU
image-outpaint-continuous.test.mjs: 三引擎100帧0.1/0.2px真实绑定轨迹与旧网格冻结对照、四角固定对角/原图比例、松手及重绘无回弹、4K源图按2K目标仅transform无源图布局写入、提交仍满足整数模型网格与误差界限测试，不访问网络或GPU
image-outpaint-transform.test.mjs: 四角锚点与边界、鼠标/触屏/键盘缩放和取消、倍率预设/range连续端点/自定义/提示、浮层重排关闭及移动与缩放互斥的DOM交互测试，不调用网络或GPU
image-outpaint-workspace.test.mjs: 主画布DOM节点/事件保留、四种任务阶段与页签选择保持、键盘焦点、原结果/飞书链接保留、隐藏构图时关闭浮层、上传默认预览/旧任务恢复与完成不覆盖新构图、新任务身份及跨功能ARIA恢复的内存交互测试，不调用模型或网络
image-outpaint-ui.test.mjs: 原比例首项/真实初始默认/上传换图动态重算与显式预设保留、Flux/Qwen/Sunburst三引擎原比例网格及模型参数隔离、双Flux模型下拉/默认值/失效及空目录阻断、无分辨率选项/固定2K与4K源图、鼠标触摸键盘构图/居中、默认1.5倍与scale请求、刷新保留构图/单份原图请求测试
image-outpaint-qwen.test.mjs: Janus未扩边原图描述/question与采样配置不变、25节点原文直连SaveText/positive且无固定前缀/Scene continuation/StringConcatenate、实际History原文捕获及缺失不伪造、独立2511/4步LoRA与约1MP图像/条件/遮罩共同尺度、2K/4K横竖偏心/非16源几何、单一解码图恢复/无回贴来源及边界连续性、COMBO/节点/INT与STRING槽位漂移阻断、真实PNG尺寸/摘要与跨请求旧图零下载，不访问远端或GPU
image-outpaint-archive.test.mjs: 三引擎四模型固定2K及任意原比例选择/实际尺寸/画布参数JSON原样归档、真实Prompt/源图/模型/费用投影、Qwen/Flux仅实际正文与缺失留空、EXIF字节、错尺寸失败零同步、已完成产物无GPU补写合同与超分本机路径回归
image-outpaint-qwen-export.test.mjs: Qwen运行25/独立26节点画布/API与2026-10-20.1真源一致、Janus原文直通且无固定前缀/拼接节点、独立同版2511/4steps FP32与工作台BF16隔离、原生上传/16对齐预处理/显式flow适配、当前AuraFlow控件和SaveImage未连接IMAGE输出、Janus原图描述及STRING正文连线、动态GetImageSize的INT零/STRING空占位、双向端口/类型/槽位/无环、遮罩采样后整图恢复无回贴及无图片凭据地址的离线交付验证
image-outpaint-qwen-service.test.mjs: Qwen 原尺寸/EXIF/五比例固定2K16px目标与真实适配字节、独立能力缓存、Janus/文本与推理缩放节点缺失前置409零GPU、无合成节点的准入/latent遮罩/重建策略与实际Prompt跨结果/归档/飞书JSON追溯、真实模型身份/错尺寸拒绝、专用客户端/OneAPI隔离及HTTP阶段，不提交GPU任务
image-outpaint-drag.test.mjs: 保留旧扩图预处理与四边求和纯函数的兼容、位移换算及非负边界测试，真实交互由image-outpaint-ui.test.mjs覆盖
image-outpaint-drag-integration.test.mjs: 保留旧固定画布的拖动几何公式、边界夹紧与预处理尺寸不变测试，真实绑定拖动保留目标比例由image-outpaint-ui.test.mjs覆盖

CLAUDE.md: 本模块地图，维护自动化测试成员清单

app-update.test.mjs: GitHub 正式 Release 与 SemVer/标准 ZIP 准入、匿名查询、HEAD 兜底不伪造说明、失败降级、超时、缓存与并发去重测试，不访问外部网络
app-update-api.test.mjs: 最新正式版回执绑定、安装政策/安装前与替换前任务空闲、非法 URL/版本/不可检查/并发、待重启/恢复失败保护与 NDJSON 成功失败合同的内存 HTTP 测试
app-installer.test.mjs: 注入 Response 的真实临时 ZIP 安装测试，覆盖官方摘要、Git 源码保护/持久新目录、Release 原地同路径版本更新/旧模块删除/配置数据保留/事务失败回滚与恢复失败备份/人工恢复指引/重复安装阻断、目录竞态/ZIP 路径/重定向/截断/并发合同，不访问网络或启动服务
app-update-ui.test.mjs: 无外链的单一下载安装/按需检查/原位失败重试、发布模板亮点提取/非模板保留/空说明隐藏、完整安装终态/错误码/互斥、两模式确认/指导与未知模式回退、待重启/恢复失败回归，不下载或安装新版
custom-select.test.mjs: 原生select共享适配回归，验证值/change/动态选项/禁用/空占位与唯一视觉入口；指针焦点稳定及无重复菜单实现
choice-controls.test.mjs: 生图页功能/超分按钮共享尺寸、表面令牌、选中态和交互反馈，以及风格下拉版本化资源引用回归
generation-count.test.mjs: 单模型生成张数下拉回归测试，验证 1–4 张归一化、原生 select 渐进增强结构及向上菜单定位
product-navigation.test.mjs: 共享顶栏字体与全局动效回归测试，验证三页预加载同源 Inter Variable、Raycast OpenType 特性、全部 CSS 禁止 transition all/布局属性补间、三页静态首帧激活层、140ms 导航前双层 transform、反复点击重定向、原生链接降级与 reduced-motion 瞬时切换
raycast-accent.test.mjs: 跨工作台最终颜色层回归测试，验证冷白银灰顶栏、纯黑白字选中态、中性浅色普通按钮、含 Beta 全宽 START 的唯一 `#f37021` 标志性盒橙关键动作/保色 RUNNING/小面积状态回声、pointer-down 即时反馈、减少动态/透明度与增强对比度系统偏好、三页最终加载顺序、中性焦点及同源近距阴影的含下载安装的中性弹层动作
local-settings.test.mjs: .env.local 未知项保留、OneAPI Key 原子写入/覆盖/删除、格式校验与持久化状态测试
lark-setup.test.mjs: CLI 配置 JSON、字段读取必需 Scope 与中文授权能力、共享 Base 状态、非阻塞 Device Flow、二维码与授权过期测试
model-config.test.mjs: 七个 OneAPI 模型（含独立 Banana 2.1、GPT Image 2/2.5 全档位 16 对齐/像素与边长边界、原图 1K 16:9 请求与浏览器摘要、2.5 双模型九比例与五质量档）与默认 9B FP8/7 steps Flux 工作流统一可选、Provider、单图、Pro 通用 1K/2K 与仅全景可用的 3040x1520 4K 实验档、Flux Prompt、原图比例 1K/2K 推理及同图 2K→4K/6K 攸行超分、其他接口尺寸不变、全景 2:1 准入及请求白名单测试，不发送真实请求
banana21-model.test.mjs: Banana 2.1 与旧模型身份共存、Main/Beta/API 全档位尺寸一致、512 旧缓存回退与单份原图、Benchmark 稳定配置和 512/2:1 前置拒绝合同测试，不调用模型或真实飞书
generation-batch.test.mjs: 不限总项数的服务端批次标识、浏览器逐模型及功能尺寸/质量适配、Seedream 5.0 Pro 全景 4K 保留、白模/空房/精模格式限制与遗留工作流档位剥离、ComfyUI 分段耗时摘要、并发度二、保序和部分失败测试，不发送真实请求
generation-jobs.test.mjs: 日常生图付费执行前飞书同步合同阻断、任务即时入队、查询恢复、领域阶段快照透传、最多两路并发、八模型端到端批次归档、保序与部分失败测试，不调用真实生图服务；deferred 测试确保成功/失败终态前始终忙碌
beta-base.test.mjs: 独立Beta三表/十功能/真实普通及扩图模型标签、无Agent清空Prompt融合、非法标签零写入及单选回读、草稿默认状态清空/{id}关联、真实源尺寸与8MB保护；扩图引擎/画布/工作流配置、实际Prompt/版本/尺寸/费用及源图结果附件数量/token/字节数逐字段回读，漂移不展示预览；CLI替身，不读写真实Base
beta-page-state.test.mjs: Beta跑图本机配置状态纯函数测试，覆盖首次默认Flux、十功能/样本集引用/全部模型去重恢复及表单参数往返、全景2:1锁定与4K恢复、非法质量/存储降级及不复制图片边界；扩图独立配置由beta-outpaint-integration.test.mjs补充验证
beta-run-id.test.mjs: Beta跑图人工分组时间、技术 Run ID 本地日期时间主体、批内唯一序号、模型定位与非法输入拒绝纯函数测试
beta-retry.test.mjs: 手动重试仅失败项/成功项保留、free文本与空房元数据冻结、生成Attempt续号、仅同步失败零生成、重复点击幂等、旧registry冻结批次迁移/已有附件恢复优先与逐Run脱敏预警；内存模型/飞书替身
beta-recovery.test.mjs: 已上传结果按冻结配置/样本/模型/测试时间与真实下载bytes/尺寸/SHA-256恢复原记录，禁止生图/重传、真实费用漂移阻断、浮点尾差容忍及归档重试上传幂等；本地真实PNG/CLI替身
beta-runner.test.mjs: 含AI扩图的十功能目录、异步配置及普通Beta批次回归，覆盖空房逐样本房型、当前Key Agent权限/409阻断、测试时间、无限结果、去重资产、两路并发、单Run单图、生成/同步双阶段、回读后预览、瞬时生成三次Attempt、同步失败仅重试归档及全部归档前的忙碌守卫
beta-upscale.test.mjs: 六工作流目录/真实身份/档位和版本冻结、共享执行图能力准入、按ID惰性取图及真实尺寸建档前校验、双进度/仅同步失败重试，不调用GPU或飞书
beta-upscale-ui.test.mjs: 超分多选与可用性、普通/KS/混选尺寸交集、6K全候选同档位请求、动态目录缩减/空交集阻断、缓存迁移及真实增强下拉不递归的DOM测试
beta-upscale-archive.test.mjs: 六工作流稳定标签/版本，两KS26.3整图实际推理/ceil16面积上限与4K/6K最终PNG、交付插值经正式服务到Base逐项回读；无Prompt/旧20.1的2X恢复及同步失败只重归档
beta-upscale-integration.test.mjs: 页面六工作流同档位请求经Runner/正式服务到独立归档，验证KS26.3整图20MP上限/最终尺寸/恢复标记、版本/SHA及主工作台local-only隔离，无GPU或Base写入
beta-upscale-area-cap.test.mjs: KS26.3整图受限面积及成品恢复归档，拒绝20MP等号/伪造推理参数/旧分块元数据；21.1整图、26.1面积与26.2分块仅按原合同恢复；Runner受信旧任务有附件恢复，无附件/篡改零建档零GPU
beta-outpaint.test.mjs: 四工作流真源/脱敏能力与固定2K原比例/预设/居中/三倍率合同，客户端身份冲突/非2K/四边/资产重传零入队、不可用候选及排队后失效阻断、同样本四工作流lazy读取/真实标签、建档前真实尺寸400与4000px源适配、Comfy无Prompt Agent Key、Sunburst生成/归档失败不重复收费提交；内存替身无外部调用
beta-outpaint-integration.test.mjs: 页面样本乘四工作流经Runner与真实generationService/扩图适配器到captureBetaGenerationArchive的跨层测试，验证两Flux模型/Qwen/Sunburst单次路由、实际Prompt/版本/2K画布及独立Beta归档、生成同步4/4、普通模型/4K配置与扩图状态隔离；模型和Base全部mock
beta-panorama.test.mjs: 全景样本真实2:1/伪尺寸/8MB保护、ID元数据零原图入队、执行时原图比例校验、GPT2.5/Banana2.1非2:1模型阻断、独立冻结Prompt版本归档及Seedream全景4K/普通Flux工作流的内存合同测试
beta-ui.test.mjs: 独立Beta工作台含AI扩图的十功能名称/顺序、共享可搜索任务单选/忙碌禁用/切换与保存接线、默认Flux/标签页恢复、样本集选择/逐张保存/完成回读、样本ID入队及free/style共用资产、无限结果和独立测试时间、模型多选摘要/搜索及配置恢复、配置/监控双栏、仅失败项RETRY、冻结批次引用/提交互斥/新批次退出、生成/同步双进度、逐项/旧任务/连接预警及安全文本零图片渲染；保留clip/定位/38px中性保存及飞书结果按钮静态合同
generation-task-state.test.mjs: 当前标签页按功能保留生成任务 ID、按图片计数及 ComfyUI/API 编辑阶段消息推导生成中状态、结果与过期/原始错误纯状态测试，不访问真实浏览器存储
generation-task-request.test.mjs: 日常生图前台生图及扩图飞书实时 Schema 就绪阻断与仅图片超分豁免、空白默认正向提示词、Flux2 Klein 默认选择、固定 PNG 且无格式 UI、单模型 1–4 张及超过四模型展开、美化六组合/指定版本穿透与氛围转换/全景美化分功能加载文案、后台任务参数适配与图片载荷只传一份测试，不发送真实生图请求
image-upscale.test.mjs: 六套SeedVR2来源/输入预处理与原字节保真，KS两套2X/4K/6K目标及非法8K/输入边界、节点max/倍率元数据、源/请求/实际尺寸、Flux嵌入兼容与时限、本机结果和OneAPI/飞书豁免；无GPU
effect-render-enhancement.test.mjs: 效果图氛围转换旧编码/新展示名、环境模块与全景纯文本/开放 MAIN JSON和指定冻结版本、Seedream 全景 4K、普通 Flux 工作流、单图/原比例、脱敏响应与归档元数据内存集成测试
model-multi-select.test.mjs: 共享单/多选下拉的摘要/平铺搜索、筛选全选/取消与单选即选即关、至少一项/不限数量、禁选/首选保序、同宽4px邻接定位、普通单选空键初始化/禁选跳过/首尾与确认、搜索结果键盘导航、模态内浮层迁移及归焦合同测试
workspace-panel.test.mjs: 配置栏基准/实际宽度分离、304px以上中间值原样持久与可交互、80px执行区禁用、尾段吸附/旧偏好迁移、预览保护、连续拖动/反向/只松手保存/取消、键盘及窄屏同DOM抽屉焦点回归，不启动服务或提交生成
comfyui-client.test.mjs: ComfyUI 健康、取消、Base64 原子提交、WebSocket 阶段、队列兜底、超时、`completed=false` OOM 即时报错、网关恢复、节点详情、唯一产物、旧图拒绝、404 恢复、输出指纹与参考图边界测试，不提交真实任务
comfyui-workflow.test.mjs: Flux 9B FP8/7 steps、1K/2K、4K/6K 同图无 Prompt 攸行超分、全景复用普通 `euler` 与空 Latent 工作流、废弃全景采样字段隔离和 Prompt 注入的工作流图合同测试
flux-negative-prompt.test.mjs: Flux 负向 Prompt 默认不变、自定义整段覆盖、仅 Flux 显示/消费、长度边界、追溯元数据与结果标记测试，不提交真实任务
image-dimensions.test.mjs: PNG/JPEG/WebP 图片头真实宽高与无效字节降级测试
image-ratio.test.mjs: 浏览器原图比例标签、缺图默认值与最近合法比例选择纯函数测试
generation-actions.test.mjs: 白模/空房生成动作状态与静态视觉合同测试，覆盖提示词复用、START/RUNNING… 中文语义与忙碌态、内嵌 Smiley Sans、版本化主题引用、精密键帽反馈、761px 起禁止外面板焦点滚动的独立配置区、不遮挡控件的底部动作栏及窄屏自然流布局
generation-comparison.test.mjs: 生成结果原图/结果图滑动对比专项测试，覆盖默认关闭、按需开启后的 50% 轻量分界、无箭头及无聚焦外圈抓手、拖动态、原生 range 键盘语义、四图画廊完整图片高度、纯结果切换、无原图降级、扩图异画幅对比隔离、带版本的入口与页面内存边界，不提交真实生图任务
feature-directory.test.mjs: 桌面外面板禁止焦点滚动与隐藏下拉定位边界、生图工作台信息架构静态合同测试，覆盖AI设计/AI渲染/AI编辑/AI创作四组、十三功能唯一入口/旧房改造与风格转换归属AI设计/图片超分与AI扩图归属AI编辑、黑色粗体分类、144px目录与11/12px字号、图片上传置顶、桌面双面板及窄屏两列分组
image-upscale-ui.test.mjs: 六工作流真实控制器、KS最终2X/4K/6K选择和缓存/输入范围、目录驱动整图面积说明及最终尺寸与请求不缩档、缺后置节点阻断、单份原图与冻结版本；无网络/GPU
empty-room-furniture.test.mjs: 空房家具跨层合同测试，覆盖线上目录推荐合法性、剥离“其他”入口、已选正向需求、未选及空条件省略、明确排除原文保留、其他家具/非法输入、浏览器请求、两条 Agent 路由、缓存隔离和飞书可读归档
empty-room-type.test.mjs: 空房房间类型前后端合同测试，验证十项受控目录、客户无默认选择、“其他”详情条件必填/空白归一化/40 字上限与非法值拒绝
launcher.test.mjs: 跨平台一键启动器的 Node 版本、端口优先级、依赖摘要、本地 CLI PATH 和服务就绪有限轮询测试，不安装依赖、启动服务或打开浏览器
agent-model-config.test.mjs: 十一个 Prompt Agent 候选 ID、DeepSeek V4.1 Flash、Doubao Seed 2.0 Lite、图片输入能力与接口可用性回归测试，不发送真实 API 请求
lark-sync.test.mjs: 全部可写字段类型/单选值/附件 ID 的 409 阻断、真实产物尺寸与模型目录、Banana 2.1 独立模型单选准入及与 Prompt融合 分离、风格转换平台/参考图二选一归档与功能选项409阻断、独立效果图氛围转换/美化功能、房型/家具/设计/Agent/风格、原始/最终 Prompt、模型与融合及完整天气时段工作流映射；不调用 CLI 或写入真实 Base
oneapi-client.test.mjs: OneAPI 主动取消、Prompt Agent 单/双图顺序、Responses 与 Claude Chat Completions 评审、图生图压缩/脱敏、Images edits 透明 PNG/mask 字节原样传输/真实费用/空响应/上游错误与收费 POST 不重试、Style DNA 多轮附件及费用归一化测试
oneapi-timeout.test.mjs: OneAPI 各阶段独立预算、响应体读取限时、提示词转出图重置计时、阶段/模型诊断、主动取消优先、收费 POST 不重试与终态定时器清理的虚拟时钟测试，并以本机 HTTP 延迟头/正文对照验证真实 dispatcher 与取消链路，不调用真实模型
lark-cli.test.mjs: 项目内固定版 CLI 路径优先、最低版本校验与旧全局 CLI 阻断测试，不调用真实飞书 API
image-artifact.test.mjs: 生成图片扩展名、data URL 解码、任务快照 WebP 预览、空响应与下载体积上限测试
image-download.test.mjs: 内嵌大图浏览器本地 Blob、远程图片同源代理、文件名一致性、MIME、字节透传、附件响应头与非法输入测试，不访问网络
panorama-viewer.test.mjs: 全景图美化专属 360° 预览边界、功能上下文传递、dialog 结构、本地 Pannellum 资产及 Light Command Center 视觉令牌接入回归测试，不加载真实图片或启动 WebGL
benchmark-base.test.mjs: Benchmark 五表环境配置、全部普通回填的实时字段存在性/可写类型/单选选项阻断、稳定编码配置映射、系统字段隔离、样本录入、三类实验筛选、快照、Prompt/Run/三维评分/费用/横评关联与附件测试，不读写真实 Base
benchmark-runner.test.mjs: 横评计划规模、提示/出图阶段 Prompt 共享边界与飞书实验类型映射、Case/配置筛选、Provider 路由、主动取消、费用传递、逐 Run 真源进度、失败重试、横评同步与计划阶段零调用的内存集成测试
benchmark-experiment-config.test.mjs: 八类质量配置单变量草稿冻结、阶段推导、稳定配置 ID、双 Provider 智能分辨率与合法参数测试
benchmark-experiment-ui.test.mjs: 实验 ID、智能分辨率、八类因子互斥切换、因子上置、选择器与计数同组、重复候选标题隐藏、收窄固定参数与紧凑候选项测试
benchmark-job-ui.test.mjs: 运行中出图停止准入、停止任务真实进度/继续生成、部分失败任务的完整进度/失败数文案、出图重试准入、评分失败卡剩余数及同实验冻结参数恢复纯函数测试
benchmark-review.test.mjs: seven_evaluate_v3.1 单次 AI 评分、1–5 小数分、三维证据隔离、完整 JSON 提取/严格契约、单次契约修复/原文留存、正式评分 Run 断点筛选、输入准入、问题严重度封顶、40%/30%/30% 加权准入、飞书可读评分细则、旧协议分析隔离、可用图漏斗、模型分类分析与 P95 测试
benchmark-review-ui.test.mjs: AI 评分前端当前样本集成功结果筛选、GPT 默认评分模型、部分完成剩余数/继续动作、每 Run 最新 v3.1 评分选择、旧协议计数、三维/加权摘要及评分任务保持在评分面板的纯函数测试
benchmark-sample-ui.test.mjs: 分次文件累加去重、草稿初始化、已有空间分类保护、未分类采纳 AI 类别、五维字段边界、状态文案、上传交互优先级和单层输入焦点反馈测试
benchmark-labeling.test.mjs: 单图 AI 样本空间与五维标签 JSON 契约、人工准入隔离、独立低中高约束与可注入视觉模型调用测试，不发送真实 API 请求
benchmark-workbench-store.test.mjs: 当前 worktree 本地样本集、实验、分类元数据和评分版本原子写入及稳定 ID 更新测试
benchmark-workbench.test.mjs: Benchmark 样本集迁移/CRUD、空间与五维 Gemini 3.5 Flash 待审标注、人工准入、用户指定可用视觉模型、自动 Case ID、实验计划生成零 Base 写入、正式运行冻结配置失败持久化/停止调用、Base 成功结果实验目录、v3.1 评分写回/按 Run 断点继续/旧协议脱敏逐图评分投影、空评分批次阻断、评分传输失败批次落库、当前集/实验 ID 分析隔离与历史 Run 协议漂移拦截测试
benchmark-jobs.test.mjs: Benchmark 后台任务即时入队、主动取消、阶段、Base 落库状态、进度、成功结果与可诊断失败消息测试；取消真正结算前仍忙碌、容量清理保护 cancelling 的 deferred 测试
style-dna-reverse.test.mjs: Style DNA 反推脱敏版本目录、所选版本传递、Prompt 正文隔离、客户端覆盖防护、公开附件策略、多轮图片/PDF 与固定 JSON Schema 测试
prompt-agent.test.mjs: 可选 Agent 名称字段、无名称字段时的白模/空房/风格转换双模式与风格反推展示名派生、行解析、脱敏已上架版本目录、空房智能默认/融合与独立风格转换平台/参考图配置、默认最高/指定发布版本、System Prompt 与分页边界测试
refined-model-prompt.test.mjs: 精模固定 Prompt 仅已上架目录、全下架空目录、最高/指定上架版本、旧内部测试参数无法绕过下架、正文脱敏与分页字段边界测试
refined-model-workflow.test.mjs: 精模下架版本在出图与归档前 409 阻断、已上架准入、用户要求前置与预设 Prompt 后置、空输入兼容、长度边界、单图、原图比例、批次元数据、脱敏响应与同步调度内存集成测试
refined-prompt-version-select.test.mjs: 精模已上架目录过滤、下架记忆与配置刷新回退、无可用版本清空禁用、非法默认值回退及有效选择保持测试
reference-image.test.mjs: 默认及自定义参考图数量/格式/容量/Base64/MIME/真实字节数/可信宽高；单图文件选择与拖入替换/同文件重选/取消和失败保留/多图追加的上传交互回归测试
reference-attachment.test.mjs: Style DNA 图片/PDF 附件分流、无数量上限、PDF 文件签名、MIME、真实字节与容量策略回归测试
style-library.test.mjs: 飞书风格行、Style DNA 合法性、版本化唯一编码、历史版本选择、上下架状态、分页边界和前端脱敏回归测试
white-model-workflow.test.mjs: 显式功能路由穿透生成输入，阻止空房默认走白模， 白模与空房智能默认/固定风格稳定 Agent 路由、空房房间类型及“其他”详情必填/白名单/Prompt 注入/缓存隔离、独立 Prompt 表、仅智能默认可用的主图+风格参考双图合同、平台融合混合输入拒绝、最终出图单图隔离、风格图缓存失效、版本化 Style DNA、独立 Provider、比例及非阻塞归档测试
white-model-render-mode.test.mjs: 白模/空房前端风格选择单元测试，覆盖共享可搜索单选接线、智能默认说明、平台风格扩展/版本去重、风格图触发禁选和失效选择回退
runtime-cache.test.mjs: 异步 TTL 缓存命中、并发去重、过期、主动刷新和失败清理测试
sync-jobs.test.mjs: generationId 幂等入队、非阻塞执行与飞书同步状态测试；成功/失败同步完成前的 pending 更新守卫

effect-beautification.test.mjs: 去除 LoRA 触发词后的六预设正文原样投递、默认/非法值/单图准入、独立版本来源与正文短句脱敏、双 Provider 现有负向行为、正式/Beta 标签和完整元信息、后台任务目录与统一配置刷新；全部使用内存替身，不生成或写入真实数据

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
