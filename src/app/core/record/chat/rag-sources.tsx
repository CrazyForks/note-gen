"use client"
import { FileText } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import useArticleStore from "@/stores/article"
import { useSidebarStore } from "@/stores/sidebar"
import emitter from "@/lib/emitter"

interface RagSourceDetail {
  filepath: string
  filename: string
  content: string
}

interface RagSourcesProps {
  sources: string[]
  sourceDetails?: RagSourceDetail[]
}

export function RagSources({ sources, sourceDetails = [] }: RagSourcesProps) {
  const t = useTranslations()
  const { setActiveFilePath, readArticle } = useArticleStore()
  const { setLeftSidebarTab } = useSidebarStore()

  // 创建文件名到详情的映射
  const detailMap = new Map(sourceDetails.map(d => [d.filename, d]))

  // 处理点击文件
  const handleFileClick = useCallback(async (filename: string) => {
    const detail = detailMap.get(filename)
    if (!detail || !detail.filepath) return

    try {
      // 打开文件
      await setActiveFilePath(detail.filepath)
      await readArticle(detail.filepath, '', true)

      // 切换到文件标签页
      await setLeftSidebarTab('files')

      // 搜索文本内容并滚动定位
      // 截取内容的前100个字符作为搜索关键词
      const searchQuery = detail.content.trim().substring(0, 100)
      emitter.emit('searchAndScroll', searchQuery)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }, [detailMap, setActiveFilePath, readArticle, setLeftSidebarTab])

  if (!sources || sources.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-muted-foreground">
      <FileText className="size-3" />
      <span>{t('record.chat.ragSources.label')}:</span>
      {sources.map((source, index) => {
        const hasDetail = detailMap.has(source)
        return (
          <span
            key={index}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition-colors ${
              hasDetail
                ? 'bg-muted hover:bg-muted-foreground/20 text-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
            onClick={() => hasDetail && handleFileClick(source)}
          >
            {source}
          </span>
        )
      })}
    </div>
  )
}
