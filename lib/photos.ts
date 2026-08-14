import { Platform } from 'react-native';

/**
 * Take a photo with the camera, or pick one or more from the gallery.
 * Returns the local file URIs (empty array if the user cancelled).
 */
export async function pickPhotos(
  source: 'camera' | 'library',
  opts: { multiple?: boolean } = {},
): Promise<string[]> {
  const ImagePicker = await import('expo-image-picker');

  if (source === 'camera') {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error('Camera access was not allowed. Turn it on in your phone settings.');
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (res.canceled) return [];
    return res.assets.map((a) => a.uri);
  }

  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Photo access was not allowed. Turn it on in your phone settings.');
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    quality: 0.6,
    allowsMultipleSelection: !!opts.multiple,
    mediaTypes: ['images'],
  });
  if (res.canceled) return [];
  return res.assets.map((a) => a.uri);
}
