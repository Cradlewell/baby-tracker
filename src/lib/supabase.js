import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  'https://uiefqjiwfyfiwqhplnhe.supabase.co',
  'sb_publishable_lrRr6VNzRmEp_Q4b4Lg3NQ_WJBb_unS',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export async function syncToSupabase(table, data) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from(table).upsert({ ...data, user_id: user.id });
  } catch (_) {}
}
