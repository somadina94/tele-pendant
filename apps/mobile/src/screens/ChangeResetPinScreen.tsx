import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { apiPatch } from '../api';

export function ChangeResetPinScreen({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (newPin !== confirmPin) {
      setError('New reset PINs do not match');
      return;
    }
    if (newPin.length < 4) {
      setError('Reset PIN must be at least 4 characters');
      return;
    }
    setBusy(true);
    try {
      const body: { newPin: string; currentPin?: string } = { newPin };
      if (currentPin.trim()) body.currentPin = currentPin.trim();
      await apiPatch('/auth/safe-action-pin', body, token);
      setDone(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update reset PIN',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-background p-4">
      <Text className="mb-1 text-lg font-semibold text-foreground">
        Reset PIN
      </Text>
      <Text className="mb-4 text-sm text-muted-foreground">
        Used only to clear e-stop after STOP. Each person sets their own PIN (4+
        characters). If you still use the plant default, enter it under Current
        when changing.
      </Text>
      {done ? (
        <Text className="mb-4 text-sm text-green-600 dark:text-green-400">
          Reset PIN updated.
        </Text>
      ) : null}
      {error ? (
        <Text className="mb-3 text-sm text-destructive">{error}</Text>
      ) : null}
      <Text className="mb-1 text-xs text-muted-foreground">
        Current reset PIN (if any)
      </Text>
      <TextInput
        className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={currentPin}
        onChangeText={setCurrentPin}
      />
      <Text className="mb-1 text-xs text-muted-foreground">New reset PIN</Text>
      <TextInput
        className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={newPin}
        onChangeText={setNewPin}
      />
      <Text className="mb-1 text-xs text-muted-foreground">
        Confirm new reset PIN
      </Text>
      <TextInput
        className="mb-4 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={confirmPin}
        onChangeText={setConfirmPin}
      />
      <Pressable
        className={`mb-2 items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-60' : ''}`}
        disabled={busy}
        onPress={() => void submit()}
      >
        <Text className="font-semibold text-primary-foreground">
          {busy ? 'Saving…' : 'Save reset PIN'}
        </Text>
      </Pressable>
      <Pressable className="items-center py-2" onPress={onClose}>
        <Text className="text-sm text-muted-foreground">Close</Text>
      </Pressable>
    </View>
  );
}
