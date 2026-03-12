'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoreVertical, Trash2, RotateCcw, MoveRight, CheckSquare, XSquare, Filter, Plus, ListChecks } from 'lucide-react'
import useMarkStore from '@/stores/mark'
import useTagStore from '@/stores/tag'
import { delMark, delMarkForever, Mark, restoreMark, updateMark as updateMarkDb } from '@/db/marks'
import { insertTag } from '@/db/tags'

const TYPE_OPTIONS: Mark['type'][] = ['text', 'recording', 'image', 'link', 'file', 'scan', 'todo']

function getMarkPreview(mark: Mark): string {
  if (mark.type === 'link') return mark.url || mark.desc || ''
  return mark.desc?.trim() || mark.content?.trim() || mark.url || ''
}

export function MobileRecordStream() {
  const t = useTranslations()
  const {
    trashState,
    marks,
    allMarks,
    queues,
    fetchAllMarks,
    fetchAllTrashMarks,
  } = useMarkStore()
  const { tags, fetchTags } = useTagStore()

  const [typeFilters, setTypeFilters] = useState<Set<Mark['type']>>(new Set(TYPE_OPTIONS))
  const [tagFilter, setTagFilter] = useState<number | 'all'>('all')
  const [multiMode, setMultiMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [createTagOpen, setCreateTagOpen] = useState(false)
  const [typeFilterOpen, setTypeFilterOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [activeMark, setActiveMark] = useState<Mark | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  useEffect(() => {
    if (trashState) {
      fetchAllTrashMarks()
    } else {
      fetchAllMarks()
    }
  }, [trashState, fetchAllMarks, fetchAllTrashMarks])

  useEffect(() => {
    if (!multiMode) {
      setSelectedIds(new Set())
    }
  }, [multiMode])

  useEffect(() => {
    if (!activeMark) return
    setEditDesc(activeMark.desc || '')
    setEditContent(activeMark.content || '')
    setEditUrl(activeMark.url || '')
  }, [activeMark])

  useEffect(() => {
    if (!activeMark) return
    const hasChanges =
      (activeMark.desc || '') !== editDesc ||
      (activeMark.content || '') !== editContent ||
      (activeMark.url || '') !== editUrl

    if (!hasChanges) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      const updatedMark: Mark = {
        ...activeMark,
        desc: editDesc,
        content: editContent,
        url: editUrl,
      }
      await updateMarkDb(updatedMark)
      setActiveMark(updatedMark)
      await refreshRecords()
    }, 300)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [activeMark, editDesc, editContent, editUrl])

  // 新增记录流程会先刷新 marks（当前标签），这里同步拉取 allMarks 保持时间流实时更新
  useEffect(() => {
    if (!trashState) {
      fetchAllMarks()
    }
  }, [marks, trashState, fetchAllMarks])

  const records = trashState ? marks : allMarks
  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags])

  const filteredRecords = useMemo(() => {
    return records.filter((mark) => {
      if (!typeFilters.has(mark.type)) return false
      if (tagFilter !== 'all' && mark.tagId !== tagFilter) return false
      return true
    })
  }, [records, typeFilters, tagFilter])

  const groupedRecords = useMemo(() => {
    const groups: Array<{ day: string; list: Mark[] }> = []
    const groupMap = new Map<string, Mark[]>()
    for (const mark of filteredRecords) {
      const day = dayjs(mark.createdAt).format('YYYY-MM-DD')
      if (!groupMap.has(day)) groupMap.set(day, [])
      groupMap.get(day)!.push(mark)
    }
    Array.from(groupMap.keys()).forEach((day) => {
      groups.push({ day, list: groupMap.get(day)! })
    })
    return groups
  }, [filteredRecords])

  function getDayLabel(day: string) {
    if (dayjs(day).isSame(dayjs(), 'day')) return t('common.today')
    if (dayjs(day).isSame(dayjs().subtract(1, 'day'), 'day')) return t('common.yesterday')
    return day
  }

  async function refreshRecords() {
    if (trashState) {
      await fetchAllTrashMarks()
    } else {
      await fetchAllMarks()
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDelete(mark: Mark) {
    if (trashState) {
      await delMarkForever(mark.id)
    } else {
      await delMark(mark.id)
    }
    await refreshRecords()
  }

  async function handleRestore(mark: Mark) {
    await restoreMark(mark.id)
    await refreshRecords()
  }

  async function handleMove(mark: Mark, targetTagId: number) {
    await updateMarkDb({ ...mark, tagId: targetTagId })
    await refreshRecords()
  }

  async function handleDeleteSelected() {
    const targets = filteredRecords.filter((item) => selectedIds.has(item.id))
    for (const item of targets) {
      if (trashState) {
        await delMarkForever(item.id)
      } else {
        await delMark(item.id)
      }
    }
    setSelectedIds(new Set())
    await refreshRecords()
  }

  async function handleMoveSelected(targetTagId: number) {
    const targets = filteredRecords.filter((item) => selectedIds.has(item.id))
    for (const item of targets) {
      await updateMarkDb({ ...item, tagId: targetTagId })
    }
    setSelectedIds(new Set())
    await refreshRecords()
  }

  const selectedCount = selectedIds.size
  const isAllSelected = filteredRecords.length > 0 && selectedIds.size === filteredRecords.length

  const tagLabel = tagFilter === 'all' ? t('common.all') : (tags.find((item) => item.id === tagFilter)?.name || t('common.all'))

  const selectedTypeCount = typeFilters.size

  function toggleTypeFilter(type: Mark['type']) {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      if (next.size === 0) {
        return new Set(TYPE_OPTIONS)
      }
      return next
    })
  }

  function selectAllTypes() {
    setTypeFilters(new Set(TYPE_OPTIONS))
  }

  async function handleCreateTag() {
    const value = newTagName.trim()
    if (!value) return
    const res = await insertTag({ name: value })
    const newTagId = Number(res.lastInsertId)
    await fetchTags()
    setTagFilter(newTagId)
    setNewTagName('')
    setCreateTagOpen(false)
  }

  return (
    <div className="flex h-full flex-col">
      {!trashState && (
        <div className="sticky top-0 z-10 border-b bg-background px-3 pb-2 pt-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            {!multiMode ? (
              <>
                <Select value={String(tagFilter)} onValueChange={(value) => setTagFilter(value === 'all' ? 'all' : Number(value))}>
                  <SelectTrigger className="h-9 min-w-0 flex-1">
                    <SelectValue placeholder={tagLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={String(tag.id)}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCreateTagOpen(true)} title={t('record.mark.tag.newTag')}>
                  <Plus className="size-4" />
                </Button>

                <Button variant={selectedTypeCount === TYPE_OPTIONS.length ? 'outline' : 'default'} size="icon" className="h-9 w-9 shrink-0" title={t('common.filter')} onClick={() => setTypeFilterOpen(true)}>
                  <Filter className="size-4" />
                </Button>

                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setMultiMode(true)} title={t('record.mark.toolbar.multiSelect')}>
                  <CheckSquare className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setSelectedIds(isAllSelected ? new Set() : new Set(filteredRecords.map((item) => item.id)))}
                    title={t('record.mark.toolbar.selectAll')}
                  >
                    <ListChecks className="size-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={selectedCount === 0} title={t('record.mark.toolbar.moveTag')}>
                        <MoveRight className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {tags.map((tag) => (
                        <DropdownMenuItem key={tag.id} onClick={() => handleMoveSelected(tag.id)}>
                          {tag.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="destructive" size="icon" className="h-9 w-9 shrink-0" disabled={selectedCount === 0} onClick={handleDeleteSelected} title={t('record.mark.toolbar.delete')}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Button variant="default" size="icon" className="ml-auto h-9 w-9 shrink-0" onClick={() => setMultiMode(false)} title={t('record.mark.toolbar.exitMultiSelect')}>
                  <XSquare className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!trashState && queues.length > 0 && (
          <div className="mb-3 space-y-2">
            {queues.map((queue) => (
              <div key={queue.queueId} className="rounded-xl border border-dashed bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {t(`record.mark.type.${queue.type}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{queue.progress}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {groupedRecords.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">{t('record.mark.empty')}</div>
        ) : (
          groupedRecords.map((group) => (
            <div key={group.day} className="mb-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">{getDayLabel(group.day)}</div>
              <div className="space-y-2">
                {group.list.map((mark) => (
                  <div key={mark.id} className="rounded-xl border bg-card px-3 py-3">
                    <div className="flex items-start gap-2">
                      {multiMode ? (
                        <div className="pt-1">
                          <Checkbox checked={selectedIds.has(mark.id)} onCheckedChange={() => toggleSelect(mark.id)} />
                        </div>
                      ) : null}

                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveMark(mark)}>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {t(`record.mark.type.${mark.type}`)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{dayjs(mark.createdAt).format('HH:mm')}</span>
                          {!trashState && (
                            <span className="ml-auto text-xs text-muted-foreground">{tagMap.get(mark.tagId) || '-'}</span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm">{getMarkPreview(mark) || '-'}</p>
                      </button>

                      {!multiMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!trashState && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <MoveRight className="mr-2 size-4" />
                                  {t('record.mark.toolbar.moveTag')}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {tags.filter((tag) => tag.id !== mark.tagId).map((tag) => (
                                    <DropdownMenuItem key={tag.id} onClick={() => handleMove(mark, tag.id)}>
                                      {tag.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}

                            {trashState ? (
                              <>
                                <DropdownMenuItem onClick={() => handleRestore(mark)}>
                                  <RotateCcw className="mr-2 size-4" />
                                  {t('record.mark.toolbar.restore')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDelete(mark)}>
                                  <Trash2 className="mr-2 size-4 text-red-500" />
                                  <span className="text-red-500">{t('record.mark.toolbar.deleteForever')}</span>
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={() => handleDelete(mark)}>
                                <Trash2 className="mr-2 size-4 text-red-500" />
                                <span className="text-red-500">{t('record.mark.toolbar.delete')}</span>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Sheet open={Boolean(activeMark)} onOpenChange={(open) => !open && setActiveMark(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          {activeMark && (
            <>
              <SheetHeader>
                <SheetTitle>{t(`record.mark.type.${activeMark.type}`)}</SheetTitle>
              </SheetHeader>
              <div className="mt-3 space-y-3 text-sm">
                <div className="text-xs text-muted-foreground">{dayjs(activeMark.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t('record.mark.desc')}</div>
                  <Textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="min-h-20"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t('record.mark.content')}</div>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={8}
                    className="min-h-28"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">URL</div>
                  <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={createTagOpen} onOpenChange={setCreateTagOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t('record.mark.tag.newTag')}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder={t('record.mark.tag.newTagPlaceholder')}
              className="h-10"
            />
            <Button onClick={handleCreateTag} className="h-10 w-full">
              {t('record.mark.tag.add')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={typeFilterOpen} onOpenChange={setTypeFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t('common.filter')}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <label className="flex h-11 items-center gap-3 rounded-xl border px-3">
              <Checkbox checked={selectedTypeCount === TYPE_OPTIONS.length} onCheckedChange={selectAllTypes} />
              <span className="text-sm">{t('common.all')}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((type) => (
                <label key={type} className="flex h-11 items-center gap-3 rounded-xl border px-3">
                  <Checkbox checked={typeFilters.has(type)} onCheckedChange={() => toggleTypeFilter(type)} />
                  <span className="truncate text-sm">{t(`record.mark.type.${type}`)}</span>
                </label>
              ))}
            </div>
            <Button className="h-10 w-full" onClick={() => setTypeFilterOpen(false)}>
              {t('common.confirm')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
