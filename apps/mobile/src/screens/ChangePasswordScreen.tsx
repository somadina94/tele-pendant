import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { apiPatch } from '../api';
export function ChangePasswordScreen({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await apiPatch('/auth/password', { currentPassword, newPassword }, token);
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update password',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-background p-4">
      <Text className="mb-1 text-lg font-semibold text-foreground">
        Change password
      </Text>
      <Text className="mb-4 text-sm text-muted-foreground">
        Use at least 8 characters. You stay signed in after updating.
      </Text>
      {done ? (
        <Text className="mb-4 text-sm text-green-600 dark:text-green-400">
          Password updated.
        </Text>
      ) : null}
      {error ? (
        <Text className="mb-3 text-sm text-destructive">{error}</Text>
      ) : null}
      <Text className="mb-1 text-xs text-muted-foreground">
        Current password
      </Text>
      <TextInput
        className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <Text className="mb-1 text-xs text-muted-foreground">New password</Text>
      <TextInput
        className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <Text className="mb-1 text-xs text-muted-foreground">
        Confirm new password
      </Text>
      <TextInput
        className="mb-4 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
        secureTextEntry
        autoCapitalize="none"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <Pressable
        className={`mb-2 items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-60' : ''}`}
        disabled={busy}
        onPress={() => void submit()}
      >
        <Text className="font-semibold text-primary-foreground">
          {busy ? 'Saving…' : 'Save password'}
        </Text>
      </Pressable>
      <Pressable className="items-center py-2" onPress={onClose}>
        <Text className="text-sm text-muted-foreground">Close</Text>
      </Pressable>
    </View>
  );
}
