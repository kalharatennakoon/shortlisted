import { createContext } from 'react'
import type { Stage } from './types'

/** application id -> its timeline, oldest first. Provided by the Tracker so board cards and table rows don't need a new prop. */
export const StageLists = createContext<Map<string, Stage[]>>(new Map())
