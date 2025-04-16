# Custom Embed Browser

## Goals & Overall Idea

This project, built using Next.js (Pages Router), demonstrates a custom web search interface that allows users to:
- Perform web searches using the Google Custom Search API.
- View search results, filtered for potential embeddability within an iframe.
- Browse selected search results directly within an embedded iframe component on the page.
- Track user interactions, including search queries and time spent viewing embedded pages, storing this data in MongoDB.

## Technical Details

- **Framework:** Next.js (Pages Router)
- **Runtime:** Node.js
- **UI Library:** React
- **Styling:** Tailwind CSS
- **State Management:** React Hooks (useState, useRef, useEffect, useCallback)
- **Database:** MongoDB (via Mongoose or native driver, using `lib/mongodb.js` for connection management)
- **APIs:**
    - Google Custom Search API (for fetching search results)
    - Internal Next.js API Routes (`pages/api/`) for search proxying and data tracking.
- **Deployment:** Designed for Vercel.

## Getting Started

```bash
npm install
# Create a .env.local file (see Environment Variables section)
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open a URL like `http://localhost:3000/[someUserID]` (e.g., `http://localhost:3000/test-user`) in your browser to use the application. Replace `[someUserID]` with any identifier for the user session.

## Learn More

To learn more about the technologies used in this project, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) – Learn about Next.js features and API.
- [React Documentation](https://reactjs.org/docs/getting-started.html) – Learn about React.
- [MongoDB Documentation](https://docs.mongodb.com) – Learn how the database integration is managed.
- [Tailwind CSS](https://tailwindcss.com) – For styling and responsive design guides.
- [Google Custom Search API](https://developers.google.com/custom-search/v1/overview) - For understanding the search backend.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) for more details.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Environment Variables

To run this project locally, create a `.env.local` file in the root of the project and set the following variables:

- `MONGO_URI`: The connection string for your MongoDB instance (e.g., MongoDB Atlas). (Required)
- `MONGO_DB_NAME`: The MongoDB database name (defaults to `CustomSearch` if not set in `lib/mongodb.js`).
- `GOOGLE_CUSTOM_SEARCH_API_KEY`: Your Google Custom Search API key. (Required)
- `GOOGLE_CUSTOM_SEARCH_CX_ID`: Your Google Custom Search Engine ID (CX ID). (Required)

## Project Structure & Workflow

This project uses the Next.js Pages Router. Here's a breakdown of key files and the application flow:

- **`pages/[userID]/index.js`:**
    - This is the main user-facing page, accessed via a URL like `/user123`.
    - It uses Next.js dynamic routing to capture the `userID` from the URL.
    - Manages the overall UI state: search query, loading status, search results, and whether the embedded browser is visible.
    - Renders the main layout, including the persistent header `SearchBar` and the `SearchResults` component.
    - Handles user interactions: initiating searches via `handleSearch` and displaying results in the embedded browser via `handleResultClick`.
    - Contains the `EmbeddedBrowser` component, which is conditionally rendered when a result is clicked.
    - Implements tracking logic using `useEffect` and `useCallback` hooks to record search events and click durations.
    - Uses `navigator.sendBeacon` (with a fetch fallback) in `useEffect` cleanup and `visibilitychange` events to reliably send tracking data before the page unloads.

- **`pages/api/search.js`:**
    - An API route that acts as a backend proxy for the Google Custom Search API.
    - Receives search queries from the frontend (`pages/[userID]/index.js`).
    - Fetches results from the Google API using the configured API key and CX ID.
    - Implements pagination logic to potentially fetch multiple pages of results from Google.
    - Performs embeddability checks:
        - `isEmbeddable()`: A quick domain blacklist check.
        - `isDisplayable()`: A more reliable check using HEAD requests to inspect `X-Frame-Options` and `Content-Security-Policy` headers.
    - Filters and combines results, prioritizing likely embeddable ones, before sending them back to the frontend.

- **`pages/api/track-data/[userID].js`:**
    - A dynamic API route for receiving and storing user interaction data.
    - Captures the `userID` from the URL.
    - Receives POST requests containing search and click data (including URLs, timestamps, and durations) sent from `pages/[userID]/index.js`.
    - Connects to MongoDB using the `connectToDatabase` helper.
    - Sanitizes incoming data (e.g., converting timestamps to Date objects, calculating durations).
    - Uses MongoDB's `updateOne` with `upsert: true` and `$addToSet` to efficiently add new search/click events to the user's session document in the `UserBrowsingData` collection.

- **`lib/mongodb.js`:**
    - Utility module for managing the MongoDB connection.
    - Implements connection caching to reuse connections across multiple API requests and during development hot-reloads, improving performance.

- **`components/` Directory:**
    - `SearchBar.js`: A reusable component for the search input and button. Used in both the main header and the `EmbeddedBrowser` header.
    - `SearchResults.js`: Renders the list of search results, handling clicks via the `onResultClick` prop.
    - `EmbeddedBrowser.js`: The component that displays the selected website within an `<iframe>`. Includes its own header with a "Back" button (calling `onClose`) and another `SearchBar`.

- **`styles/globals.css` & `tailwind.config.js`:**
    - Configure and apply global styling using Tailwind CSS.

- **`.next/` Directory:**
    - Contains build artifacts generated by Next.js, including compiled code, manifests, and caches.

**Workflow Summary:**

1.  User navigates to `/[userID]`.
2.  `pages/[userID]/index.js` renders, capturing the `userID`.
3.  User enters a query into the main `SearchBar` and submits.
4.  `handleSearch` is called, sending the query to `pages/api/search.js`.
5.  `/api/search.js` fetches results from Google, performs embeddability checks, and returns filtered results.
6.  `pages/[userID]/index.js` receives results and renders them using `SearchResults`.
7.  User clicks a result link.
8.  `handleResultClick` is called, recording the click start time, setting the `iframeUrl`, and showing the `EmbeddedBrowser`.
9.  `EmbeddedBrowser` renders, displaying the selected URL in the iframe.
10. User interacts with the embedded page or uses the `EmbeddedBrowser`'s "Back" button or search bar.
11. If "Back" is clicked, `closeEmbeddedBrowser` calls `finalizeClick` to calculate duration and send click data to `/api/track-data/[userID]`.
12. If a new search is initiated (from either search bar), `handleSearch` runs, closing the browser and starting the search flow again.
13. When the user leaves the page (closes tab/browser, navigates away), `beforeunload` and `visibilitychange` listeners trigger sending any remaining batched tracking data via `sendBeacon` to `/api/track-data/[userID]`.
14. `/api/track-data/[userID]` receives the data and saves it to MongoDB.
