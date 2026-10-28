import { Redirect } from "expo-router";

// Like the web's / (src/app/page.tsx), the app opens on Browse.
export default function Index() {
  return <Redirect href="/browse" />;
}
