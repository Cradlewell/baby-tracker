import { Alert } from 'react-native';
import { switchClient } from './session';
import { hasPendingChanges, flushPending } from './storage';

// One tap from Home, More or Settings: leave the current client and show the
// client's phone-number screen. Asks first only when offline changes would be lost.
export async function openSwitchClient(navigation) {
  const go = async () => {
    await switchClient();
    navigation.reset({ index: 0, routes: [{ name: 'ClientVerify' }] });
  };

  await flushPending().catch(() => {});
  if (!(await hasPendingChanges().catch(() => false))) {
    await go();
    return;
  }
  Alert.alert(
    'Switch client?',
    'Some changes made offline have not been uploaded yet and will be lost. Connect to the internet first to keep them.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch anyway', style: 'destructive', onPress: go },
    ]
  );
}
