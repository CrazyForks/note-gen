export function getOutlinePanelClass(position: 'left' | 'right' = 'right') {
  return `outline-panel w-64 min-w-64 shrink-0 ${position === 'left' ? 'border-r' : 'border-l'} border-[hsl(var(--border))] bg-[hsl(var(--background))] overflow-y-auto`
}

export function getOutlineHeadingTextClass() {
  return 'flex-1 min-w-0 break-all whitespace-normal leading-5'
}
