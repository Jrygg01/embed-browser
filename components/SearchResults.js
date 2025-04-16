// components/SearchResults.js
import React from 'react';

/**
 * A component to display a list of search results.
 *
 * @param {object} props - The component props.
 * @param {Array<object> | null} props.results - An array of search result items from the API, or null/empty if no results. Each item should have `link`, `title`, `snippet`, and optionally `cacheId`.
 * @param {function(string): void} props.onResultClick - Callback function executed when a result link is clicked. Passes the result's URL.
 */
function SearchResults({ results, onResultClick }) {
    // Handle the case where there are no results or results haven't loaded yet.
    if (!results || results.length === 0) {
        return <div className="text-center mt-4 text-gray-600">No results found.</div>;
    }

    // Render the list of results.
    return (
        <div className="space-y-4"> {/* Add vertical spacing between result items */}
            {/* Map over the results array to render each result item */}
            {results.map((result, index) => (
                // Use result.cacheId if available, otherwise fallback to index as key.
                // Add styling for each result block.
                <div key={result.cacheId || index} className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow">
                    {/* Result Title - Link */}
                    <a
                        href={result.link} // The actual URL of the result.
                        // Prevent default link navigation and call the onResultClick handler instead.
                        onClick={(e) => { e.preventDefault(); onResultClick(result.link); }}
                        // Styling for the link.
                        className="text-lg font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                        {result.title} {/* Display the result title */}
                    </a>
                    {/* Result Snippet */}
                    <p className="text-gray-700 text-sm mt-1">{result.snippet}</p> {/* Display the result snippet */}
                </div>
            ))}
        </div>
    );
}

export default SearchResults;