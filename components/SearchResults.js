// components/SearchResults.js
import React from 'react';

function SearchResults({ results, onResultClick }) {
    if (!results || results.length === 0) {
        return <div className="text-center mt-4 text-gray-600">No results found.</div>;
    }

    return (
        <div className="space-y-4">
            {results.map((result, index) => (
                <div key={result.cacheId || index} className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow">
                    <a
                        href={result.link}
                        onClick={(e) => { e.preventDefault(); onResultClick(result.link); }}
                        className="text-lg font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                        {result.title}
                    </a>
                    <p className="text-gray-700 text-sm mt-1">{result.snippet}</p>
                </div>
            ))}
        </div>
    );
}

export default SearchResults;