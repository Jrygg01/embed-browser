// components/SearchBar.js
import React, { useState, useEffect } from 'react';

/**
 * A reusable search bar component.
 *
 * @param {object} props - The component props.
 * @param {function(string): void} props.onSearch - Callback function executed when a search is submitted. Passes the query string.
 * @param {string} [props.containerClass=""] - Optional CSS classes for the form container.
 * @param {string} [props.inputClass=""] - Optional CSS classes for the input element.
 * @param {string} [props.buttonClass=""] - Optional CSS classes for the button element.
 * @param {string} props.value - The current value of the search input (controlled component).
 */
function SearchBar({ onSearch, containerClass = "", inputClass = "", buttonClass = "", value }) {
    // Local state to manage the input field's value. Initialized with the `value` prop.
    const [query, setQuery] = useState(value || '');

    // Effect to synchronize the local `query` state with the `value` prop from the parent.
    // This ensures the input updates if the parent component changes the query externally (e.g., clearing search).
    useEffect(() => {
        setQuery(value || ''); // Update local state when the `value` prop changes.
    }, [value]); // Dependency array ensures this runs only when `value` changes.

    /**
     * Handles the form submission event.
     * Prevents the default form submission, trims the query,
     * and calls the `onSearch` callback if the query is not empty.
     * @param {React.FormEvent<HTMLFormElement>} e - The form submission event object.
     */
    const handleSubmit = (e) => {
        e.preventDefault(); // Prevent default browser form submission (page reload).
        // Check if the trimmed query is not empty before submitting.
        if (query.trim()) {
            onSearch(query); // Call the parent's search handler.
        }
    };

    // Render the search form.
    return (
        <form onSubmit={handleSubmit} className={`flex ${containerClass}`}>
            <input
                type="text"
                value={query} // Bind input value to the local state.
                onChange={(e) => setQuery(e.target.value)} // Update local state on input change.
                placeholder="Enter search query..." // Placeholder text.
                // Apply base classes and any custom classes passed via props.
                className={`flex-grow p-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClass}`}
            />
            <button
                type="submit"
                // Apply base classes and any custom classes passed via props.
                className={`p-2 text-white ${buttonClass}`}
            >
                Search
            </button>
        </form>
    );
}

export default SearchBar;