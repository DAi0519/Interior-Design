/**
 * [INPUT]: 依赖独立原型页面的目录、状态与 DOM
 * [OUTPUT]: 对外提供完整工作台中的简化配置原型
 * [POS]: prototypes/sidebar 隔离探索模块，不接入生产链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {state,selection,roomStyle,furniture,styleChoices,upload,notes,settings,start} from './shared.js';
export function summary(){return `<aside><div class="scroll">${upload()}${roomStyle()}${furniture()}${styleChoices()}${upload(true)}${notes()}${settings()}</div>${start()}</aside>`;}
