import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import useArticleStore, { DirTree } from "@/stores/article";
import { BaseDirectory, mkdir, remove, rename } from "@tauri-apps/plugin-fs";
import { appDataDir } from '@tauri-apps/api/path';
import { ChevronRight, Cloud, Folder, FolderDown } from "lucide-react"
import { useEffect, useRef, useState } from "react";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { cloneDeep } from "lodash-es";
import { open } from "@tauri-apps/plugin-shell";
import { computedParentPath, getCurrentFolder } from "@/lib/path";

export function FolderItem({ item }: { item: DirTree }) {
  const [isEditing, setIsEditing] = useState(item.isEditing)
  const [name, setName] = useState(item.name)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { activeFilePath, loadFileTree, setActiveFilePath, collapsibleList, setCollapsibleList, fileTree, setFileTree, newFileOnFolder } = useArticleStore()

  const path = computedParentPath(item)
  const cacheTree = cloneDeep(fileTree)
  const currentFolder = getCurrentFolder(path, cacheTree)
  const parentFolder = currentFolder?.parent

  async function handleDeleteFolder(evnet: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    evnet.stopPropagation()
    try {
      await remove(`article/${path}`, { baseDir: BaseDirectory.AppData })
      if (parentFolder) {
        const index = parentFolder.children?.findIndex(folder => folder.name === currentFolder.name)
        console.log(index);
        if (index!== -1 && index !== undefined && parentFolder.children) {
          parentFolder.children.splice(index, 1)
          setFileTree(cacheTree)
        }
      } else {
        const index = cacheTree?.findIndex(folder => folder.name === currentFolder?.name)
        if (index!== -1 && index !== undefined && cacheTree) {
          cacheTree.splice(index, 1)
          setFileTree(cacheTree)
        }
      }
    } catch {
      toast({
        title: '删除失败',
        description: '文件夹内存在文件！',
        variant: 'destructive',
      })
    }
  }

  async function handleStartRename() {
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleRename() {
    const name = inputRef.current?.value.replace(/ /g, '_') as string
    if (name !== '' && item.name && name !== item.name) {
      if (name && name !== item.name) {
        await loadFileTree()
      }
      await rename(`article/${item.name}`, `article/${name}`, { newPathBaseDir: BaseDirectory.AppData, oldPathBaseDir: BaseDirectory.AppData })
      const cacheTree = cloneDeep(fileTree)
      const index = cacheTree.findIndex(file => file.name === item.name)
      if (index !== -1) {
        cacheTree.splice(index, 1, {
          name,
          parent: undefined,
          isEditing: false,
          isLocale: true,
          isDirectory: true,
          isFile: false,
          isSymlink: false
        })
        setFileTree(cacheTree)
      }
    } else if (name !== '' && !fileTree.map(item => item.name).includes(name)) {
      await mkdir(`article/${name}`, { baseDir: BaseDirectory.AppData })
      const cacheTree = cloneDeep(fileTree)
      cacheTree.splice(0, 1, {
        name,
        parent: undefined,
        isEditing: false,
        isLocale: true,
        isDirectory: true,
        isFile: false,
        isSymlink: false
      })
      setFileTree(cacheTree)
    } else {
      fileTree.splice(0, 1)
      setFileTree(fileTree)
    }
    setIsEditing(false)
  }

  async function handleShowFileManager() {
    const appDir = await appDataDir()
    open(`${appDir}/article/${path}`)
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const renamePath = e.dataTransfer?.getData('text')
    if (renamePath) {
      const filename = renamePath.slice(renamePath.lastIndexOf('/') + 1)
      const oldPaht = `article/${renamePath}`;
      const newPath = `article/${path}/${filename}`;
      await rename(oldPaht, newPath, { newPathBaseDir: BaseDirectory.AppData, oldPathBaseDir: BaseDirectory.AppData })
      loadFileTree()
      if (renamePath === activeFilePath && !collapsibleList.includes(item.name)) {
        setCollapsibleList(item.name, true)
        setActiveFilePath(newPath.replace('article/', ''))
      }
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true)
  }

  function handleDragleave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false)
  }

  function newFileHandler() {
    newFileOnFolder(item.name)
  }

  useEffect(() => {
    if (item.isEditing) {
      setName(name)
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [item])

  return (
    <CollapsibleTrigger className="w-full select-none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={`${isDragging ? 'file-on-drop' : ''} group -translate-x-5 file-manange-item flex select-none`}>
            <ChevronRight className="transition-transform size-4 ml-1 bg-sidebar group-hover:bg-transparent" />
            {
              isEditing ?
                <>
                  {
                    item.isLocale ?
                      <Folder className="size-4" /> :
                      <FolderDown className="size-4" />
                  }
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
                </> :
                <div
                  onDrop={(e) => handleDrop(e)}
                  onDragOver={e => handleDragOver(e)}
                  onDragLeave={(e) => handleDragleave(e)}
                  className={`${item.isLocale ? '' : 'opacity-50'} flex gap-1 items-center flex-1 select-none`}
                >
                  <div className="flex flex-1 gap-1 select-none relative">
                    <div className="relative">
                      {item.isLocale ? <Folder className="size-4" /> : <FolderDown className="size-4" /> }
                      {item.sha && item.isLocale && <Cloud className="size-2.5 absolute left-0 bottom-0 z-10 bg-primary-foreground" />}
                    </div>
                    <span className="text-xs line-clamp-1">{item.name}</span>
                  </div>
                </div>
            }
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem inset onClick={newFileHandler}>
            新建文件
          </ContextMenuItem>
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
          <ContextMenuItem inset onClick={handleStartRename}>
            重命名
          </ContextMenuItem>
          <ContextMenuItem inset className="text-red-900" onClick={(e) => { handleDeleteFolder(e); }}>
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </CollapsibleTrigger>
  )
}