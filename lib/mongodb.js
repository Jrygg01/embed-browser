// lib/mongodb.js
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGO_URI;
const MONGODB_DB = process.env.MONGO_DB_NAME || 'CustomSearch'; // Or extract from URI if preferred

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGO_URI environment variable inside .env.local'
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongo;

if (!cached) {
  cached = global.mongo = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      // Removed deprecated options, adjust if specific settings are needed
      // ssl: true, // Generally inferred from srv URIs
      // tls: true,
      // tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production', // Be careful with this in prod
      // tlsAllowInvalidHostnames: process.env.NODE_ENV !== 'production', // Be careful with this in prod
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 30000,
      // family: 4 // Usually not needed unless specific network issues
    };

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Keep if needed for specific certificate issues, but use with caution

    cached.promise = MongoClient.connect(MONGODB_URI, opts).then((client) => {
      console.log('Connected to MongoDB Atlas');
      return {
        client,
        db: client.db(MONGODB_DB),
      };
    }).catch(error => {
        console.error('MongoDB connection error:', error);
        cached.promise = null; // Reset promise on error
        throw error; // Re-throw error after logging
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // Ensure promise is cleared on error
    throw e;
  }
  return cached.conn;
}