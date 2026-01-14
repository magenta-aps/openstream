import express from 'express'
import { createSession, createChannel } from "better-sse";
import cors from 'cors';

const app = express()
const port = process.env.PORT || 3000

app.use(cors());
const channel = createChannel();

app.get('/events', async (req, res) => {
  const session = await createSession(req, res);
  channel.register(session);
  console.log('A user connected.');
});

app.get('/trigger-refresh', (req, res) => {
  const reason = req.query.reason;
  const objId = req.query.object_id;
  channel.broadcast({
    model: `${reason || 'unknown source'}`, id: `${objId || 'unknown id'}`
  }, "custom-event");
  res.send('Content change logged');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

