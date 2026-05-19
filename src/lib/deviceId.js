import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '../utils/formatters';

const KEY = '@cradlewell_device_id';
let cached = null;

export async function getDeviceId() {
  if (cached) return cached;
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      id = uid();
      await AsyncStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch (_) {
    return 'unknown-device';
  }
}
