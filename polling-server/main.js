import express from 'express'
import { createSession, createChannel } from "better-sse";
import cors from 'cors';
import pg from 'pg';

const app = express()
const port = process.env.PORT || 3000

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'db',
  user: process.env.PGUSER || 'db',
  password: process.env.PGPASSWORD || 'dbpassword',
});

const DEFAULT_DISPLAY_ID = process.env.DEFAULT_DISPLAY_ID || 'YOUR_DISPLAY_ID';

// 2. IMMEDIATE CONNECTION CHECK
// This runs as soon as you start the server
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL in Docker at:', res.rows[0].now);
  }
});

app.use(cors());
const channel = createChannel();



app.get('/', (req, res) => {
  res.send('Hello World!')
})

// 1. The Listener Endpoint
// Users open this in their browser to receive updates
app.get('/events', async (req, res) => {
    const session = await createSession(req, res);
    channel.register(session);
    console.log('A user connected.');
});

// 2. The Trigger Endpoint
// Example: /send?msg=Hello+World
app.get('/send', (req, res) => {
    const message = req.query.msg || "Default broadcast message";
    
    // Broadcast to everyone registered in the channel
    channel.broadcast({ message, timestamp: new Date() }, "custom-event");
    
    res.send(`Sent: "${message}" to all connected clients.`);
});


app.get('/trigger-refresh', (req, res) => {
  const reason = req.query.reason;
  const objId = req.query.object_id;
  
  console.log(`🔄 Content change detected in Django: ${reason || 'unknown source'}`);

        channel.broadcast({ model: `${reason || 'unknown source'}`, id: `${objId || 'unknown id'}`}, "custom-event");


  res.send('Content change logged');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

