// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
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
  const reason = req.query.reason || 'unknown source';
  const objId = req.query.object_id || 'unknown id';

  const payload = { model: reason, id: objId };

  if (req.query.slideshow_id) {
    payload.slideshowId = req.query.slideshow_id;
  }

  if (req.query.group_ids) {
    payload.groupIds = req.query.group_ids
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }

  channel.broadcast(payload, "custom-event");
  res.send('Content change logged');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

