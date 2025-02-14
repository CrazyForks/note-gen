import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import useArticleStore, { DirTree } from "@/stores/article";
import { BaseDirectory, exists, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir } from '@tauri-apps/api/path';
import { Cloud, CloudDownload, File } from "lucide-react"
import { useEffect, useRef, useState } from "react";
import { ask } from '@tauri-apps/plugin-dialog';
import { deleteFile } from "@/lib/github";
import { RepoNames } from "@/lib/github.types";
import { cloneDeep } from "lodash-es";
import { open } from "@tauri-apps/plugin-shell";
import { computedParentPath, getCurrentFolder } from "@/lib/path";
import { toast } from "@/hooks/use-toast";

export function FileItem({ item }: { item: DirTree }) {
  const [isEditing, setIsEditing] = useState(item.isEditing)
  const [name, setName] = useState(item.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const { activeFilePath, setActiveFilePath, readArticle, setCurrentArticle, fileTree, setFileTree } = useArticleStore()
  
  const path = computedParentPath(item)
  const isRoot = path.split('/').length === 1
  const folderPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''
  const cacheTree = cloneDeep(fileTree)
  const currentFolder = getCurrentFolder(folderPath, cacheTree)

  function handleSelectFile() {
    setActiveFilePath(path)
    readArticle(path, item.sha, item.isLocale)
  }

  async function handleDeleteFile() {
    await remove(`article/${path}`, { baseDir: BaseDirectory.AppData })
    if (currentFolder) {
      currentFolder?.children?.splice(currentFolder.children.findIndex(file => file.name === item.name), 1)
    } else {
      const index = cacheTree.findIndex(file => file.name === item.name)
      cacheTree.splice(index, 1)
    }
    setFileTree(cacheTree)
    setActiveFilePath('')
    setCurrentArticle('')
  }

  async function handleDeleteSyncFile() {
    const answer = await ask('确定是否将同步文件删除?', {
      title: 'NoteGen',
      kind: 'warning',
    });
    if (answer) {
      await deleteFile({ path: activeFilePath, sha: item.sha as string, repo: RepoNames.sync })
      const index = currentFolder?.children?.findIndex(file => file.name === item.name)
      if (index !== undefined && index !== -1 && currentFolder?.children) {
        currentFolder.children[index].sha = ''
      }
      setFileTree(cacheTree)
    }
  }

  async function handleStartRename() {
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 300);
  }

  async function handleRename() {
    setName(name.replace(/ /g, '_')) // github 存储空格会报错，替换为下划线
    if (name && name !== item.name) {
      if (currentFolder && currentFolder.children) {
        const fileIndex = currentFolder?.children?.findIndex(file => file.name === item.name)
        if (fileIndex !== undefined && fileIndex !== -1) {
          currentFolder.children[fileIndex].name = name + '.md'
          currentFolder.children[fileIndex].isEditing = false
        }
      } else {
        const fileIndex = cacheTree.findIndex(file => file.name === item.name)
        cacheTree[fileIndex].name = name + '.md'
        cacheTree[fileIndex].isEditing = false
      }
      const oldPath = `article/${path}` 
      const newPath = `article/${path.split('/').slice(0, -1).join('/')}/${name}`
      if (newPath.includes('.md')) {
        await rename(oldPath, newPath, { newPathBaseDir: BaseDirectory.AppData, oldPathBaseDir: BaseDirectory.AppData })
      } else {
        const isExists = await exists(newPath + '.md', { baseDir: BaseDirectory.AppData })
        if (isExists) {
          toast({ title: '文件名已存在' })
          setTimeout(() => inputRef.current?.focus(), 300);
          return
        } else {
          await writeTextFile(newPath + '.md', '', { baseDir: BaseDirectory.AppData })
        }
      }
    }
    setFileTree(cacheTree)
    setIsEditing(false)
  }

  async function handleShowFileManager() {
    const appDir = await appDataDir()
    open(`${appDir}/article${item.parent? '/'+item.parent.name : ''}`)
  }

  async function handleDragStart(ev: React.DragEvent<HTMLDivElement>) {
    ev.dataTransfer.setData('text', path)
  }

  useEffect(() => {
    if (item.isEditing) {
      setName(name)
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [item])

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={`${path === activeFilePath ? 'file-manange-item active' : 'file-manange-item'} ${isRoot && '-translate-x-5'}`}
          onClick={handleSelectFile}
          onContextMenu={handleSelectFile}
        >
          {
            isEditing ? 
            <div className="flex gap-1 items-center w-full select-none">
              <span className={item.parent ? 'size-0' : 'size-4 ml-1'} />
              <File className="size-4" />
              <Input
                ref={inputRef}
                className="h-5 rounded-sm text-xs px-1 font-normal flex-1 mr-1"
                value={name}
                onBlur={handleRename}
                onChange={(e) => { setName(e.target.value) }}
                onKeyDown={(e) => {
                  if (e.code === 'Enter') {
                    handleRename()
                  }
                }}
              />
            </div> :
            <span draggable onDragStart={handleDragStart}
              className={`${item.isLocale ? '' : 'opacity-50'} flex justify-between flex-1 select-none items-center gap-1 dark:hover:text-white`}>
              <div className="flex flex-1 gap-1 select-none relative">
                <span className={item.parent ? 'size-0' : 'size-4 ml-1'}></span>
                <div className="relative">
                  { item.isLocale ? <File className="size-4" /> : <CloudDownload className="size-4" /> }
                  { item.sha && item.isLocale && <Cloud className="size-2.5 absolute left-0 bottom-0 z-10 bg-primary-foreground" /> }
                </div>
                <span className="text-xs flex-1 line-clamp-1">{item.name}</span>
              </div> 
            </span>
          }
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem inset onClick={handleShowFileManager}>
          查看目录
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem inset disabled>
          剪切
        </ContextMenuItem>
        <ContextMenuItem inset disabled>
          复制
        </ContextMenuItem>
        <ContextMenuItem inset disabled>
          粘贴
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!item.isLocale} inset onClick={handleStartRename}>
          重命名
        </ContextMenuItem>
        <ContextMenuItem disabled={!item.sha} inset className="text-red-900" onClick={handleDeleteSyncFile}>
          删除同步文件
        </ContextMenuItem>
        <ContextMenuItem disabled={!item.isLocale} inset className="text-red-900" onClick={handleDeleteFile}>
          删除本地文件
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}