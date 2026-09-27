import { createContext } from 'react'

/** application id -> number of attached documents. Provided by the Tracker so board cards don't need a new prop. */
export const DocCounts = createContext<Map<string, number>>(new Map())
