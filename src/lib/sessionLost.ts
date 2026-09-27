/** Tiny event bus: anything that finds the stored login gone tells AuthProvider, which signs out cleanly. */
export const SESSION_LOST_EVENT = 'jt-session-lost'
export const reportSessionLost = () => window.dispatchEvent(new Event(SESSION_LOST_EVENT))
