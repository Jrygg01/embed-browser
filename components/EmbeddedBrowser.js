// components/EmbeddedBrowser.js
import React from 'react';
import SearchBar from './SearchBar'; // Import the reusable SearchBar

/**
 * A component that displays a website within an iframe, simulating an embedded browser view.
 * It includes a header with a back button and a search bar.
 *
 * @param {object} props - The component props.
 * @param {string} props.url - The URL of the website to display in the iframe.
 * @param {function(): void} props.onClose - Callback function executed when the 'Back' button is clicked.
 * @param {function(string): void} props.onSearch - Callback function passed to the internal SearchBar for initiating a new search from within the browser view.
 * @param {string} props.value - The current search query value to display in the internal SearchBar.
 */
function EmbeddedBrowser({ url, onClose, onSearch, value }) {
    return (
        // Fixed position container to overlay the entire screen.
        <div className="fixed inset-0 bg-gray-200 z-50 flex flex-col">
            {/* Header section */}
            <div className="bg-blue-600 text-white py-3 px-4 flex items-center justify-between">
                {/* Back button */}
                <button onClick={onClose} className="mr-4 text-xl font-bold bg-red-500 hover:bg-red-600 px-3 py-1 rounded">
                    ← Back
                </button>
                {/* Title */}
                <span className="font-bold">Web Browser</span>
                {/* Search bar within the browser header */}
                <div className="flex-grow max-w-2xl mx-auto">
                    <SearchBar
                        onSearch={onSearch} // Use the passed onSearch handler
                        containerClass="w-full"
                        inputClass="bg-white text-gray-900 rounded-l-md text-sm sm:text-base"
                        buttonClass="bg-green-500 hover:bg-green-600 rounded-r-md text-sm sm:text-base"
                        value={value} // Pass the current query value
                    />
                </div>
                {/* Empty div to help balance the flex layout if needed */}
                <div></div>
            </div>
            {/* Iframe to display the external website */}
            <iframe
                src={url} // The URL to load.
                title="Embedded Browser" // Accessibility title for the iframe.
                className="flex-grow w-full border-0" // Styling to make it fill the remaining space.
                // Consider adding sandbox attributes for security if needed:
                // sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
        </div>
    );
}

export default EmbeddedBrowser;