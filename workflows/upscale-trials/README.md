<!--
[INPUT]: 依赖当前远端SUPIR/SDXL Tile节点与模型枚举、独立双分支工厂和试跑账本
[OUTPUT]: 提供室内保真Prompt A/B命令、尺寸/随机条件/参数与实验状态边界
[POS]: workflows/upscale-trials的独立实验说明，不构成主/Beta接入或产品发布
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->
# 室内保真超分试验

现有服务具备 SUPIR Q 和 Juggernaut XL v9 权重。F 版未列入实际模型目录，本轮不下载、不比较F/Q。试验不改SeedVR2默认或主/Beta目录。

SUPIR两次真实任务均在加载环节失败、零成图：首个v2加载器返回Failed to load SDXL model；第二个直接读取权重的加载器在构造CLIP2时失败。实际服务日志确认open_clip.model没有_build_vision_tower，不能笼统归因新版移除。两份任务账本保留；原生SUPIRApply虽已安装，但ModelPatchLoader未列SUPIR权重，不能直接提交。后续选择已有的SDXL Tile，不修改GPU服务依赖或文件。

```sh
node --test workflows/upscale-trials/trial.test.mjs
node --env-file-if-exists=.env.local workflows/upscale-trials/run.mjs --engine tile --input /绝对路径/原图.png --out outputs/tile-trial
node --env-file-if-exists=.env.local workflows/upscale-trials/run.mjs --engine tile --input /绝对路径/原图.png --out outputs/tile-trial --run-gpu
```

默认仅准备并核验真实节点/模型。显式执行只POST一次，单执行图内串行计算两套采样；同目录有提交账本即阻断自动重跑，失败/超时不能证明远端没有执行。归档含Prompt、图、输入与成品SHA和实际History，失败不伪装成成图成功。

原图保留原字节，实验输入等比收敛长边1024，再只向右/下复制边缘补齐32。图内Lanczos放到精确两倍画布并直接进行SUPIR推理，PNG交付只裁掉对应补边，无后置放大。若原图比2K大，这是降采样后的细节恢复试验，不是原图直接2倍超分；原图可以供保真检查，但不当作真实高清真值。

共用一次SUPIR_encode随机后验，两支采样相同seed、EDM45步、CFG4→4、control1→1、restore_cfg4、churn0、noise1.003、非FP8、VAE512分块。两支仅正向词不同，负向相同；跳过可选first_stage降噪，未做色彩匹配。参数是初次试验起点，尚不证明更保真。双支变化不能证明词中每条约束都被遵守。

Tile路径使用现有TTPlanet SDXL Tile v2＋同一Juggernaut XL v9，单次VAEEncode原图latent供两支图生图。相同seed、DPM++2M/Karras20步、CFG4、控制强度0.9、denoise0.3，只有正向词变化。作者推荐的0.3–0.4去噪与0.9控制仅作起点，真实质量另验，不将其叫SUPIR结果。[作者模型卡](https://huggingface.co/TTPlanet/TTPLanet_SDXL_Controlnet_Tile_Realistic)

2026-11-03首轮实际结果：SR17奶油客厅原件2848×1600，先缩为1024×575再补底部1px；Tile单POST双支均成功，原生PNG各2048×1152，裁去底部2px后交付2048×1150。History执行50.760秒属于整个双支任务，不能除二当单图模型延迟。两张输出SHA不同，但主代理与独立代理看图均未见室内词显著优于基础词；主要结构与光影保持，织物/地毯/叶缘仍偏软。仅一图一种子，不支持模型排名或真实纹理恢复承诺。见[离线对比](../../outputs/tile-trial/index.html)及其manifest/verification，SUPIR两份失败账本见outputs/supir-trial。四项离线测试与真实节点/模型准入通过；没有主/Beta注册、服务重启或正式发布。

来源：[作者仓库](https://github.com/Fanghua-Yu/SUPIR)、[ComfyUI包装](https://github.com/kijai/ComfyUI-SUPIR)、[实际接口源码](https://github.com/kijai/ComfyUI-SUPIR/blob/main/nodes_v2.py)。上游有非商业使用声明，产品化前需确认相应授权；本轮只记录独立技术评估，不将其写成已可商用发布。
