import BrowseSelector from "@/components/BrowseSelector";

// Volume and book selection happen in the browser from the bundled catalog (see BrowseSelector); each selection
// URL is still a real route, so reloads and direct links render the same view on the server.
export default function BrowsePage() {
  return <BrowseSelector />;
}
