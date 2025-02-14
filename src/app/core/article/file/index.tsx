'use client'

import {
  Sidebar,
  SidebarHeader,
} from "@/components/ui/sidebar"
import React, { useEffect } from "react"
import { FileToolbar } from "./file-toolbar"
import { FileManager } from "./file-manager"
import useArticleStore from "@/stores/article"

export function FileSidebar() {
  const { initCollapsibleList } = useArticleStore()

  useEffect(() => {
    initCollapsibleList()
  }, [])

  return (
    <Sidebar collapsible="none" className="w-full h-screen">
      <SidebarHeader className="p-0">
        <FileToolbar />
      </SidebarHeader>
      <FileManager />
    </Sidebar>
  )
}