// components/EmbeddedBrowser.js
import React from 'react';

function EmbeddedBrowser({ url, onClose }) {
    return (
        <div className="fixed inset-0 bg-gray-200 z-50 flex flex-col">
            <div className="bg-blue-600 text-white py-3 px-4 flex items-center">
                <button onClick={onClose} className="mr-4 text-xl font-bold">
                    ← Back
                </button>
                <span className="font-bold">Research Search</span>
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