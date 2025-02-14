'use client'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import React, { useEffect, useState } from "react"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import useArticleStore, { DirTree } from "@/stores/article"
import { BaseDirectory, rename, writeTextFile } from "@tauri-apps/plugin-fs"
import { FileItem } from './file-item'
import { FolderItem } from "./folder-item"
import { computedParentPath } from "@/lib/path"

function Tree({ item }: { item: DirTree }) {
  const { collapsibleList, setCollapsibleList, loadCollapsibleFiles } = useArticleStore()
  const path = computedParentPath(item)

  function handleCollapse(isOpen: boolean) {
    setCollapsibleList(path, isOpen)
    if (isOpen) {
      loadCollapsibleFiles(path)
    }
  }

  return (
    item.isFile ? 
    <FileItem item={item} /> :
    <SidebarMenuItem>
      <Collapsible
        onOpenChange={handleCollapse}
        className="group/collapsible [&[data-state=open]>button>.file-manange-item>svg:first-child]:rotate-90"
        open={collapsibleList.includes(path)}
      >
        <FolderItem item={item} />
        <CollapsibleContent className="pl-1">
          <SidebarMenuSub>
            {item.children?.map((subItem) => (
              <Tree key={subItem.name} item={subItem} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

export function FileManager() {
  const [isDragging, setIsDragging] = useState(false)
  const { activeFilePath, fileTree, loadFileTree, setActiveFilePath, addFile } = useArticleStore()

  async function handleDrop (e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const renamePath = e.dataTransfer?.getData('text')
    if (renamePath) {
      const filename = renamePath.slice(renamePath.lastIndexOf('/') + 1)
      const oldPaht = `article/${renamePath}`;
      const newPath = `article/${filename}`;
      await rename(oldPaht, newPath ,{ newPathBaseDir: BaseDirectory.AppData, oldPathBaseDir: BaseDirectory.AppData})
      await loadFileTree()
      if (renamePath === activeFilePath) {
        setActiveFilePath(newPath.replace('article/', ''))
      }
    } else {
      const files = e.dataTransfer.files
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        if (file.name.endsWith('.md')) {
          const text = await file.text()
          await writeTextFile(`article/${file.name}`, text, { baseDir: BaseDirectory.AppData })
          addFile({
            name: file.name,
            isEditing: false,
            isLocale: true,
            isDirectory: false,
            isFile: true,
            isSymlink: false
          })
        }
      }
    }
    setIsDragging(false)
  }
  
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true)
  }

  function handleDragleave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false)
  }

  useEffect(() => {
    if (fileTree.length === 0) {
      loadFileTree()
    }
  }, [loadFileTree])

  return (
    <SidebarContent className={`${isDragging && 'outline-2 outline-black outline-dotted -outline-offset-4'}`}>
      <SidebarGroup className="flex-1 p-0">
        <SidebarGroupContent className="flex-1">
          <SidebarMenu className="h-full">
            <div
              className="min-h-0.5"
              onDrop={(e) => handleDrop(e)}
              onDragOver={e => handleDragOver(e)}
              onDragLeave={(e) => handleDragleave(e)}
            >
            </div>
            {fileTree.map((item) => (
              <Tree key={item.name + item.parent?.name} item={item} />
            ))}
            <div
              className="flex-1 min-h-1"
              onDrop={(e) => handleDrop(e)}
              onDragOver={e => handleDragOver(e)}
              onDragLeave={(e) => handleDragleave(e)}
            >
            </div>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}