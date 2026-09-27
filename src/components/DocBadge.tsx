import { useContext } from 'react'
import { DocCounts } from '../lib/docCounts'
import { PaperclipIcon } from './Icons'

export function DocBadge({ appId }: { appId: string }) {
  const n = useContext(DocCounts).get(appId) ?? 0
  if (!n) return null
  return (
    <span className="doc-badge" title={`${n} document${n === 1 ? '' : 's'} attached`}>
      <PaperclipIcon size={12} />
      {n}
      <span className="sr-only"> document{n === 1 ? '' : 's'}</span>
    </span>
  )
}
