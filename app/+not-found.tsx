import { Redirect } from 'expo-router';

// SPA hosting sends unknown paths here — bounce to Home.
export default function NotFound() {
  return <Redirect href="/" />;
}
