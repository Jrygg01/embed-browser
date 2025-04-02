// pages/[userID]/index.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head'; // For setting page title

import SearchResults from '../../components/SearchResults';
import EmbeddedBrowser from '../../components/EmbeddedBrowser'; // added
import SearchBar from '../../components/SearchBar'; // added

function UserSearchPage() {
    const router = useRouter();
    const { userID } = router.query; // Get userID from URL path parameter

    const [searchResults, setSearchResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filterEmbeddable, setFilterEmbeddable] = useState(true); // Default to true
    const [currentQuery, setCurrentQuery] = useState(''); // Store the last search query
    const [isBrowsing, setIsBrowsing] = useState(false); // added
    const [iframeUrl, setIframeUrl] = useState('');       // added

    const currentClickData = useRef(null); // Store { url, startTime }
    const trackingDataRef = useRef({ searches: [], clicks: [] }); // Keep track locally

    // Initialize a state variable *after* the router is ready
    const [isInitialized, setIsInitialized] = useState(false);

    // Debounce function
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

    const sendTrackingData = useCallback(async (dataToSend) => {
        if (!userID || userID.trim() === "") { // added extra check
            console.warn("Cannot send tracking data: userID not available yet.");
            return false;
        }

        const endpoint = `/api/track-data/${userID}`;
        console.log('Attempting to send tracking data to:', endpoint, dataToSend);

        try {
             // Use fetch with keepalive as a reliable method
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(dataToSend),
                keepalive: true, // Important for unload events
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
    }, [userID]); // Recreate function if userID changes


    // Function to finalize and record a click duration
    const finalizeClick = useCallback(() => {
        if (currentClickData.current) {
            const endTime = new Date();
            const startTime = new Date(currentClickData.current.startTime);
            const durationSeconds = Number(((endTime - startTime) / 1000).toFixed(2)); // Changed to float with 2 decimals

            const clickEntry = {
                url: currentClickData.current.url,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                duration: durationSeconds,
                searchQuery: currentQuery // Associate click with the query that led to it
            };

            console.log("Finalizing click:", clickEntry);
            trackingDataRef.current.clicks.push(clickEntry);
            // Send immediately or batch later
            sendTrackingData({ clicks: [clickEntry] }); // Send just the latest click

            currentClickData.current = null; // Clear current click
        }
    }, [sendTrackingData, currentQuery]);


    // --- Search and Navigation ---

    const handleSearch = useCallback(async (query) => {
        setIsBrowsing(false); // Close the embedded browser immediately
        setIframeUrl(''); // Clear the iframe URL

        setLoading(true);
        setSearchResults(null);
        setCurrentQuery(query); // Store the query

        console.log(`Performing search for: "${query}"`);
        const searchEntry = { query, timestamp: new Date().toISOString() };
        trackingDataRef.current.searches.push(searchEntry);
        await sendTrackingData({ searches: [searchEntry] }); // Send search event

        try {
            const response = await fetch('/api/search', { // Relative URL to Next.js API route
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, filterEmbeddable }),
            });

            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ error: "Unknown API error" }));
                throw new Error(`Search API error! status: ${response.status}, details: ${errorData.details || errorData.error}`);
            }

            const data = await response.json();
            setSearchResults(data.items || []); // Ensure it's always an array
        } catch (error) {
            console.error("Search error:", error);
            setSearchResults([]); // Set empty array on error
        } finally {
            setLoading(false);
        }
    }, [filterEmbeddable, sendTrackingData]);

    const handleResultClick = useCallback((url) => {
        console.log("Result clicked:", url);
        currentClickData.current = { url, startTime: new Date().toISOString() }; // Record click start time
        setIframeUrl(url);          // set URL for iframe
        setIsBrowsing(true);        // show embedded browser
    }, []);

    const closeEmbeddedBrowser = useCallback(() => {
        finalizeClick(); // Finalize and send click data
        setIsBrowsing(false);
        setIframeUrl('');
    }, [finalizeClick]);

    const handleFilterChange = (event) => {
        setFilterEmbeddable(event.target.checked);
    };

    // --- Effects ---

    // Effect to handle page unload/visibility change for final data send
    useEffect(() => {
         const handleBeforeUnload = (event) => {
            console.log("beforeunload triggered");
            // Finalize any active click before unloading
             if (currentClickData.current) {
                 const endTime = new Date();
                 const startTime = new Date(currentClickData.current.startTime);
                 const durationSeconds = Number(((endTime - startTime) / 1000).toFixed(2)); // Changed to float with 2 decimals
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

             // Send all accumulated data if any exists
             if ((trackingDataRef.current.searches.length > 0 || trackingDataRef.current.clicks.length > 0) && userID) {
                  // Use sendBeacon if available for higher reliability on unload
                 const dataToSend = {
                    sessionId: userID, // Ensure session ID is included
                    searches: trackingDataRef.current.searches,
                    clicks: trackingDataRef.current.clicks
                 };
                 const endpoint = `/api/track-data/${userID}`;
                 const blob = new Blob([JSON.stringify(dataToSend)], { type: 'application/json' });

                 if (navigator.sendBeacon) {
                    const success = navigator.sendBeacon(endpoint, blob);
                    console.log(`sendBeacon attempt on unload: ${success ? 'Success' : 'Failure'}`);
                    if(success) {
                        // Clear local data if beacon likely succeeded
                        trackingDataRef.current = { searches: [], clicks: [] };
                    }
                 } else {
                    // Fallback for browsers without sendBeacon (less reliable)
                     fetch(endpoint, {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify(dataToSend),
                         keepalive: true,
                     }).catch(err => console.error("Error in fallback fetch on unload:", err));
                 }
             }
         };

        // Use visibilitychange for mobile backgrounding etc.
         const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                console.log("Page hidden");
                handleBeforeUnload(null); // Treat as unload event for data sending
            }
         };


        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [userID, currentQuery]); // Include dependencies

    // Effect to initialize only AFTER router is ready and userID exists
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
        setIsInitialized(true);  // Set isInitialized *only* when both conditions are met

        // Any initialization logic that *depends* on userID goes here
        trackingDataRef.current = { sessionId: userID, searches: [], clicks: [] };

    }, [router.isReady, userID]); // Dependencies for this effect


    if (!router.isReady) {
        console.log("Router not ready (rendering).");
        return <div className="text-center p-10">Loading user session...</div>;
    }

    if (!userID) {
        console.error("User ID is missing from the URL (rendering).");
        return <div className="text-center p-10 text-red-600">Error: User ID not found in URL. Please use a valid link.</div>;
    }

    // Conditionally render the main content *only* after initialization
    if (!isInitialized) {
        console.log("Component not fully initialized yet.");
        return <div className="text-center p-10">Initializing...</div>; // Or a spinner
    }

    return (
        <div className="min-h-screen flex flex-col">
             <Head>
                <title>Research Search - {userID}</title>
                <meta name="description" content="Custom search interface for research" />
             </Head>

             <header className="fixed top-0 left-0 right-0 bg-blue-600 text-white shadow-md py-3 px-4 z-50">
                 <div className="container flex items-center gap-4">
                    <h1 className="text-xl font-bold flex-shrink-0 hidden sm:block">
                      Research Search
                    </h1>
                    <div className="flex-grow min-w-0">
                        <SearchBar
                            onSearch={handleSearch}
                            containerClass="w-full max-w-2xl mx-auto"
                            inputClass="bg-white text-gray-900 rounded-l-md text-sm sm:text-base"
                            buttonClass="bg-green-500 hover:bg-green-600 rounded-r-md text-sm sm:text-base"
                            value={currentQuery} // Pass currentQuery as the value
                        />
                    </div>
                 </div>
             </header>

             <main className="container pt-20 flex-grow">
                 <div className="flex items-center justify-center mb-4">
                         <input
                             type="checkbox"
                             id="embeddableFilter"
                             className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                             checked={filterEmbeddable}
                             onChange={handleFilterChange}
                         />
                         <label htmlFor="embeddableFilter" className="ml-2 text-gray-700 text-sm">
                             Attempt to show only embeddable websites
                         </label>
                 </div>
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
                 <EmbeddedBrowser url={iframeUrl} onClose={closeEmbeddedBrowser} onSearch={handleSearch} value={currentQuery} />
             )}
        </div>
    );
}

export default UserSearchPage;