'use client'
import { Store } from '@tauri-apps/plugin-store'
import { redirect } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  async function init() {
    const store = await Store.load('store.json')
    const currentPage = await store.get<string>('currentPage')
    redirect(currentPage || '/core/record')
  }
  useEffect(() => {
    init()
  }, [])
}