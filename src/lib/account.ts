import { deleteAllMyFiles } from './documents'
import { supabase } from './supabase'

/**
 * Permanently deletes the signed-in user's account, all their applications and uploaded documents
 * (see supabase/migrations/*_delete_my_account.sql), then clears the local session.
 */
export async function deleteMyAccount(): Promise<void> {
  // Files first: Storage objects can't be deleted from SQL, and they'd be left behind otherwise.
  // If this fails, stop before the account is deleted so nothing is orphaned.
  await deleteAllMyFiles()
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
  // The account no longer exists on the server, so only clear this browser's session.
  // Leave a one-time note for the sign-in screen (the redirect after sign-out drops any URL params).
  try {
    sessionStorage.setItem(DELETED_FLAG, '1')
  } catch {
    /* storage blocked: the confirmation just won't show */
  }
  await supabase.auth.signOut({ scope: 'local' })
}

const DELETED_FLAG = 'jt-account-deleted'

/** True once after an account deletion; reading is side-effect free, call clearAccountDeletedNotice() to dismiss. */
export function accountJustDeleted(): boolean {
  try {
    return sessionStorage.getItem(DELETED_FLAG) === '1'
  } catch {
    return false
  }
}

export function clearAccountDeletedNotice(): void {
  try {
    sessionStorage.removeItem(DELETED_FLAG)
  } catch {
    /* ignore */
  }
}
