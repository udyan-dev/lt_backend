import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isValidLocation(loc) {
  if (!loc || typeof loc !== 'object') return false;
  if (typeof loc.lat !== 'number' || loc.lat < -90 || loc.lat > 90) return false;
  if (typeof loc.lng !== 'number' || loc.lng < -180 || loc.lng > 180) return false;
  if (typeof loc.timestamp !== 'number' || !isFinite(loc.timestamp)) return false;
  if (loc.accuracy !== undefined && loc.accuracy !== null && typeof loc.accuracy !== 'number') return false;
  return true;
}

async function bulkInsert(locations) {
  const rows = locations.map(({ lat, lng, timestamp, accuracy, device_name }) => ({
    lat,
    lng,
    timestamp,
    accuracy: accuracy ?? null,
    device_name: device_name ?? null,
  }));

  const { error } = await supabase.from('locations').insert(rows);
  if (error) throw new Error(error.message);
  console.log(`[DB] Inserted ${rows.length} location(s)`);
}

const wss = new WebSocketServer({ port: process.env.PORT || 8080, path: '/' });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WS] Client connected: ${ip}`);
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn(`[WS] Invalid JSON from ${ip}`);
      return;
    }

    if (!parsed || !Array.isArray(parsed.locations)) return;

    const valid = parsed.locations.filter(isValidLocation);
    if (valid.length === 0) return;

    console.log(`[WS] Received ${valid.length} valid location(s) from ${ip}`);
    bulkInsert(valid).catch((err) => console.error(`[DB] Insert error: ${err.message}`));
  });

  ws.on('close', () => console.log(`[WS] Client disconnected: ${ip}`));
  ws.on('error', (err) => console.error(`[WS] Socket error from ${ip}: ${err.message}`));
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));
wss.on('error', (err) => console.error(`[WS] Server error: ${err.message}`));

const cleanup = setInterval(async () => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  const { error, count } = await supabase
    .from('locations')
    .delete({ count: 'exact' })
    .lt('timestamp', cutoff);
  if (error) console.error(`[DB] Cleanup error: ${error.message}`);
  else if (count > 0) console.log(`[DB] Cleaned ${count} old record(s)`);
}, 60_000);
