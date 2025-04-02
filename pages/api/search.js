// pages/api/search.js

// Helper: Check if a URL is likely embeddable
const isEmbeddable = (url) => {
  const nonEmbeddableDomains = [
    'facebook.com', 'twitter.com', 'instagram.com',
    'linkedin.com', 'youtube.com', 'netflix.com',
    'amazon.com', 'ebay.com', 'reddit.com'
    // Add more specific domains known to block iframing
  ];
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    // Check against specific known blockers
    if (nonEmbeddableDomains.some(site => domain.includes(site))) {
      return false;
    }
    // Consider allowing subdomains of generally embeddable sites (e.g., blog.company.com)
    // Basic check - real check needs HEAD request
    return true;
  } catch (e) {
    console.error("Error parsing URL for embeddable check:", url, e);
    return false;
  }
};

// Helper: Check if a website is displayable via HEAD request (more reliable)
async function isDisplayable(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // Slightly longer timeout

    const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow', // Follow redirects to get final headers
        headers: { 'User-Agent': 'ResearchSearchBot/1.0' } // Some sites block default fetch UA
    });
    clearTimeout(timeoutId);

    if (!headResponse.ok) {
        // Allow common redirects (3xx) but block client/server errors (4xx, 5xx)
        if (headResponse.status >= 400) {
             console.log(`isDisplayable check failed for ${url}: Status ${headResponse.status}`);
             return false;
        }
    }

    const xFrameOpts = headResponse.headers.get('x-frame-options');
    if (xFrameOpts) {
      const value = xFrameOpts.toUpperCase();
      if (value === 'DENY' || value === 'SAMEORIGIN') {
        console.log(`isDisplayable check failed for ${url}: X-Frame-Options: ${value}`);
        return false;
      }
    }

    const csp = headResponse.headers.get('content-security-policy');
    // This check is complex due to variations in CSP syntax
    if (csp && /frame-ancestors\s+('none'|'self')/i.test(csp)) {
       console.log(`isDisplayable check failed for ${url}: CSP frame-ancestors block`);
       return false;
    }
    // Add more CSP checks if needed

    // console.log(`isDisplayable check OK for ${url}`);
    return true;
  } catch (e) {
    // Network errors, timeouts, etc. Assume not displayable.
    if (e.name === 'AbortError') {
        console.log(`isDisplayable check timed out for ${url}`);
    } else {
        console.error(`isDisplayable check error for ${url}:`, e.name, e.message);
    }
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { query, filterEmbeddable } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const SEARCH_ENGINE_ID = process.env.GOOGLE_CUSTOM_SEARCH_CX_ID;

    if (!API_KEY || !SEARCH_ENGINE_ID) {
      console.error("Missing Google API Key or Search Engine ID in server environment variables.");
      return res.status(500).json({ error: "Server configuration error: API credentials missing." });
    }

    console.log(`API: Searching for: "${query}" with filterEmbeddable=${filterEmbeddable}`);
    let allItems = [];
    let potentialItems = [];
    const maxResultsNeeded = filterEmbeddable ? 30 : 10; // Fetch more if filtering
    let start = 1;
    let fetchCount = 0;
    const MAX_FETCHES = filterEmbeddable ? 5 : 1; // Limit API calls

    while (potentialItems.length < maxResultsNeeded && fetchCount < MAX_FETCHES) {
       fetchCount++;
       const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start}&num=10`;
      // console.log(`Sending request to Google API (fetch #${fetchCount}): ${apiUrl.replace(API_KEY, 'REDACTED')}`);

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        console.error("Google API error response:", data);
        // Stop fetching if quota exceeded or other persistent error
        if (response.status === 403 || response.status === 429) {
             throw new Error(`Google API Error (${response.status}): ${data.error?.message || 'Quota likely exceeded'}`);
        }
        // Allow continuing for temporary errors maybe? Or just break.
        break; // Stop fetching on error
      }

      if (!data.items || data.items.length === 0) {
        console.log("No more search results found from Google API.");
        break; // No more results
      }

      potentialItems.push(...data.items);

      // Check if there's a next page indicated by Google API
      if (!data.queries?.nextPage?.[0]) {
          break; // No next page info, stop fetching
      }
      start = data.queries.nextPage[0].startIndex; // Use startIndex for the next request
    }

    console.log(`API: Received ${potentialItems.length} potential results from Google.`);

    // Filter based on preliminary check if requested
    const initiallyFilteredItems = filterEmbeddable
        ? potentialItems.filter(item => item.link && isEmbeddable(item.link))
        : potentialItems;

    // Perform more reliable displayable check using HEAD requests
    const displayableChecks = await Promise.allSettled(
        initiallyFilteredItems.slice(0, 20).map(item => // Limit HEAD requests
             isDisplayable(item.link).then(ok => ({ item, ok }))
        )
    );

    const finalItems = displayableChecks
      .filter(result => result.status === 'fulfilled' && result.value.ok)
      .map(result => result.value.item);


    console.log(`API: Returning ${finalItems.length} displayable search results.`);
    res.status(200).json({ items: finalItems.slice(0, 10) }); // Return top 10 displayable

  } catch (error) {
    console.error("API Search Error:", error);
    res.status(500).json({ error: "Failed to execute search", details: error.message });
  }
}