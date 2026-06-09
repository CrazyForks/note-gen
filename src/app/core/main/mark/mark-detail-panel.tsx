'use client'

import React, { useCallback, useEffect, useMemo, useState } from "react"
import dayjs from "dayjs"
import { Copy, FileText, FolderOpen, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import type { Mark } from "@/db/marks"
import { LocalImage } from "@/components/local-image"
import { AudioPlayer } from "@/components/audio-player"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import useMarkStore from "@/stores/mark"
import useTagStore from "@/stores/tag"
import useSettingStore from "@/stores/setting"
import { parseTodoMarkContent } from "./mark-list-item-content"
import type { Priority } from "./todo-form"
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs"
import ocr from "@/lib/ocr"
import { fetchAiDesc, fetchAiDescByImage } from "@/lib/ai/description"
import { toast } from "@/hooks/use-toast"
import { appDataDir } from "@tauri-apps/api/path"
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener"
import { getMarkOpenAction } from "./mark-open-path"
import { getImageRecordDisplayText, type ImageRecordStatusLabels } from "./image-record-status"

const getWordCount = (text: string): number => {
  if (!text) return 0
  return text.replace(/\s/g, '').length
}

const getImageSrc = (mark: Mark): string | null => {
  if (!mark.url || (mark.type !== 'image' && mark.type !== 'scan')) {
    return null
  }

  if (mark.url.includes('http')) {
    return mark.url
  }

  return `/${mark.type === 'scan' ? 'screenshot' : 'image'}/${mark.url}`
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function getLocalImagePath(mark: Mark) {
  if (!mark.url || mark.url.includes('http') || (mark.type !== 'image' && mark.type !== 'scan')) {
    return null
  }

  return `${mark.type === 'scan' ? 'screenshot' : 'image'}/${mark.url}`
}

function getImageMimeType(url: string) {
  const extension = url.split('.').pop()?.toLowerCase()

  switch (extension) {
  case 'jpg':
  case 'jpeg':
    return 'image/jpeg'
  case 'webp':
    return 'image/webp'
  case 'gif':
    return 'image/gif'
  default:
    return 'image/png'
  }
}

interface TodoData {
  title: string
  description: string
  completed: boolean
  priority: Priority
}

function DetailItem({
  title,
  className,
  children,
}: {
  title: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("grid w-full min-w-0 max-w-full grid-cols-1 gap-2 overflow-hidden border-b px-5 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5", className)}>
      <h2 className="min-w-0 text-xs font-medium text-muted-foreground">
        {title}
      </h2>
      <div className="min-w-0 max-w-full overflow-hidden text-sm">
        {children}
      </div>
    </section>
  )
}

function MarkMissingState({ onClose }: { onClose: () => void }) {
  const t = useTranslations()

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background p-6">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>{t('record.mark.empty')}</EmptyTitle>
          <EmptyDescription>{t('record.mark.loading')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}

function TodoDetailEditor({ mark }: { mark: Mark }) {
  const t = useTranslations()
  const markT = useTranslations('record.mark')
  const { updateMark } = useMarkStore()
  const { fetchTags, getCurrentTag } = useTagStore()
  const [todoData, setTodoData] = useState<TodoData>(() => parseTodoMarkContent(mark))

  useEffect(() => {
    setTodoData(parseTodoMarkContent(mark))
  }, [mark])

  const handleSave = useCallback(async () => {
    if (!todoData.title.trim()) {
      return
    }

    const nextTodoData: TodoData = {
      title: todoData.title.trim(),
      description: todoData.description.trim(),
      priority: todoData.priority,
      completed: todoData.completed,
    }

    await updateMark({
      ...mark,
      desc: nextTodoData.title,
      content: JSON.stringify(nextTodoData),
    })
    await fetchTags()
    getCurrentTag()
  }, [fetchTags, getCurrentTag, mark, todoData, updateMark])

  const handleToggleComplete = useCallback(async () => {
    const nextTodoData = {
      ...todoData,
      completed: !todoData.completed,
    }

    setTodoData(nextTodoData)
    await updateMark({
      ...mark,
      desc: nextTodoData.title,
      content: JSON.stringify(nextTodoData),
    })
  }, [mark, todoData, updateMark])

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <DetailItem title={markT('createdAt')}>
        {dayjs(mark.createdAt).format('YYYY-MM-DD HH:mm:ss')}
      </DetailItem>
      <DetailItem title="状态">
        <div className="flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden">
          <Checkbox
            className="shrink-0"
            checked={todoData.completed}
            onCheckedChange={handleToggleComplete}
          />
          <span className={cn("min-w-0 flex-1 break-words [overflow-wrap:anywhere]", todoData.completed && "text-muted-foreground line-through")}>
            {todoData.completed ? t('record.mark.todo.completed') : t('record.mark.todo.uncompleted')}
          </span>
        </div>
      </DetailItem>
      <DetailItem title={t('record.mark.todo.title')}>
        <Input
          id="record-detail-todo-title"
          value={todoData.title}
          onChange={(event) => setTodoData({ ...todoData, title: event.target.value })}
          placeholder={t('record.mark.todo.titlePlaceholder')}
          className="w-full min-w-0 max-w-full"
        />
      </DetailItem>
      <DetailItem title={t('record.mark.todo.description')}>
        <Textarea
          id="record-detail-todo-description"
          className="min-h-32 w-full min-w-0 max-w-full resize-y"
          value={todoData.description}
          onChange={(event) => setTodoData({ ...todoData, description: event.target.value })}
          placeholder={t('record.mark.todo.descriptionPlaceholder')}
        />
      </DetailItem>
      <DetailItem title={t('record.mark.todo.priority')}>
        <Tabs
          className="w-full min-w-0 max-w-full"
          value={todoData.priority}
          onValueChange={(value) => setTodoData({ ...todoData, priority: value as Priority })}
        >
          <TabsList className="grid w-full min-w-0 max-w-full grid-cols-3">
            <TabsTrigger value="low" className="min-w-0">
              {t('record.mark.todo.priorityLow')}
            </TabsTrigger>
            <TabsTrigger value="medium" className="min-w-0">
              {t('record.mark.todo.priorityMedium')}
            </TabsTrigger>
            <TabsTrigger value="high" className="min-w-0">
              {t('record.mark.todo.priorityHigh')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </DetailItem>
      <DetailItem title="操作" className="border-b-0">
        <div className="flex w-full min-w-0 justify-end">
          <Button onClick={handleSave} disabled={!todoData.title.trim()}>
            {t('record.mark.todo.saveEdit')}
          </Button>
        </div>
      </DetailItem>
    </div>
  )
}

function MarkDetailBody({ mark }: { mark: Mark }) {
  const t = useTranslations()
  const markT = useTranslations('record.mark')
  const { updateMark } = useMarkStore()
  const { recordTextSize, primaryImageMethod, primaryModel } = useSettingStore()
  const [value, setValue] = useState('')
  const [descValue, setDescValue] = useState('')
  const [isRecognizingImage, setIsRecognizingImage] = useState(false)
  const imageSrc = getImageSrc(mark)
  const wordCount = getWordCount(mark.content || '')
  const shouldShowDescription = mark.type !== 'text' && mark.type !== 'recording' && (mark.desc !== mark.content || Boolean(imageSrc))
  const imageStatusLabels: ImageRecordStatusLabels = useMemo(() => ({
    pending: t('record.capture.screenshotRecognitionPending'),
    failed: t('record.capture.screenshotRecognitionFailed'),
    noText: t('record.capture.screenshotNoText'),
    savedOnly: t('record.capture.screenshotSavedOnly'),
  }), [t])
  const imageStatusText = getImageRecordDisplayText(mark, imageStatusLabels)

  useEffect(() => {
    setValue(mark.content || '')
    setDescValue(mark.desc?.trim() || '')
  }, [mark])

  const textDescChangeHandler = useCallback(async (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescValue(event.target.value)
    await updateMark({ ...mark, desc: event.target.value })
  }, [mark, updateMark])

  const textMarkChangeHandler = useCallback(async (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextContent = event.target.value
    setValue(nextContent)
    await updateMark({
      ...mark,
      content: nextContent,
      desc: mark.type === 'text'
        ? nextContent
        : mark.type === 'recording'
          ? nextContent.trim().slice(0, 100)
          : mark.desc,
    })
  }, [mark, updateMark])

  const handleRecognizeImage = useCallback(async () => {
    if (mark.type !== 'image' && mark.type !== 'scan') {
      return
    }

    setIsRecognizingImage(true)

    try {
      const localImagePath = getLocalImagePath(mark)
      let content = ''
      let desc = ''

      if (primaryImageMethod === 'ocr' && localImagePath) {
        content = await ocr(localImagePath) || ''

        if (primaryModel && content.trim()) {
          desc = await fetchAiDesc(content).then(res => res ? res : content) || content
        } else {
          desc = content
        }
      } else {
        let imageUrl = mark.url

        if (localImagePath) {
          const bytes = await readFile(localImagePath, { baseDir: BaseDirectory.AppData })
          imageUrl = `data:${getImageMimeType(mark.url)};base64,${bytesToBase64(bytes)}`
        }

        content = await fetchAiDescByImage(imageUrl) || ''
        desc = content
      }

      await updateMark({
        ...mark,
        content,
        desc: desc || content || t('record.capture.screenshotNoText'),
      })
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('record.capture.screenshotRecognitionFailed'),
        variant: 'destructive',
      })
    } finally {
      setIsRecognizingImage(false)
    }
  }, [mark, primaryImageMethod, primaryModel, t, updateMark])

  const handleCopyImageLink = useCallback(async () => {
    if (!mark.url) {
      return
    }

    await navigator.clipboard.writeText(mark.url)
    toast({ title: t('record.mark.toolbar.copied') })
  }, [mark.url, t])

  const handleShowImageInFolder = useCallback(async () => {
    try {
      const appDir = await appDataDir()
      const action = getMarkOpenAction(mark, appDir, 'folder')

      if (!action?.path) {
        return
      }

      if (action.mode === 'reveal') {
        await revealItemInDir(action.path)
        return
      }

      await openPath(action.path)
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('common.error'),
        variant: 'destructive',
      })
    }
  }, [mark, t])

  if (mark.type === 'todo') {
    return <TodoDetailEditor mark={mark} />
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <DetailItem title="类型">
        {t(`record.mark.type.${mark.type}`)}
      </DetailItem>
      <DetailItem title={markT('createdAt')}>
        {dayjs(mark.createdAt).format('YYYY-MM-DD HH:mm:ss')}
      </DetailItem>
      <DetailItem title="字数">
        {wordCount}
      </DetailItem>
      {shouldShowDescription ? (
        <DetailItem title={imageSrc ? t('record.capture.screenshotAiDescription') : markT('desc')}>
          <Textarea
            id="record-detail-desc"
            className="min-h-28 w-full min-w-0 max-w-full resize-y"
            value={descValue}
            onChange={textDescChangeHandler}
            placeholder={imageSrc ? imageStatusText || t('record.capture.screenshotAiDescription') : markT('desc')}
          />
        </DetailItem>
      ) : null}
      {imageSrc ? (
        <DetailItem title={t(`record.mark.type.${mark.type}`)}>
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleCopyImageLink}
                disabled={!mark.url}
              >
                <Copy className="h-4 w-4" />
                {t('record.capture.screenshotCopyImageLink')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleShowImageInFolder}
                disabled={mark.url.includes('http')}
              >
                <FolderOpen className="h-4 w-4" />
                {t('record.capture.screenshotShowInFolder')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleRecognizeImage}
                disabled={isRecognizingImage}
              >
                <RefreshCw className={cn("h-4 w-4", isRecognizingImage && "animate-spin")} />
                {isRecognizingImage ? t('record.capture.screenshotRecognizing') : t('record.capture.screenshotRecognizeAgain')}
              </Button>
            </div>
            <div className="flex min-h-56 w-full min-w-0 max-w-full items-center justify-center overflow-hidden rounded-md bg-muted/20 p-2">
              <LocalImage
                src={imageSrc}
                alt=""
                className="max-h-[52vh] w-full max-w-full object-contain"
              />
            </div>
          </div>
        </DetailItem>
      ) : null}
      {mark.type === 'recording' && mark.url ? (
        <DetailItem title={t('record.mark.type.recording')}>
          <div className="w-full min-w-0 max-w-full overflow-hidden">
            <AudioPlayer audioPath={mark.url} />
          </div>
        </DetailItem>
      ) : null}
      {mark.url ? (
        <DetailItem title={mark.type === 'link' ? t('record.mark.type.link') : 'URL'}>
          {mark.type === 'link' ? (
            <a
              href={mark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-full break-all text-primary underline-offset-4 hover:underline"
            >
              {mark.url}
            </a>
          ) : (
            <span className="block max-w-full break-all">{mark.url}</span>
          )}
        </DetailItem>
      ) : null}
      <DetailItem title={imageSrc ? t('record.capture.screenshotOcrContent') : markT('content')} className="border-b-0">
        <Textarea
          id="record-detail-content"
          value={value}
          onChange={textMarkChangeHandler}
          placeholder={imageSrc ? t('record.capture.screenshotOcrContent') : markT('content')}
          className={cn("min-h-[420px] w-full min-w-0 max-w-full resize-y leading-relaxed", `text-${recordTextSize}`)}
        />
      </DetailItem>
    </div>
  )
}

function MarkDetailView({ mark }: { mark: Mark }) {
  return (
    <div className="flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden bg-background">
      <ScrollArea className="h-full w-full min-w-0 flex-1">
        <div className="min-w-full max-w-full overflow-hidden">
          <MarkDetailBody mark={mark} />
        </div>
      </ScrollArea>
    </div>
  )
}

export function MarkDetailPanel({ markId, onClose }: { markId: number; onClose: () => void }) {
  const { marks, allMarks, fetchAllMarks } = useMarkStore()
  const mark = useMemo(
    () => marks.find((item) => item.id === markId) ?? allMarks.find((item) => item.id === markId) ?? null,
    [allMarks, markId, marks]
  )

  useEffect(() => {
    if (!mark) {
      void fetchAllMarks()
    }
  }, [fetchAllMarks, mark])

  if (!mark) {
    return <MarkMissingState onClose={onClose} />
  }

  return <MarkDetailView mark={mark} />
}
