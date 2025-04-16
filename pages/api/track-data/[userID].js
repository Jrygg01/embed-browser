// pages/api/track-data/[userID].js
import { connectToDatabase } from '../../../lib/mongodb'; // Utility for connecting to the database

/**
 * Handles the processing and saving of tracking data (searches, clicks) for a specific user session.
 * It validates the input, sanitizes data formats (dates, durations), and upserts the data
 * into the MongoDB collection 'UserBrowsingData'.
 *
 * @async
 * @function handleTrackData
 * @param {string} userID - The user session ID extracted from the URL path.
 * @param {import('next').NextApiRequest} req - The incoming API request object. Expects a POST request with tracking data in the body.
 * @param {import('next').NextApiResponse} res - The outgoing API response object.
 */
async function handleTrackData(userID, req, res) {
  // --- Input Validation ---
  // Ensure userID parameter from the URL is present.
  if (!userID) {
    console.error('API Track Error: userID parameter is missing.');
    return res.status(400).json({ error: "User ID is required in the URL path." });
  }

  console.log(`API Track: Received tracking data for userID: ${userID}`);
  let trackingData = req.body; // Get data from the request body.

  // Handle cases where the body might be a stringified JSON (less common with Next.js API routes but good practice).
  if (typeof trackingData === 'string') {
    try {
      trackingData = JSON.parse(trackingData);
    } catch (err) {
      console.error('API Track Error: Error parsing tracking data string:', err);
      return res.status(400).json({ error: "Invalid JSON string in request body" });
    }
  }

  // Validate that trackingData is a non-empty object.
  if (!trackingData || typeof trackingData !== 'object') {
    console.error('API Track Error: Invalid or empty tracking data received:', trackingData);
    return res.status(400).json({ error: "Invalid tracking data received." });
  }

  // Ensure consistency: Use the userID from the URL path as the canonical session ID.
  // Warn if the body contains a different sessionId, but override it anyway.
  if (trackingData.sessionId && trackingData.sessionId !== userID) {
      console.warn(`API Track Warning: Body sessionId (${trackingData.sessionId}) differs from URL userID (${userID}). Using URL userID.`);
  }
  trackingData.sessionId = userID; // Standardize on the URL parameter.

  try {
    // --- Database Interaction ---
    // Connect to the MongoDB database.
    const { db } = await connectToDatabase();
    // Get the collection where user data is stored.
    const collection = db.collection('UserBrowsingData');

    // --- Data Preparation & Sanitization ---
    // Create a copy of the data to modify.
    const dataToSave = { ...trackingData };
    // Add/update timestamps for recording when the data was saved/updated.
    dataToSave.savedAt = new Date(); // Use ISODate for better querying.
    dataToSave.lastUpdated = new Date();

    // Sanitize/Calculate click durations and convert timestamps to ISODate.
    if (!dataToSave.clicks) {
      dataToSave.clicks = []; // Ensure clicks array exists.
    }
    dataToSave.clicks = dataToSave.clicks.map(click => {
        let duration = click.duration || 0; // Default duration to 0.
        // Calculate duration if startTime and endTime are provided.
        if (click.startTime && click.endTime) {
             const start = new Date(click.startTime);
             const end = new Date(click.endTime);
             // Ensure dates are valid before calculating.
             if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                // Calculate duration in seconds, formatted to 2 decimal places.
                duration = parseFloat(((end - start) / 1000).toFixed(2));
             }
        }
        // Return the click object with standardized fields.
        return {
            ...click,
            startTime: click.startTime ? new Date(click.startTime) : null, // Store as ISODate or null.
            endTime: click.endTime ? new Date(click.endTime) : null,     // Store as ISODate or null.
            duration: duration, // Store the calculated or original duration (as float).
        };
    });

    // Sanitize search timestamps, converting them to ISODate.
    if (dataToSave.searches) {
        dataToSave.searches = dataToSave.searches.map(search => ({
            ...search,
            // Convert timestamp string to ISODate, default to now if missing.
            timestamp: search.timestamp ? new Date(search.timestamp) : new Date()
        }));
    } else {
        dataToSave.searches = []; // Ensure searches array exists.
    }


    // --- MongoDB Upsert Operation ---
    // Use `updateOne` with `upsert: true` to either create a new document for the user
    // or update the existing one.
    const result = await collection.updateOne(
      { sessionId: userID }, // Query criteria: Find the document matching the user's session ID.
      {
        // --- Update Operators ---
        $set: { // Update specific fields unconditionally.
            lastUpdated: dataToSave.lastUpdated // Always update the lastUpdated timestamp.
        },
        $addToSet: { // Add elements to arrays only if they don't already exist in the array.
                     // Note: $addToSet performs a simple equality check on the entire object.
                     // If you need more complex merging (e.g., updating clicks based on URL/startTime),
                     // you might need a more complex update strategy or multiple operations.
            searches: { $each: dataToSave.searches }, // Add new search entries.
            clicks: { $each: dataToSave.clicks }      // Add new click entries.
        },
        $setOnInsert: { // Fields to set *only* when a new document is created (i.e., during an upsert).
            sessionId: userID,      // Set the session ID.
            firstSeen: new Date() // Record the time the user's data was first created.
        }
      },
      { upsert: true } // Option to create the document if it doesn't exist.
    );

    // --- Logging and Response ---
    // Log the outcome of the database operation.
    if (result.upsertedCount > 0) {
        console.log(`API Track: New session created for userID: ${userID}`);
    } else if (result.modifiedCount > 0) {
         console.log(`API Track: Session updated for userID: ${userID}`);
    } else {
         // This can happen if $addToSet finds duplicates or if no new data was provided.
         console.log(`API Track: Session data for userID ${userID} received but no changes made (likely duplicate data).`);
    }

    // Send a success response to the client.
    res.status(200).json({ message: "Tracking data processed successfully." });

  } catch (error) {
    // Handle errors during database connection or operation.
    console.error("API Track Error: Error saving tracking data to MongoDB:", error);
    res.status(500).json({ error: "Server error processing tracking data", details: error.message });
  }
}

/**
 * The main API route handler for `/api/track-data/[userID]`.
 * It extracts the `userID` from the dynamic route parameter and calls `handleTrackData`
 * for POST requests. Rejects other HTTP methods.
 *
 * @async
 * @function handler
 * @param {import('next').NextApiRequest} req - The incoming API request object.
 * @param {import('next').NextApiResponse} res - The outgoing API response object.
 */
export default async function handler(req, res) {
  // Extract the dynamic userID parameter from the request query.
  const { userID } = req.query;

  // Only allow POST requests to this endpoint.
  if (req.method === 'POST') {
    // Delegate the actual data handling to the specialized function.
    await handleTrackData(userID, req, res);
  } else {
    // Respond with Method Not Allowed for other HTTP methods.
    res.setHeader('Allow', ['POST']); // Indicate allowed method in the header.
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}