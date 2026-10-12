# AI扩图可交互画布功能

## 功能概述

将原本固定居中的扩图预览升级为可交互的画布UI，用户可以通过拖动原图自由调整在目标画布中的位置，从而精确控制扩图的留白方向和大小。

## 主要改进

### 1. 可拖动画布 (public/image-outpaint.js)

#### 拖动交互
- 支持鼠标拖动和触摸拖动
- 拖动时显示 `grabbing` 光标
- 实时更新原图位置和四边扩展值
- 自动清除比例快捷按钮选中状态

#### 边界约束
- 原图位置限制在有效范围内
- left: 0 ~ (targetWidth - preparedWidth)
- top: 0 ~ (targetHeight - preparedHeight)
- 拖动超出边界时自动夹紧到最大/最小值

#### 像素精度计算
```javascript
// 将画布上的像素移动转换为目标图片的像素偏移
const pixelDeltaX = Math.round((deltaX / canvasWidth) * targetWidth);
const pixelDeltaY = Math.round((deltaY / canvasHeight) * targetHeight);
```

#### 四边值同步
```javascript
// 根据left/top位置自动计算right/bottom
const newRight = targetWidth - preparedWidth - newLeft;
const newBottom = targetHeight - preparedHeight - newTop;
```

### 2. 视觉增强 (public/image-outpaint.css)

#### 画布样式
- 添加 `cursor: grab/grabbing` 提供拖动提示
- 添加 `touch-action: none` 禁用触摸滚动
- 添加 `user-select: none` 防止文本选择

#### 参考网格
- 在画布上绘制 3×3 网格辅助线
- 半透明显示，不干扰原图预览
- 帮助用户对齐和定位

### 3. 用户提示 (public/index.html)

#### 交互提示
- 画布 `title` 属性："拖动原图调整在画布中的位置"
- 新增提示文本："💡 拖动画布中的原图可调整留白位置，或在下方精确输入像素值"
- 仅在画布可见时显示提示

## 使用方式

### 拖动操作
1. 上传图片后，画布中会显示原图预览
2. 点击或触摸画布拖动原图到目标位置
3. 四边的扩展像素值会实时更新
4. 松开鼠标或手指完成定位

### 精确输入
1. 仍可通过下方的四个输入框精确输入像素值
2. 输入框和拖动操作保持双向同步
3. 拖动操作会清除比例快捷按钮的选中状态

### 快捷比例
1. 点击比例按钮（1:1、4:3等）会居中放置原图
2. 拖动画布后比例选中状态会被清除
3. 可随时点击比例按钮恢复居中

## 技术实现

### 拖动生命周期

#### startDrag
- 记录拖动起始点坐标
- 记录当前原图位置和画布尺寸
- 添加拖动中的视觉状态类

#### moveDrag  
- 计算鼠标/触摸移动的偏移量
- 转换为目标图片坐标系的像素偏移
- 应用边界约束
- 更新输入框值并重新渲染

#### endDrag
- 移除拖动中的视觉状态
- 触发 onChange 回调通知变更
- 清空拖动状态

### 坐标转换

从画布视觉坐标到目标图片像素的转换公式：
```
pixelDelta = round((canvasDelta / canvasSize) * targetSize)
```

这确保了无论画布在屏幕上的实际大小如何，拖动都能精确映射到目标图片的像素位置。

### 状态一致性

拖动过程中始终保持以下恒等式：
```
left + preparedWidth + right = targetWidth
top + preparedHeight + bottom = targetHeight
```

## 测试覆盖

### 单元测试 (test/image-outpaint-drag.test.mjs)
- prepared dimensions 计算（含32px对齐）
- 拖动位置计算与边界约束
- 像素偏移量换算
- 扩展值验证
- 居中扩展参考

### 集成测试 (test/image-outpaint-drag-integration.test.mjs)
- 完整拖动工作流（居中→左上、边界夹紧）
- 拖动状态一致性
- prepared dimensions 在拖动中保持不变
- 扩展值总和恒等验证
- 与比例按钮的交互

## 兼容性

### 浏览器支持
- 现代浏览器：完整支持鼠标和触摸拖动
- 触摸设备：通过 `touch-action: none` 禁用滚动冲突

### 后向兼容
- 保留原有的四边像素输入框
- 保留比例快捷按钮
- 保留所有验证逻辑和API合同
- 不影响 ComfyUI/Sunburst 双引擎功能

## 文件清单

### 修改的文件
- `public/image-outpaint.js` - 添加拖动交互逻辑、网格渲染
- `public/image-outpaint.css` - 添加拖动相关样式、网格样式
- `public/index.html` - 添加画布提示文本

### 新增的文件
- `test/image-outpaint-drag.test.mjs` - 拖动功能单元测试
- `test/image-outpaint-drag-integration.test.mjs` - 拖动功能集成测试
- `docs/image-outpaint-interactive-canvas.md` - 本文档

## 未来可能的改进

1. **位置快捷按钮**：添加九宫格按钮快速定位到常用位置（左上、居中、右下等）
2. **吸附对齐**：拖动接近边缘或中心时自动吸附
3. **键盘控制**：支持方向键微调位置
4. **预设模板**：保存和加载常用的扩图位置配置
5. **批量应用**：在多张图片上应用相同的相对位置

## 总结

这次改进将静态的预览升级为动态的交互式画布，大幅提升了用户体验：

- **更直观**：所见即所得的拖动操作
- **更灵活**：不再局限于居中扩展
- **更精确**：拖动和输入框双重控制
- **更高效**：减少试错次数

用户现在可以根据实际需求，将原图放置在画布的任意位置，精确控制四个方向的留白大小，实现更符合预期的扩图效果。
