import { forgetEmail } from '@/services/auth/rememberedEmail';
import { supabase } from '@/services/supabase/client';
import { mapPostgrestError, mapUnknownError } from '@/services/supabase/errors';

/**
 * The two data rights that are not optional.
 *
 * Both are RECORDED here, not executed here. A client cannot be trusted to
 * delete an account: it would have to be granted destructive rights over its
 * own rows and over storage, and an app with that permission is one bug away
 * from wiping a user's history. The request row is what a service_role job acts
 * on, so the destructive step happens where it can be audited and rate limited.
 *
 * Both tables are insert-and-select only for the owner - a user can ask, and
 * can see the status of what they asked for, and can do nothing else.
 */

export const requestDataExport = async (userId: string): Promise<void> => {
  try {
    const { error } = await supabase.from('export_requests').insert({ user_id: userId });
    if (error !== null) throw mapPostgrestError(error);
  } catch (e) {
    throw mapUnknownError(e);
  }
};

export const requestAccountDeletion = async (userId: string): Promise<void> => {
  try {
    const { error } = await supabase.from('deletion_requests').insert({ user_id: userId });
    if (error !== null) throw mapPostgrestError(error);

    // After the request is recorded, not before: if the insert fails the user
    // still has an account, and clearing their address first would leave the
    // sign-in field empty for an account that still exists. "Delete
    // everything" has to include the address we kept on this device.
    await forgetEmail();
  } catch (e) {
    throw mapUnknownError(e);
  }
};
