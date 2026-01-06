import { isMobileDevice } from '@/lib/check'

export const createToolbarConfig = (t: any, editorWidth?: number) => {
  // 定义所有工具栏项目，不分组
  const allTools = [
    { name: 'undo', tipPosition: 's' },
    { name: 'redo', tipPosition: 's' },
    { name: 'headings', tipPosition: 's', className: 'bottom' },
    { name: 'bold', tipPosition: 's' },
    { name: 'italic', tipPosition: 's' },
    { name: 'strike', tipPosition: 's' },
    { name: 'line', tipPosition: 's' },
    { name: 'quote', tipPosition: 's' },
    { name: 'list', tipPosition: 's' },
    { name: 'ordered-list', tipPosition: 's' },
    { name: 'check', tipPosition: 's' },
    { name: 'code', tipPosition: 's' },
    { name: 'inline-code', tipPosition: 's' },
    { name: 'upload', tipPosition: 's' },
    { name: 'link', tipPosition: 's' },
    { name: 'table', tipPosition: 's' },
    { name: 'edit-mode', tipPosition: 's', className: 'bottom edit-mode-button' },
    { name: 'preview', tipPosition: 's' },
    { name: 'outline', tipPosition: 's' },
  ]

  if (isMobileDevice()) {
    // 移动端：显示所有编辑工具，但不显示 edit-mode、preview、outline
    return allTools.filter(tool => 
      !['edit-mode', 'preview', 'outline'].includes(tool.name)
    )
  }

  if (!editorWidth) {
    // 如果没有宽度信息，返回所有工具
    return allTools
  }

  // 桌面端：根据宽度计算能显示多少个图标
  const BUTTON_WIDTH = 36 // 每个按钮宽度
  const PADDING = 16 // 左右padding
  const availableWidth = editorWidth - PADDING
  const maxButtons = Math.floor(availableWidth / BUTTON_WIDTH)

  // 优先级排序：越重要的工具越靠前
  const priorityOrder = [
    'undo', 'redo',           // 基础操作
    'bold', 'italic', 'strike', // 文本格式
    'headings',               // 标题
    'line', 'quote',          // 布局
    'list', 'ordered-list', 'check', // 列表
    'code', 'inline-code',    // 代码
    'upload', 'link', 'table', // 插入
    'edit-mode', 'preview', 'outline' // 模式切换
  ]

  // 按优先级排序
  const sortedTools = allTools.sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a.name)
    const bIndex = priorityOrder.indexOf(b.name)
    return aIndex - bIndex
  })

  // 根据宽度截取相应数量的工具
  return sortedTools.slice(0, maxButtons)
}