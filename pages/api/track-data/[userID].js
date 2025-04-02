// pages/api/track-data/[userID].js
import { connectToDatabase } from '../../../lib/mongodb';

async function handleTrackData(userID, req, res) {
  if (!userID) {
    console.error('API Track Error: userID parameter is missing.');
    return res.status(400).json({ error: "User ID is required in the URL path." });
  }

  console.log(`API Track: Received tracking data for userID: ${userID}`);
  let trackingData = req.body;

  // Handle cases where body might be stringified JSON (less common with Next.js API routes)
  if (typeof trackingData === 'string') {
    try {
      trackingData = JSON.parse(trackingData);
    } catch (err) {
      console.error('API Track Error: Error parsing tracking data string:', err);
      return res.status(400).json({ error: "Invalid JSON string in request body" });
    }
  }

  // Validate essential data
  if (!trackingData || typeof trackingData !== 'object') {
    console.error('API Track Error: Invalid or empty tracking data received:', trackingData);
    return res.status(400).json({ error: "Invalid tracking data received." });
  }

  // Ensure session ID from body matches URL param if present, otherwise inject URL param
  if (trackingData.sessionId && trackingData.sessionId !== userID) {
      console.warn(`API Track Warning: Body sessionId (${trackingData.sessionId}) differs from URL userID (${userID}). Using URL userID.`);
  }
  trackingData.sessionId = userID; // Use userID from URL as the canonical ID

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('UserBrowsingData');

    // Prepare data for MongoDB
    const dataToSave = { ...trackingData };
    dataToSave.savedAt = new Date(); // Use ISODate for better querying
    dataToSave.lastUpdated = new Date();

    // Sanitize/Calculate click durations
    if (!dataToSave.clicks) {
      dataToSave.clicks = [];
    }
    dataToSave.clicks = dataToSave.clicks.map(click => {
        let duration = click.duration || 0;
        if (click.startTime && click.endTime) {
             const start = new Date(click.startTime);
             const end = new Date(click.endTime);
             // Ensure dates are valid before calculating
             if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                duration = Math.round((end - start) / 1000);
             }
        }
        return {
            ...click,
            startTime: click.startTime ? new Date(click.startTime) : null, // Store as ISODate
            endTime: click.endTime ? new Date(click.endTime) : null, // Store as ISODate
            duration: duration, // Store calculated duration in seconds
        };
    });

    // Sanitize search timestamps
    if (dataToSave.searches) {
        dataToSave.searches = dataToSave.searches.map(search => ({
            ...search,
            timestamp: search.timestamp ? new Date(search.timestamp) : new Date() // Store as ISODate
        }));
    }


    // Use upsert to either create a new document or update an existing one
    const result = await collection.updateOne(
      { sessionId: userID }, // Query by sessionId (which is the userID from URL)
      {
        $set: { // Update specified fields
            lastUpdated: dataToSave.lastUpdated
        },
        $addToSet: { // Add searches/clicks only if they don't exist (simple check)
            searches: { $each: dataToSave.searches || [] },
             // Note: $addToSet checks for exact document match.
             // For clicks, if startTime can be duplicated, consider $push
             // or more complex update logic if merging clicks is needed.
            clicks: { $each: dataToSave.clicks || [] }
        },
        $setOnInsert: { // Fields set only when creating a new document
            sessionId: userID,
            firstSeen: new Date()
        }
      },
      { upsert: true } // Create document if it doesn't exist
    );

    if (result.upsertedCount > 0) {
        console.log(`API Track: New session created for userID: ${userID}`);
    } else if (result.modifiedCount > 0) {
         console.log(`API Track: Session updated for userID: ${userID}`);
    } else {
         console.log(`API Track: Session data for userID ${userID} received but no changes made (likely duplicate data).`);
    }

    res.status(200).json({ message: "Tracking data processed successfully." });

  } catch (error) {
    console.error("API Track Error: Error saving tracking data to MongoDB:", error);
    res.status(500).json({ error: "Server error processing tracking data", details: error.message });
  }
}

export default async function handler(req, res) {
  const { userID } = req.query; // Extract userID from the dynamic route parameter

  if (req.method === 'POST') {
    await handleTrackData(userID, req, res);
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}