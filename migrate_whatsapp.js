const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { BufferJSON } = require('@whiskeysockets/baileys');

const uri = process.argv[2] || process.env.MONGODB_URI;

if (!uri) {
    console.error("Please provide your MongoDB URI as an argument.");
    console.error('Example: node migrate_whatsapp.js "mongodb+srv://..."');
    process.exit(1);
}

const authDir = path.join(__dirname, 'auth_info_baileys');

if (!fs.existsSync(authDir)) {
    console.error("No local auth_info_baileys folder found.");
    process.exit(1);
}

async function migrate() {
    console.log("Connecting to MongoDB...");
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('report_generator');
        const collection = db.collection('whatsapp_auth');
        
        console.log("Connected! Migrating local WhatsApp keys to MongoDB...");
        
        const files = fs.readdirSync(authDir);
        let count = 0;
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const id = file.replace('.json', '');
            const rawData = fs.readFileSync(path.join(authDir, file), 'utf-8');
            let data;
            try {
                data = JSON.parse(rawData, BufferJSON.reviver);
            } catch(e) {
                data = JSON.parse(rawData);
            }
            
            await collection.replaceOne(
                { _id: id },
                { _id: id, data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) },
                { upsert: true }
            );
            count++;
        }
        
        console.log(`✅ Successfully migrated ${count} WhatsApp keys to MongoDB!`);
    } catch (e) {
        console.error("Migration failed:", e.message);
    } finally {
        await client.close();
    }
}

migrate().catch(console.error);
