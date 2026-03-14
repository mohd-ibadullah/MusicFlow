import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// compute __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load environment variables from project root
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

async function main() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/music';
    console.log('connecting to', uri);
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('collections:', collections.map(c => c.name));
    for (const { name } of collections) {
      const count = await db.collection(name).countDocuments();
      console.log(`  ${name}: ${count}`);
    }
  } catch (err) {
    console.error('db test error', err.message);
  } finally {
    process.exit();
  }
}

main();