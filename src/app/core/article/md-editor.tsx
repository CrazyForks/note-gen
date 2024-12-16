'use client'
import dynamic from 'next/dynamic'
import { type MDXEditorMethods, type MDXEditorProps} from '@mdxeditor/editor'
import useArticleStore from '@/stores/article';
import { useEffect, useRef, useState } from 'react';
import useSettingStore from '@/stores/setting';
import CustomToolbar from './custom-toolbar/index';
import { Suspense } from 'react'
export function MdEditor() {

  const Editor = dynamic(() => import('@/components/md-editor'), {
    ssr: false
  })

  const ref = useRef<MDXEditorMethods>(null);
  const { currentArticle, setCurrentArticle, loadFileTree, activeFilePath } = useArticleStore()

  async function handleSave() {
    loadFileTree()
  }

  useEffect(() => {
    ref.current?.setMarkdown(currentArticle)
    setTimeout(() => {
      console.log(ref.current);
    }, 1000);
  }, [currentArticle])
  
  return <div className='flex-1'>
    {/* <CustomToolbar mdRef={ref} /> */}
    <Suspense fallback={null}>
      <Editor markdown={currentArticle} ref={ref} />
    </Suspense>
  </div>
}