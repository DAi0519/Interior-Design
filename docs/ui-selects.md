<!--
[INPUT]: 依赖 public/choice-select.js/css 组件库及原生表单/模型业务适配器
[OUTPUT]: 统一下拉的入口、含4px选项行距的视觉合同、模态挂载、使用示例、键盘与动态生命周期规范
[POS]: docs 的共享 UI 组件说明，父级 ../CLAUDE.md，视觉真源为 ../DESIGN.md
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->
# 共享下拉组件

普通参数、搜索风格和模型多选共用 `public/choice-select.js` 渲染、定位和键盘逻辑，样式唯一维护在 `public/choice-select.css`。三工作台通过 `custom-select.css` 加载，不为功能另写下拉样式。

| 变体 | 接入方式 | 行为 |
| --- | --- | --- |
| 普通单选 | 原生 select | 自动增强，选中后关闭，保持 value 和 change |
| 搜索单选 | select 加 data-searchable="true" | 搜索不改变选择，选中后关闭 |
| 模型多选 | bindModelMultiSelect | 搜索、筛选全选/取消、至少保留首选；选择后保持展开 |
| 自定义目录 | bindChoiceSelect | 传入目录和展示规则；无需自己构造按钮/菜单 |

```html
<label class="field"><span>生成张数</span>
  <select aria-label="生成张数" data-dropdown-placement="top">
    <option value="1">1 张</option>
    <option value="2">2 张</option>
  </select>
</label>
```

```js
import { bindChoiceSelect } from "./choice-select.js?v=1";
const choice = bindChoiceSelect({
  container, label: "工作流", searchable: true,
  presentOption: item => ({ label: item.label, selectable: item.available, reason: item.reason }),
  onChange: keys => selectWorkflow(keys[0]),
});
choice.render([{ key: "a", label: "工作流 A", available: true }], ["a"]);
// 组件宿主被移除时释放浮层和监听；原生 select 适配器自动处理。
choice.destroy();
```

- 触发器/选项默认38px，选项之间统一保留4px行距，长列表中选项不收缩；菜单与入口等宽、间距4px、6px圆角、4px内边距，菜单底色不透明。
- 选中黑底白字和橙色勾，未选悬停浅灰；禁用降低透明度，长名称单行省略并保留完整 title/ARIA。
- 方向键遍历可见且可用项，Home/End首尾，Enter/Space提交，Escape关闭归焦，Tab离开关闭。
- 菜单使用原生 Popover 顶层，随滚动和窗口变化重定位；声明向上时空间允许则优先向上，空间不足自动适配。
- 每次展开时把同一菜单挂到触发器最近的已打开原生 dialog 或 aria-modal 对话框内，其余场景挂 body；配置抽屉移动已有控件时，菜单仍可交互且保持焦点隔离。
- 原生 select 的动态选项、隐藏、禁用、外部 change 同步；新增 select 自动增强，移除后清理资源。程序改 value 后必须派发 change。
- 业务保留自己的选项准入与提交规则；不得另加选中底色、菜单阴影或第二套键盘逻辑。
