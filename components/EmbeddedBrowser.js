// components/EmbeddedBrowser.js
import React from 'react';
import SearchBar from './SearchBar';

function EmbeddedBrowser({ url, onClose, onSearch, value }) {
    return (
        <div className="fixed inset-0 bg-gray-200 z-50 flex flex-col">
            <div className="bg-blue-600 text-white py-3 px-4 flex items-center justify-between">
                <button onClick={onClose} className="mr-4 text-xl font-bold">
                    ← Back
                </button>
                <span className="font-bold">Research Search</span>
                <div className="flex-grow max-w-2xl mx-auto">
                    <SearchBar
                        onSearch={onSearch}
                        containerClass="w-full"
                        inputClass="bg-white text-gray-900 rounded-l-md text-sm sm:text-base"
                        buttonClass="bg-green-500 hover:bg-green-600 rounded-r-md text-sm sm:text-base"
                        value={value} // Pass the value prop
                    />
                </div>
                <div></div> {/* Empty div to maintain spacing */}
            </div>
            <iframe 
                src={url} 
                title="Embedded Browser" 
                className="flex-grow w-full border-0"
            />
        </div>
    );
}

export default EmbeddedBrowser;