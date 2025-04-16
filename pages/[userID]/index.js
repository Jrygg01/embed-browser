// pages/[userID]/index.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head'; // For setting page title

import SearchResults from '../../components/SearchResults';
import EmbeddedBrowser from '../../components/EmbeddedBrowser'; // Component for the iframe view
import SearchBar from '../../components/SearchBar'; // Reusable search bar component

/**
 * The main page component for a user-specific search interface.
 * Handles search input, displays results, allows browsing results in an embedded iframe,
 * and tracks user interactions (searches, clicks, duration).
 */
function UserSearchPage() {
    const router = useRouter();
    // Get the dynamic userID from the URL path parameter (e.g., /user123 -> userID = 'user123').
    const { userID } = router.query;

    // --- State Variables ---
    // Stores the search results received from the API. Null initially, array afterwards.
    const [searchResults, setSearchResults] = useState(null);
    // Indicates if a search request is currently in progress.
    const [loading, setLoading] = useState(false);
    // Stores the most recent search query submitted by the user. Used for display and tracking.
    const [currentQuery, setCurrentQuery] = useState('');
    // Controls the visibility of the EmbeddedBrowser component.
    const [isBrowsing, setIsBrowsing] = useState(false);
    // Stores the URL to be loaded into the iframe when isBrowsing is true.
    const [iframeUrl, setIframeUrl] = useState('');
    // Tracks whether the component has successfully initialized (router ready, userID available).
    const [isInitialized, setIsInitialized] = useState(false);

    // --- Refs ---
    // Stores temporary data about the currently clicked result ({ url, startTime }).
    const currentClickData = useRef(null);
    // Accumulates tracking data (searches, clicks) locally before sending to the API.
    const trackingDataRef = useRef({ searches: [], clicks: [] });

    /**
     * Creates a debounced version of a function.
     * Delays invoking the function until after `delay` milliseconds have elapsed
     * since the last time the debounced function was invoked.
     * @param {Function} func - The function to debounce.
     * @param {number} delay - The number of milliseconds to delay.
     * @returns {Function} - The debounced function.
     */
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    // --- Tracking Logic ---

    /**
     * Sends accumulated tracking data (searches, clicks) to the backend API.
     * Uses `fetch` with `keepalive` for better reliability, especially during page unload.
     * Wrapped in useCallback to memoize the function based on userID.
     * @param {object} dataToSend - The tracking data object to send (e.g., { searches: [...], clicks: [...] }).
     * @returns {Promise<boolean>} - True if the data was sent successfully, false otherwise.
     */
    const sendTrackingData = useCallback(async (dataToSend) => {
        if (!userID || userID.trim() === "") {
            console.warn("Cannot send tracking data: userID not available yet.");
            return false;
        }

        const endpoint = `/api/track-data/${userID}`;
        console.log('Attempting to send tracking data to:', endpoint, dataToSend);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(dataToSend),
                keepalive: true,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
            }
            console.log('Tracking data sent successfully.');
            return true;
        } catch (error) {
            console.error('Error sending tracking data:', error);
            return false;
        }
    }, [userID]);

    /**
     * Finalizes tracking for a click event when the user closes the embedded browser
     * or navigates away. Calculates duration and sends the click data.
     * Wrapped in useCallback to memoize based on dependencies.
     */
    const finalizeClick = useCallback(() => {
        if (currentClickData.current) {
            const endTime = new Date();
            const startTime = new Date(currentClickData.current.startTime);
            const durationSeconds = Number(((endTime - startTime) / 1000).toFixed(2));

            const clickEntry = {
                url: currentClickData.current.url,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                duration: durationSeconds,
                searchQuery: currentQuery
            };

            console.log("Finalizing click:", clickEntry);
            trackingDataRef.current.clicks.push(clickEntry);
            sendTrackingData({ clicks: [clickEntry] });

            currentClickData.current = null;
        }
    }, [sendTrackingData, currentQuery]);

    // --- Search and Navigation ---

    /**
     * Handles the submission of a new search query.
     * Closes the browser, updates state, records the search event, calls the search API,
     * and updates the search results.
     * Wrapped in useCallback to memoize based on dependencies.
     * @param {string} query - The search query entered by the user.
     */
    const handleSearch = useCallback(async (query) => {
        setIsBrowsing(false);
        setIframeUrl('');

        setLoading(true);
        setSearchResults(null);
        setCurrentQuery(query);

        console.log(`Performing search for: "${query}"`);
        const searchEntry = { query, timestamp: new Date().toISOString() };
        trackingDataRef.current.searches.push(searchEntry);
        await sendTrackingData({ searches: [searchEntry] });

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, filterEmbeddable: true }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown API error" }));
                throw new Error(`Search API error! status: ${response.status}, details: ${errorData.details || errorData.error}`);
            }

            const data = await response.json();
            setSearchResults(data.items || []);
        } catch (error) {
            console.error("Search error:", error);
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    }, [sendTrackingData]);

    /**
     * Handles clicking on a search result link.
     * Records the start time and URL for click tracking, sets the iframe URL,
     * and opens the embedded browser view.
     * Wrapped in useCallback for memoization (though dependencies are empty here).
     * @param {string} url - The URL of the clicked search result.
     */
    const handleResultClick = useCallback((url) => {
        console.log("Result clicked:", url);
        currentClickData.current = { url, startTime: new Date().toISOString() };
        setIframeUrl(url);
        setIsBrowsing(true);
    }, []);

    /**
     * Handles closing the embedded browser view.
     * Finalizes the click tracking for the viewed page and hides the browser component.
     * Wrapped in useCallback to memoize based on dependencies.
     */
    const closeEmbeddedBrowser = useCallback(() => {
        finalizeClick();
        setIsBrowsing(false);
        setIframeUrl('');
    }, [finalizeClick]);

    // --- Effects ---

    /**
     * Effect to handle sending remaining tracking data when the page is about to unload
     * or becomes hidden (e.g., user switches tabs, closes browser).
     * Uses `sendBeacon` if available for better reliability on unload.
     */
    useEffect(() => {
        const handleBeforeUnload = (event) => {
            console.log("beforeunload triggered");
            if (currentClickData.current) {
                const endTime = new Date();
                const startTime = new Date(currentClickData.current.startTime);
                const durationSeconds = Number(((endTime - startTime) / 1000).toFixed(2));
                const clickEntry = {
                    url: currentClickData.current.url,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    duration: durationSeconds,
                    searchQuery: currentQuery
                };
                trackingDataRef.current.clicks.push(clickEntry);
                currentClickData.current = null;
            }

            if ((trackingDataRef.current.searches.length > 0 || trackingDataRef.current.clicks.length > 0) && userID) {
                const dataToSend = {
                    sessionId: userID,
                    searches: trackingDataRef.current.searches,
                    clicks: trackingDataRef.current.clicks
                };
                const endpoint = `/api/track-data/${userID}`;
                const blob = new Blob([JSON.stringify(dataToSend)], { type: 'application/json' });

                if (navigator.sendBeacon) {
                    const success = navigator.sendBeacon(endpoint, blob);
                    console.log(`sendBeacon attempt on unload: ${success ? 'Success' : 'Failure'}`);
                    if (success) {
                        trackingDataRef.current = { searches: [], clicks: [] };
                    }
                } else {
                    fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(dataToSend),
                        keepalive: true,
                    }).catch(err => console.error("Error in fallback fetch on unload:", err));
                }
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                console.log("Page hidden");
                handleBeforeUnload(null);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [userID, currentQuery, finalizeClick]);

    /**
     * Effect to ensure component initialization happens only *after* the Next.js router is ready
     * and the dynamic `userID` parameter is available.
     */
    useEffect(() => {
        if (!router.isReady) {
            console.log("Router not ready (initial check).");
            return;
        }

        if (!userID) {
            console.error("User ID is missing from the URL (initial check).");
            return;
        }

        console.log("Router is ready and userID is:", userID);
        setIsInitialized(true);

        trackingDataRef.current = { sessionId: userID, searches: [], clicks: [] };

    }, [router.isReady, userID]);

    // --- Render Logic ---

    if (!router.isReady) {
        console.log("Router not ready (rendering).");
        return <div className="text-center p-10">Loading user session...</div>;
    }

    if (!userID) {
        console.error("User ID is missing from the URL (rendering).");
        return <div className="text-center p-10 text-red-600">Error: User ID not found in URL. Please use a valid link.</div>;
    }

    if (!isInitialized) {
        console.log("Component not fully initialized yet.");
        return <div className="text-center p-10">Initializing...</div>;
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Head>
                <title>Embedded Web Browser - {userID}</title>
                <meta name="description" content="Custom search interface for research" />
            </Head>

            <header className="fixed top-0 left-0 right-0 bg-blue-600 text-white shadow-md py-3 px-4 z-50">
                <div className="container flex items-center gap-4">
                    <h1 className="text-xl font-bold flex-shrink-0 hidden sm:block">
                        Web Search
                    </h1>
                    <div className="flex-grow min-w-0">
                        <SearchBar
                            onSearch={handleSearch}
                            containerClass="w-full max-w-2xl mx-auto"
                            inputClass="bg-white text-gray-900 rounded-l-md text-sm sm:text-base"
                            buttonClass="bg-green-500 hover:bg-green-600 rounded-r-md text-sm sm:text-base"
                            value={currentQuery}
                        />
                    </div>
                </div>
            </header>

            <main className="container pt-20 flex-grow">
                <div>
                    {loading && <div className="text-center mt-4 text-gray-700">Loading results...</div>}
                    {!loading && searchResults === null && !currentQuery && (
                        <div className="text-center mt-8 text-gray-500">Enter a query to start searching.</div>
                    )}
                    {!loading && searchResults !== null && (
                        <SearchResults results={searchResults} onResultClick={handleResultClick} />
                    )}
                </div>
            </main>

            <footer className="bg-gray-200 text-center py-3 mt-8">
                <p className="text-gray-600 text-sm">
                    User Session: {userID} | Powered by Google Custom Search
                </p>
            </footer>

            {isBrowsing && iframeUrl && (
                <EmbeddedBrowser
                    url={iframeUrl}
                    onClose={closeEmbeddedBrowser}
                    onSearch={handleSearch}
                    value={currentQuery}
                />
            )}
        </div>
    );
}

export default UserSearchPage;