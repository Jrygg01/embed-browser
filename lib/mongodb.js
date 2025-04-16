// lib/mongodb.js
import { MongoClient } from 'mongodb';

// Retrieve MongoDB connection string from environment variables.
const MONGODB_URI = process.env.MONGO_URI;
// Retrieve database name from environment variables, defaulting to 'CustomSearch'.
const MONGODB_DB = process.env.MONGO_DB_NAME || 'CustomSearch';

// Ensure the MongoDB URI is defined.
if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGO_URI environment variable inside .env.local'
  );
}

/**
 * Global variable to cache the MongoDB connection promise and resolved connection object.
 * This prevents creating new connections on every API call during development hot-reloads.
 * @type {{ conn: { client: MongoClient, db: Db } | null, promise: Promise<{ client: MongoClient, db: Db }> | null }}
 */
let cached = global.mongo;

// Initialize the cache if it doesn't exist.
if (!cached) {
  cached = global.mongo = { conn: null, promise: null };
}

/**
 * Establishes a connection to the MongoDB database using the connection string
 * from environment variables. Implements caching to reuse existing connections.
 *
 * @async
 * @function connectToDatabase
 * @returns {Promise<{ client: MongoClient, db: import('mongodb').Db }>} - A promise that resolves to an object containing the MongoClient instance and the Db instance.
 * @throws {Error} - Throws an error if the connection fails.
 */
export async function connectToDatabase() {
  // If a connection is already cached, return it immediately.
  if (cached.conn) {
    console.log('Using cached MongoDB connection.');
    return cached.conn;
  }

  // If no connection promise is currently in progress, create one.
  if (!cached.promise) {
    // MongoDB connection options.
    const opts = {
      // Modern MongoDB Node.js driver options (older ones like useNewUrlParser, useUnifiedTopology are deprecated).
      retryWrites: true, // Automatically retry write operations once upon transient network errors.
      w: 'majority', // Acknowledgment level for write operations.
      // Timeouts to prevent indefinite hangs. Adjust values as needed.
      serverSelectionTimeoutMS: 10000, // How long to wait for server selection before failing.
      connectTimeoutMS: 20000, // How long to wait for the initial connection.
      socketTimeoutMS: 30000, // How long a send or receive on a socket can take before timing out.
      // ssl: true, // Generally inferred from srv URIs, explicitly set if needed for non-srv.
      // tls: true, // Alias for ssl.
      // Use NODE_TLS_REJECT_UNAUTHORIZED=0 env var instead of these if possible for self-signed certs (use cautiously).
      // tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production',
      // tlsAllowInvalidHostnames: process.env.NODE_ENV !== 'production',
      // family: 4 // Force IPv4 if needed, usually not required.
    };

    // WARNING: Bypassing TLS certificate validation. Use only if absolutely necessary
    // for specific environments (like local dev with self-signed certs) and understand the risks.
    // Prefer proper certificate configuration.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // Start the connection attempt and store the promise in the cache.
    cached.promise = MongoClient.connect(MONGODB_URI, opts).then((client) => {
      // Connection successful.
      console.log('Successfully connected to MongoDB Atlas.');
      // Return an object containing the client and the specific database instance.
      return {
        client,
        db: client.db(MONGODB_DB),
      };
    }).catch(error => {
        // Connection failed.
        console.error('MongoDB connection error:', error);
        cached.promise = null; // Reset the promise in the cache so a retry can happen.
        throw error; // Re-throw the error to be handled by the caller.
    });
  }

  // Wait for the connection promise to resolve.
  try {
    // Assign the resolved connection object to the cache.
    cached.conn = await cached.promise;
    console.log('MongoDB connection promise resolved.');
  } catch (e) {
    // If the promise rejected, clear the promise from the cache
    // and re-throw the error.
    cached.promise = null;
    console.error('Failed to resolve MongoDB connection promise.');
    throw e;
  }

  // Return the established connection object.
  return cached.conn;
}