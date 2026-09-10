/**
 * [INPUT]: 依赖独立原型页面的目录、状态与 DOM
 * [OUTPUT]: 对外提供完整工作台中的简化配置原型
 * [POS]: prototypes/sidebar 隔离探索模块，不接入生产链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {state,roomStyle,furniture,styleChoices,upload,notes,settings,start} from './shared.js';
export function compact(){return `<aside><div class="config-tabs" role="tablist" aria-label="设计设置分栏">${['空间','风格','输出'].map(t=>`<button role="tab" tabindex="${state.configTab===t?0:-1}" aria-selected="${state.configTab===t}" data-config-tab="${t}" class="${state.configTab===t?'selected':''}">${t}</button>`).join('')}</div><div class="scroll" role="tabpanel" aria-label="${state.configTab}设置">${state.configTab==='空间'?upload()+roomStyle()+furniture():state.configTab==='风格'?styleChoices()+upload(true)+notes():settings()}</div>${start()}</aside>`;}
