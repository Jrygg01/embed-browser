// Import global styles. This is the conventional place to import stylesheets
// that should apply to all pages in the application.
import '../styles/globals.css'; // Import Tailwind CSS base, components, utilities, and custom global styles.

/**
 * Custom App component for Next.js.
 * This component wraps around all page components and is used for:
 * - Applying global layouts
 * - Persisting state between page navigations
 * - Injecting global CSS
 * - Handling errors
 *
 * @param {object} props - The props passed to the App component.
 * @param {React.ComponentType} props.Component - The active page component being rendered.
 * @param {object} props.pageProps - The initial props preloaded for the active page.
 */
function MyApp({ Component, pageProps }) {
  // Render the active page component with its props.
  return <Component {...pageProps} />;
}

export default MyApp;