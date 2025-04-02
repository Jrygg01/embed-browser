// components/SearchBar.js
import React, { useState, useEffect } from 'react';

function SearchBar({ onSearch, containerClass = "", inputClass = "", buttonClass = "", value }) {
    const [query, setQuery] = useState(value || '');

    useEffect(() => {
        setQuery(value || ''); // Update local state when value prop changes
    }, [value]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query);
        }
    };

    return (
        <form onSubmit={handleSubmit} className={`flex ${containerClass}`}>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter search query..."
                className={`flex-grow p-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClass}`}
            />
            <button
                type="submit"
                className={`p-2 text-white ${buttonClass}`}
            >
                Search
            </button>
        </form>
    );
}

export default SearchBar;