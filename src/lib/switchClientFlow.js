import { Alert } from 'react-native';
import { hasPendingChanges, flushPending } from './storage';

// One tap from Home or Settings: show the client's phone-number screen on top. The current
// client stays open until another one is opened, so Back returns to where the nurse was.
// Asks first only when offline changes would be lost by switching.
export async function openSwitchClient(navigation) {
  const go = () => navigation.navigate('ClientVerify', { switching: true });

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
      { text: 'Continue', style: 'destructive', onPress: go },
    ]
  );
}
