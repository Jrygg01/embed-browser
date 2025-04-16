// pages/api/search.js

/**
 * Performs a basic, preliminary check to see if a URL might be embeddable
 * by checking its domain against a known list of sites that typically block embedding.
 * This is NOT a definitive check and is primarily used for a quick initial filter.
 * A more reliable check is done using the `isDisplayable` function via HEAD requests.
 *
 * @param {string} url - The URL string to check.
 * @returns {boolean} - Returns `true` if the URL's domain is NOT in the known non-embeddable list, `false` otherwise or if the URL is invalid.
 */
const isEmbeddable = (url) => {
  // List of domains (or parts of domains) known to frequently block iframe embedding.
  const nonEmbeddableDomains = [
    'facebook.com', 'twitter.com', 'instagram.com',
    'linkedin.com', 'youtube.com', 'netflix.com',
    'amazon.com', 'ebay.com', 'reddit.com'
    // Add more specific domains known to block iframing
  ];
  try {
    // Parse the URL to extract the hostname.
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase(); // Use lowercase for case-insensitive comparison.
    // Check if the domain includes any of the blacklisted site strings.
    if (nonEmbeddableDomains.some(site => domain.includes(site))) {
      // If found in the blacklist, assume it's not embeddable.
      return false;
    }
    // Consider allowing subdomains of generally embeddable sites (e.g., blog.company.com)
    // If not in the blacklist, it *might* be embeddable. Further checks needed.
    // Basic check - real check needs HEAD request
    return true;
  } catch (e) {
    // Handle cases where the URL is invalid and cannot be parsed.
    console.error("Error parsing URL for embeddable check:", url, e);
    return false; // Assume not embeddable if URL is invalid.
  }
};

/**
 * Checks if a website is likely displayable within an iframe by sending a HEAD request
 * and inspecting the 'X-Frame-Options' and 'Content-Security-Policy' headers.
 * This is more reliable than the basic domain check but still not foolproof,
 * as server configurations can vary or change.
 *
 * @param {string} url - The URL of the website to check.
 * @returns {Promise<boolean>} - A promise that resolves to `true` if the site seems embeddable based on headers, `false` otherwise (due to headers, network errors, or timeouts).
 */
async function isDisplayable(url) {
  try {
    // Use AbortController to implement a timeout for the fetch request.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // Set timeout (e.g., 3.5 seconds).

    // Send a HEAD request. This is lighter than GET as it only fetches headers.
    const headResponse = await fetch(url, {
        method: 'HEAD', // Use HEAD method to get only headers.
        signal: controller.signal, // Link the AbortController signal.
        redirect: 'follow', // Automatically follow redirects to get headers from the final destination.
        headers: {
            // Set a custom User-Agent, as some servers block default fetch/Node.js UAs.
            'User-Agent': 'ResearchSearchBot/1.0'
        }
    });
    // Clear the timeout timer if the fetch completes successfully before the timeout.
    clearTimeout(timeoutId);

    // Check the HTTP status code.
    if (!headResponse.ok) {
        // Allow common redirects (3xx statuses are handled by 'follow').
        // Block client errors (4xx) and server errors (5xx).
        if (headResponse.status >= 400) {
             console.log(`isDisplayable check failed for ${url}: Status ${headResponse.status}`);
             return false; // Not displayable if status indicates an error.
        }
        // Note: If status is < 400 but not ok (e.g., 3xx without redirect: 'manual'),
        // it might proceed, but header checks below are still crucial.
    }

    // Check the 'X-Frame-Options' header.
    const xFrameOpts = headResponse.headers.get('x-frame-options');
    if (xFrameOpts) {
      const value = xFrameOpts.toUpperCase(); // Case-insensitive check.
      // 'DENY' or 'SAMEORIGIN' explicitly prevent embedding in cross-origin contexts.
      if (value === 'DENY' || value === 'SAMEORIGIN') {
        console.log(`isDisplayable check failed for ${url}: X-Frame-Options: ${value}`);
        return false;
      }
      // Note: 'ALLOW-FROM uri' is obsolete and generally ignored by modern browsers.
    }

    // Check the 'Content-Security-Policy' (CSP) header for 'frame-ancestors'.
    const csp = headResponse.headers.get('content-security-policy');
    // The 'frame-ancestors' directive is the modern standard for controlling embedding.
    // This regex checks for 'frame-ancestors' followed by 'none' or 'self', which block cross-origin embedding.
    // It handles variations in whitespace.
    if (csp && /frame-ancestors\s+('none'|'self')/i.test(csp)) {
       console.log(`isDisplayable check failed for ${url}: CSP frame-ancestors block`);
       return false;
    }
    // Add more complex CSP checks here if needed (e.g., parsing multiple directives).

    // If no blocking headers are found, assume the site *might* be displayable.
    // console.log(`isDisplayable check OK for ${url}`);
    return true;
  } catch (e) {
    // Handle network errors, timeouts, or other exceptions during the fetch.
    // Assume the site is not displayable if an error occurs.
    if (e.name === 'AbortError') {
        // Specifically log timeouts caused by the AbortController.
        console.log(`isDisplayable check timed out for ${url}`);
    } else {
        // Log other types of errors (e.g., DNS resolution failure, network connection issues).
        console.error(`isDisplayable check error for ${url}:`, e.name, e.message);
    }
    return false; // Assume not displayable on any error.
  }
}

/**
 * API route handler for performing searches using the Google Custom Search API.
 * It fetches results, optionally filters them for embeddability, and returns
 * a combined list of likely embeddable and non-embeddable results.
 *
 * @param {import('next').NextApiRequest} req - The incoming API request object. Expects a POST request with a 'query' in the body.
 * @param {import('next').NextApiResponse} res - The outgoing API response object.
 */
export default async function handler(req, res) {
  // Ensure the request method is POST.
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // Extract the search query from the request body.
    const { query } = req.body;

    // Validate that the query parameter exists.
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Retrieve Google API credentials from environment variables.
    const API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const SEARCH_ENGINE_ID = process.env.GOOGLE_CUSTOM_SEARCH_CX_ID;

    // Validate that API credentials are configured.
    if (!API_KEY || !SEARCH_ENGINE_ID) {
      console.error("Missing Google API Key or Search Engine ID in server environment variables.");
      return res.status(500).json({ error: "Server configuration error: API credentials missing." });
    }

    console.log(`API: Searching for: "${query}"`);

    // Initialize variables for fetching results.
    let allItems = []; // Potentially used if all results were needed before filtering. Currently unused.
    let potentialItems = []; // Array to store results fetched from Google API.
    const maxResultsNeeded = 50; // Target number of results to fetch initially (before filtering).
    let start = 1; // Google API uses 1-based indexing for 'start'.
    let fetchCount = 0; // Counter for the number of API calls made.
    const MAX_FETCHES = 5; // Limit the number of fetches to avoid excessive API usage/costs.

    // Loop to fetch results from Google API until enough potential items are gathered or limits are reached.
    while (potentialItems.length < maxResultsNeeded && fetchCount < MAX_FETCHES) {
       fetchCount++;
       // Construct the Google Custom Search API URL.
       const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start}&num=10`; // Fetch 10 results per request.
      // console.log(`Sending request to Google API (fetch #${fetchCount}): ${apiUrl.replace(API_KEY, 'REDACTED')}`);

      // Make the API request.
      const response = await fetch(apiUrl);
      const data = await response.json();

      // Handle API errors (e.g., quota exceeded, invalid request).
      if (!response.ok) {
        console.error("Google API error response:", data);
        // Specifically handle quota errors (403 Forbidden or 429 Too Many Requests).
        if (response.status === 403 || response.status === 429) {
             throw new Error(`Google API Error (${response.status}): ${data.error?.message || 'Quota likely exceeded'}`);
        }
        // For other errors, stop fetching. Consider more nuanced error handling if needed.
        break; // Stop fetching on error.
      }

      // Check if the API returned any items.
      if (!data.items || data.items.length === 0) {
        console.log("No more search results found from Google API.");
        break; // Exit loop if no more results are available.
      }

      // Add the fetched items to the potential results list.
      potentialItems.push(...data.items);

      // Check if Google API indicates a next page exists.
      if (!data.queries?.nextPage?.[0]) {
          break; // No next page information, assume end of results.
      }
      // Update the 'start' index for the next fetch request based on Google's response.
      start = data.queries.nextPage[0].startIndex;
    }

    console.log(`API: Received ${potentialItems.length} potential results from Google.`);

    // --- Embeddability Filtering ---
    // Step 1: Preliminary filter using the basic `isEmbeddable` check (domain blacklist).
    // This quickly removes known non-embeddable sites before making HEAD requests.
    const initiallyFilteredItems = potentialItems.filter(item => item.link && isEmbeddable(item.link));

    // Step 2: Perform more reliable displayable check using HEAD requests via `isDisplayable`.
    // Use Promise.allSettled to handle potential errors/timeouts for individual checks gracefully.
    const displayableChecks = await Promise.allSettled(
        // Limit the number of HEAD requests (e.g., to the first 30) to manage performance/load.
        initiallyFilteredItems.slice(0, 30).map(item =>
             // Call isDisplayable and map the result to an object containing the original item and the check result (ok: true/false).
             isDisplayable(item.link).then(ok => ({ item, ok }))
        )
    );

    // Step 3: Collect items that passed the `isDisplayable` check.
    const finalItems = displayableChecks
      // Filter out promises that were rejected or whose check returned false.
      .filter(result => result.status === 'fulfilled' && result.value.ok)
      // Map back to the original item objects.
      .map(result => result.value.item);

    // Step 4: Get some non-displayable items to fill up the results if needed (up to 10 total).
    // Filter the original potential items to find those *not* included in the final (displayable) list.
    let nonDisplayableItems = potentialItems
        .filter(item => !finalItems.includes(item))
        // Take enough non-displayable items to reach a total of 10 results, if possible.
        .slice(0, Math.max(0, 10 - finalItems.length));

    // Step 5: Combine the displayable items and the supplemental non-displayable items.
    const combinedResults = [...finalItems, ...nonDisplayableItems];

    console.log(`API: Returning ${combinedResults.length} search results.`);
    // Send the combined results back to the client.
    res.status(200).json({ items: combinedResults });

  } catch (error) {
    // Catch any unexpected errors during the process.
    console.error("API Search Error:", error);
    res.status(500).json({ error: "Failed to execute search", details: error.message });
  }
}