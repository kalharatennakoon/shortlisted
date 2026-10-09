import { useContext } from 'react'
import { fmtDate } from '../lib/format'
import { STAGE_STATE_LABEL, stageState } from '../lib/stages'
import { StageLists } from '../lib/stageLists'
import { TimelineIcon } from './Icons'

/** Timeline marker on a card or row: how many stages the application has been through, with the list as a tooltip. */
export function StageBadge({ appId }: { appId: string }) {
  const stages = useContext(StageLists).get(appId) ?? []
  const n = stages.length
  if (!n) return null
  const list = stages.map((s) => `${fmtDate(s.stage_date)}: ${s.title} (${STAGE_STATE_LABEL[stageState(s)].toLowerCase()})`).join('\n')
  return (
    <span className="doc-badge" title={list}>
      <TimelineIcon size={12} />
      {n}
      <span className="sr-only"> stage{n === 1 ? '' : 's'} in the timeline</span>
    </span>
  )
}
