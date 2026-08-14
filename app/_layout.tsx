import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C } from '../lib/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.ink,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="viewing/[key]" options={{ title: 'Viewing' }} />
        <Stack.Screen name="nearby" options={{ title: 'Nearby Properties' }} />
        <Stack.Screen name="inspection/run" options={{ title: 'Run Inspection' }} />
        <Stack.Screen name="settings/monday" options={{ title: 'Monday.com Setup' }} />
        <Stack.Screen name="settings/monday-columns" options={{ title: 'Find applicants column' }} />
        <Stack.Screen name="settings/properties" options={{ title: 'Properties' }} />
        <Stack.Screen name="settings/property-edit" options={{ title: 'Property' }} />
        <Stack.Screen name="settings/report" options={{ title: 'Report & Email' }} />
        <Stack.Screen name="settings/accounts" options={{ title: 'Accounts & Rates' }} />
        <Stack.Screen name="accounts/mileage" options={{ title: 'Mileage & Visits' }} />
        <Stack.Screen name="accounts/costs" options={{ title: 'Costs & Receipts' }} />
        <Stack.Screen name="accounts/meters" options={{ title: 'Meter Readings' }} />
      </Stack>
    </>
  );
}
