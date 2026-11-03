import { ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocale } from '../locale';
import { HelpTip } from '../tour';
import { Hint, Section } from '../ui';
import { FaceChallenge } from './FaceChallenge';

const rootStyle = StyleSheet.create({
  root: { flex: 1 },
});

export function FaceScreen({
  token,
  onToken,
}: {
  token: string;
  onToken: (token: string) => void;
}) {
  const { t } = useLocale();
  const isFocused = useIsFocused();

  return (
    <View style={rootStyle.root} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <HelpTip id="tour.face.title">
          <>
            <Section>{t('faceTitle')}</Section>
            <Hint>
              Local challenge liveness (3 poses). Not ISO-certified. Fail closed
              to password. Face never authorizes e-stop or safe actions. Enroll
              here after password sign-in; use Face login from the sign-in
              screen when logged out.
            </Hint>
          </>
        </HelpTip>
        <FaceChallenge
          token={token}
          onToken={onToken}
          active={isFocused}
          allowEnroll
          allowLogin
          enrollHelpTipId="tour.face.enroll"
          loginHelpTipId="tour.face.login"
        />
      </ScrollView>
    </View>
  );
}
