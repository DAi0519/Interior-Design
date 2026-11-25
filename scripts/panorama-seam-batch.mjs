/**
 * [INPUT]: 2:1 全景图目录或 JSON 清单、项目三方全景美化 Prompt、可选修缝提示词文件、OneAPI 客户端
 * [OUTPUT]: 三方整图优化、半幅平移整图和中央透明遮罩、原生回包直接逆移、逐图回执与罩外变化审计
 * [POS]: 全景修缝批处理入口，冻结已付费阶段并支持相同参数续跑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {parseArgs} from "node:util";
import {createHash,randomUUID} from "node:crypto";
import {basename,dirname,join,resolve} from "node:path";
import {mkdir,readFile,readdir,rename,writeFile} from "node:fs/promises";
import sharp from "sharp";
import {createOneApiClient,redactUpstreamMessage} from "../src/oneapi-client.mjs";
import {fitImageDataUrlForRequest,loadImageBytes} from "../src/image-artifact.mjs";
import {composePanoramaEnhancementPrompt,getPanoramaEnhancementPrompt} from "../src/effect-render-enhancement-prompt.mjs";
import {createGenerationRequest,imageProviderForModel,MODEL_CONFIGS} from "../src/model-config.mjs";
import {measureSeam} from "./panorama-seam-detect.mjs";
import {rollHalfPanorama,prepareCenteredMask} from "./panorama-seam-mask.mjs";

const VERSION="2026-11-25.centered-mask.1";
const RESTORE_MODE="direct-inverse";
const PREVIEW_BACKGROUND="#eeeeee";
const INPUTS=/\.(?:png|jpe?g|webp)$/i;
const FORMATS=new Set(["png","jpeg","webp"]);
const EDITOR=MODEL_CONFIGS.gptImage26Sunburst.id;
const MASK_PROMPT=[
    "Repair the vertical joining seam at the center of this horizontally shifted equirectangular panorama. Edit only the transparent part of the supplied mask and return the complete panorama with exactly the same pixel dimensions, projection and framing.",
    "Make the transition natural and seamless. Repair the abrupt differences in brightness, exposure, illumination, and color temperature only where they cross the seam. Preserve the original light direction and continue actual shadow boundaries smoothly.",
    "Continue the same surfaces and any clearly interrupted existing contour. Match material identity, grain scale and direction, contrast, sheen and texture just outside the mask. Continue faint existing veins only where they enter the band. Preserve every object, its shape, position and scale. Avoid adding objects, new patterns, a halo or a visible strip.",
].join(" ");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const dataUrl=(bytes,format="png")=>`data:image/${format};base64,${bytes.toString("base64")}`;
const fmt=value=>Number.isFinite(value)?value.toFixed(2):"—";
const escape=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const msg=error=>redactUpstreamMessage(error.message||String(error));
const png=(pixels,width,height,channels=3)=>sharp(pixels,{raw:{width,height,channels}}).png().toBuffer();

async function writeAtomic(file,bytes){
    const tmp=file+"."+randomUUID()+".tmp";
    await writeFile(tmp,bytes,{flag:"wx"});
    await rename(tmp,file);
}
const writeJson=(file,value)=>writeAtomic(file,JSON.stringify(value,null,2)+"\n");
async function optRead(file){
    try{return await readFile(file);}catch(error){if(error.code==="ENOENT")return null;throw error;}
}

function unsigned(text,label,min=0){
    if(typeof text!=="string"||!/^(0|[1-9]\d*)$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)<min)throw new Error(label+"必须是有效整数");
    return Number(text);
}

async function listInputs(options){
    if(options.input){
        const dir=resolve(options.input);
        const entries=await readdir(dir,{withFileTypes:true});
        return entries.filter(row=>row.isFile()&&INPUTS.test(row.name)).sort((a,b)=>a.name.localeCompare(b.name,"zh-CN"))
            .map(row=>({name:row.name,path:join(dir,row.name)}));
    }
    const manifest=resolve(options.manifest);
    const rows=JSON.parse(await readFile(manifest,"utf8"));
    if(!Array.isArray(rows))throw new Error("清单需要是数组");
    return rows.map((row,i)=>{
        if(typeof row?.path!=="string"||!row.path.trim())throw new Error("清单第 "+(i+1)+" 项缺少 path");
        return {path:resolve(dirname(manifest),row.path),name:row.name||basename(row.path)};
    });
}

async function decode(bytes,{input=false,keepAlpha=false}={}){
    const image=sharp(bytes,{failOn:"error",limitInputPixels:60_000_000});
    const meta=await image.metadata();
    if((meta.pages??1)!==1||!FORMATS.has(meta.format))throw new Error("需要单帧 PNG、JPEG 或 WebP");
    const pipeline=(input?image.autoOrient():image).toColourspace("srgb");
    const {data,info}=await (keepAlpha?pipeline.ensureAlpha():pipeline.removeAlpha()).raw().toBuffer({resolveWithObject:true});
    if(info.width!==2*info.height||info.height<16||info.channels!==(keepAlpha?4:3))throw new Error("需要原生 2:1 全景图");
    return {bytes,data,width:info.width,height:info.height,format:meta.format,orientation:meta.orientation??1};
}

async function frozenPrompt(folder,loadPrompt){
    const file=join(folder,"optimize-prompt.json");
    let saved=await optRead(file);
    if(!saved){
        const asset=await loadPrompt();
        const prompt=composePanoramaEnhancementPrompt(asset.prompt);
        const snapshot=Buffer.from(JSON.stringify({code:asset.code,version:asset.version,prompt,sha256:sha(prompt)},null,2)+"\n");
        try{await writeFile(file,snapshot,{flag:"wx"});saved=snapshot;}
        catch(error){if(error.code!=="EEXIST")throw error;saved=await readFile(file);}
    }
    const data=JSON.parse(saved);
    if(typeof data.prompt!=="string"||!data.prompt.trim()||sha(data.prompt)!==data.sha256)throw new Error("本批冻结提示词指纹不符");
    return data;
}

function stagesGateway(limit,createClient){
    let client,available;
    async function clientFor(model){
        if(!client)client=createClient();
        if(!available)available=new Set((await client.listModels()).map(row=>row.id));
        if(!available.has(model))throw new Error("当前 OneAPI Key 未开放 "+model);
        return client;
    }
    let left=limit,freshCalls=0;
    return {
        async perform(dir,identity,parameters,send){
            await mkdir(dir,{recursive:true});
            const claim=join(dir,"submit.json"),output=join(dir,"native.png"),receiptFile=join(dir,"upstream.json");
            const [previous,saved,receipt]=await Promise.all([optRead(claim),optRead(output),optRead(receiptFile)]);
            if(previous){
                if(JSON.parse(previous).identity!==identity)throw new Error("已有任务与当前请求不一致");
                if(saved&&receipt&&JSON.parse(receipt).outputSha256===sha(saved))return {bytes:saved,reused:true};
                const error=await optRead(join(dir,"error.json"));
                throw new Error(error?`已有上游失败回执，未自动重发。 ${JSON.parse(error).detail}`:"已记录提交，完整回包未保存，未自动重发");
            }
            if(saved)throw new Error("发现缺少提交记录的模型原件");
            if(left<=0)throw new Error("本轮新请求数已到上限，已完成阶段可续跑");
            const readyClient=await clientFor(parameters.model);
            try{await writeFile(claim,JSON.stringify({identity,...parameters,at:new Date().toISOString()},null,2)+"\n",{flag:"wx"});}
            catch(error){if(error.code==="EEXIST")throw new Error("该阶段已有另一个进程提交");throw error;}
            left--;freshCalls++;
            console.log(JSON.stringify({phase:"submitted",stage:parameters.stage,model:parameters.model,identity:identity.slice(0,16)}));
            try{
                const response=await send(readyClient);
                const {images,...upstream}=response;
                const record={...upstream,returnedCount:images.length};
                await writeJson(receiptFile,record);
                if(images.length!==1||!images[0]?.url)throw new Error("上游未返回恰好一张图");
                const bytes=await loadImageBytes(images[0].url);
                await writeJson(receiptFile,{...record,outputSha256:sha(bytes)});
                await writeAtomic(output,bytes);
                return {bytes,reused:false};
            }catch(error){
                await writeJson(join(dir,"error.json"),{code:error.code,status:error.statusCode,detail:msg(error)});
                throw error;
            }
        },
        get freshCalls(){return freshCalls;},
    };
}

function auditModelEdit(centered,edited,width,height,{left,right}){
    const outsideMask={pixels:(width-right+left)*height,changedRgbPixels:0,changedAlphaPixels:0};
    const modelTransparency={transparentPixels:0,partialPixels:0};
    let changedPixels=0,changedWithinMask=0;
    for(let y=0;y<height;y++){
        for(let x=0;x<width;x++){
            const i=y*width+x,rgb=i*3,rgba=i*4;
            const alpha=edited[rgba+3],changedAlpha=alpha!==255;
            const changedRgb=centered[rgb]!==edited[rgba]||centered[rgb+1]!==edited[rgba+1]||centered[rgb+2]!==edited[rgba+2];
            modelTransparency.transparentPixels+=Number(alpha===0);
            modelTransparency.partialPixels+=Number(alpha>0&&changedAlpha);
            const changed=Number(changedRgb||changedAlpha);
            changedPixels+=changed;
            if(x>=left&&x<right){
                changedWithinMask+=changed;
            }else{
                outsideMask.changedRgbPixels+=Number(changedRgb);
                outsideMask.changedAlphaPixels+=Number(changedAlpha);
            }
        }
    }
    return {changedPixels,changedWithinMask,outsideMask,modelTransparency,
        outsideMaskPixelIdentical:outsideMask.changedRgbPixels===0&&outsideMask.changedAlphaPixels===0};
}

async function processImage(entry,folder,options,gateway,asset){
    const result={...entry,status:"needs-retry",phase:"input"};
    let jobDir,repairDir;
    try{
        const original=await decode(await readFile(entry.path),{input:true});
        result.originalWidth=original.width;result.originalHeight=original.height;
        const normalizeOrientation=original.orientation>1;
        const prepared=normalizeOrientation?await png(original.data,original.width,original.height):original.bytes;
        const sent=await fitImageDataUrlForRequest(dataUrl(prepared,normalizeOrientation?"png":original.format));
        const mimeType=sent.slice(5,sent.indexOf(";"));
        const inputBytes=Buffer.from(sent.split(",")[1],"base64");
        const prompt=asset.prompt;
        const generation=createGenerationRequest({
            featureMode:"panoramaEnhancement",modelKey:options.optimizer,ratio:"2:1",ratioMode:"manual",
            resolution:"2K",outputFormat:"png",prompt,
            referenceImages:[{name:entry.name,dataUrl:sent,type:mimeType,size:inputBytes.length}],
        });
        const sourceSha256=sha(original.bytes),promptSha256=sha(prompt),sentSha256=sha(inputBytes);
        const identity=sha(JSON.stringify({version:VERSION,sourceSha256,sentSha256,promptSha256,
            model:generation.request.model,size:generation.request.size}));
        result.job=identity.slice(0,24);
        jobDir=join(folder,result.job);
        await mkdir(jobDir,{recursive:true});
        result.phase="optimize";
        await Promise.all([
            writeAtomic(join(jobDir,"optimize.prompt.txt"),prompt+"\n"),
            writeAtomic(join(jobDir,"optimize-input."+ (mimeType==="image/jpeg"?"jpg":mimeType==="image/webp"?"webp":"png")),inputBytes),
        ]);
        const optimizedResult=await gateway.perform(join(jobDir,"optimize"),identity,{
            stage:"optimize",model:generation.request.model,size:generation.request.size,sourceSha256,sentSha256,promptSha256,
        },client=>client.generateImage(generation.request));
        const optimized=await decode(optimizedResult.bytes);
        const [targetWidth,targetHeight]=generation.request.size.split("x").map(Number);
        if(optimized.width!==targetWidth||optimized.height!==targetHeight||optimized.format!=="png"){
            throw new Error("整图优化回包与请求的原生 2:1 PNG 尺寸不一致");
        }
        const {width,height}=optimized;
        result.width=width;result.height=height;result.optimizeReused=optimizedResult.reused;
        result.phase="shift-and-mask";
        const band=options.maskWidth??Math.round(width*128/2880);
        const centeredPixels=rollHalfPanorama(optimized.data,width,height);
        if(!rollHalfPanorama(centeredPixels,width,height).equals(optimized.data))throw new Error("半幅平移未能精确逆变换");
        const centered=await png(centeredPixels,width,height);
        const mask=await prepareCenteredMask(width,height,band);
        const repairPrompt=options.repairPrompt;
        const centeredSha256=sha(centered),maskSha256=sha(mask.maskPng),maskPromptSha256=sha(repairPrompt);
        const task=sha(JSON.stringify({identity,editor:EDITOR,centeredSha256,maskSha256,maskPromptSha256,quality:"medium"}));
        result.repair="repair-"+task.slice(0,16);
        repairDir=join(jobDir,result.repair);
        await mkdir(repairDir,{recursive:true});
        const metadata={width,height,rollX:width/2,maskLeft:mask.left,maskRight:mask.right,editablePixels:mask.editablePixels,
            centeredSha256,maskSha256,maskPromptSha256};
        result.mask=metadata;
        await Promise.all([
            writeAtomic(join(repairDir,"centered.png"),centered),writeAtomic(join(repairDir,"mask.png"),mask.maskPng),
            writeAtomic(join(repairDir,"repair.prompt.txt"),repairPrompt+"\n"),writeJson(join(repairDir,"mapping.json"),metadata),
        ]);
        result.phase="mask-edit";
        const size=`${width}x${height}`;
        const edited=await gateway.perform(repairDir,task,{stage:"mask-edit",model:EDITOR,size,quality:"medium",
            sourceSha256:sha(optimized.bytes),...metadata},client=>client.editImage({
                model:EDITOR,size,quality:"medium",n:1,output_format:"png",response_format:"b64_json",
                prompt:repairPrompt,images:[{image_url:dataUrl(centered)}],mask:{image_url:dataUrl(mask.maskPng)},
            }));
        result.phase="restore";
        const model=await decode(edited.bytes,{keepAlpha:true});
        if(model.format!=="png"||model.width!==width||model.height!==height||model.orientation!==1){
            throw new Error("遮罩编辑回包须为与输入相同尺寸、方向的原生 PNG");
        }
        const final=rollHalfPanorama(model.data,width,height,4);
        const output=await png(final,width,height,4);
        const reloaded=await decode(output,{keepAlpha:true});
        if(!reloaded.data.equals(final))throw new Error("最终 PNG 解码与模型回包直接逆移不一致");
        const editAudit=auditModelEdit(centeredPixels,model.data,width,height,mask);
        const preview=await sharp(output).flatten({background:PREVIEW_BACKGROUND}).raw().toBuffer();
        await writeAtomic(join(repairDir,"final.png"),output);
        result.phase="completed";
        result.status=editAudit.changedPixels?"review":"no-edit";
        result.restoreMode=RESTORE_MODE;
        result.repairReused=edited.reused;
        result.audit={...editAudit,finalSha256:sha(output),
            before:measureSeam(optimized.data,width,height,0),after:measureSeam(preview,width,height,0)};
    }catch(error){
        result.detail=msg(error);
    }
    if(repairDir||jobDir)await writeJson(join(repairDir||jobDir,"result.json"),result);
    return result;
}

const states={review:"成图待复核","no-edit":"模型未改变遮罩区","needs-retry":"阶段未完成"};
function createReport(batch){
    const sections=batch.results.map(row=>{
        const dir=row.job?row.job+(row.repair?"/"+row.repair:""):"";
        const outside=row.audit?.outsideMask;
        const geometry=outside?`<p>接缝亮差 ${fmt(row.audit.before.lumaJump)} → ${fmt(row.audit.after.lumaJump)}。罩外 RGB 变化 ${fmt(outside.changedRgbPixels*100/outside.pixels)}%，透明度变化 ${fmt(outside.changedAlphaPixels*100/outside.pixels)}%。</p>`:"";
        const files=row.repair?`<p><a href="${row.job}/optimize/native.png">优化整图</a> · <a href="${dir}/centered.png">平移后的整图</a> · <a href="${dir}/mask.png">中央透明遮罩</a>${row.audit?` · <a href="${dir}/native.png">模型回包</a> · <a href="${dir}/final.png" download>直接逆移全景</a>`:""}</p>`:"";
        return `<section><h2>${escape(row.name)}</h2><p>${states[row.status]} · ${row.width?`${row.width}×${row.height} · `:""}${escape(row.phase)}</p>
${row.detail?`<p>${escape(row.detail)}</p>`:""}${geometry}${files}</section>`;
    }).join("");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>全景批量修缝</title><style>body{margin:0;background:#fbfaf7;color:#252724;font:16px/1.65 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:clamp(16px,4vw,48px)}section{margin:25px 0;padding-top:16px;border-top:1px solid #dedbd2}a{color:#8b3c1c}</style></head>
<body><main><h1>全景批量修缝</h1><p>三方整图优化 → 横向平移半幅 → 中线透明遮罩编辑 → 模型回包直接逆移。</p>
<p>${escape(batch.optimizer)} → ${escape(batch.editor)}。本次新请求 ${batch.freshCalls} 次。可下载完整全景复核材质、物体与明暗过渡。</p>
<p><a href="batch.json">批次记录</a></p>${sections}</main></body></html>`;
}

function defaultClient(){
    const key=process.env.ONEAPI_API_KEY;
    if(!key)throw new Error("未配置现有 OneAPI Key");
    return createOneApiClient(key);
}

export async function runPanoramaSeamBatch(values,{createClient=defaultClient,loadPrompt=getPanoramaEnhancementPrompt}={}){
    if(Boolean(values.input)===Boolean(values.manifest)||!values.output)throw new Error("指定 --input 或 --manifest 其一，并指定 --output");
    const optimizer=values.optimizer??"seedream55";
    const optModel=MODEL_CONFIGS[optimizer];
    if(!optModel?.sizes?.["2:1"]?.["2K"]||imageProviderForModel(optimizer)!=="oneapi")throw new Error("整图优化模型需为目录中支持 2:1 2K 的三方模型");
    const maskWidth=values["mask-width"]===undefined?null:unsigned(values["mask-width"],"--mask-width ",2);
    const limit=values["max-new-requests"]===undefined?Infinity:unsigned(values["max-new-requests"],"--max-new-requests ");
    const repairPrompt=values["repair-prompt"]?
        (await readFile(resolve(values["repair-prompt"]),"utf8")).trim():MASK_PROMPT;
    if(!repairPrompt)throw new Error("第二段修缝提示词不能为空");
    const entries=await listInputs(values);
    if(!entries.length)throw new Error("没有可处理的全景图");
    const folder=resolve(values.output);
    if(values.input&&folder===resolve(values.input))throw new Error("输出与输入目录需要分开");
    const plannedWidth=Number(optModel.sizes["2:1"]["2K"].split("x")[0]);
    if(maskWidth!==null&&maskWidth>=plannedWidth)throw new Error("遮罩宽度必须小于优化后的全景宽度");
    await mkdir(folder,{recursive:true});
    const asset=await frozenPrompt(folder,loadPrompt);
    const gateway=stagesGateway(limit,createClient),results=[];
    for(const entry of entries)results.push(await processImage(entry,folder,{optimizer,maskWidth,repairPrompt},gateway,asset));
    const batch={version:VERSION,restoreMode:RESTORE_MODE,optimizer:optModel.id,editor:EDITOR,promptAssetVersion:asset.version,
        maskWidth,repairPromptSha256:sha(repairPrompt),maxNewRequests:Number.isFinite(limit)?limit:null,freshCalls:gateway.freshCalls,results};
    await Promise.all([writeJson(join(folder,"batch.json"),batch),writeAtomic(join(folder,"report.html"),createReport(batch))]);
    return batch;
}

if(import.meta.main){
    const {values}=parseArgs({options:{
        input:{type:"string"},manifest:{type:"string"},output:{type:"string"},optimizer:{type:"string",default:"seedream55"},
        "mask-width":{type:"string"},"repair-prompt":{type:"string"},"max-new-requests":{type:"string"},help:{type:"boolean"},
    }});
    if(values.help){
        console.log("用法\n  node --env-file-if-exists=.env.local scripts/panorama-seam-batch.mjs (--input 目录 | --manifest 清单.json) --output 目录 [--optimizer seedream55] [--mask-width 128] [--repair-prompt 提示词.txt] [--max-new-requests 2]");
    }else{
        const batch=await runPanoramaSeamBatch(values);
        const completed=batch.results.filter(row=>row.audit).length;
        console.log(JSON.stringify({freshCalls:batch.freshCalls,completed,total:batch.results.length,report:join(resolve(values.output),"report.html")}));
        if(completed<batch.results.length)process.exitCode=1;
    }
}
