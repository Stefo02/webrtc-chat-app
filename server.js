// server.js
require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const socketIO = require('socket.io');

// SSL Configuration
const serverOptions = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'server.crt')),
};

// Express app
const app = express();
const server = https.createServer(serverOptions, app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
});

// --- REST API Routes ---

// Get friend list
app.get('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(`
    SELECT u.id, u.username, f.status
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = $1
  `, [userId]);
  res.json(rows);
});

// Add a friend (bidirectional)
app.post('/api/friends', async (req, res) => {
  const { userId, friendUsername } = req.body;
  const userRes = await pool.query(`SELECT id FROM users WHERE username=$1`, [friendUsername]);
  if (userRes.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const friendId = userRes.rows[0].id;
  await pool.query(
    `INSERT INTO friends(user_id, friend_id) VALUES ($1,$2),($2,$1)
     ON CONFLICT DO NOTHING`,
    [userId, friendId]
  );
  res.sendStatus(201);
});

// Fetch chat history
app.get('/api/messages/:userA/:userB', async (req, res) => {
  const { userA, userB } = req.params;
  const { rows } = await pool.query(`
    SELECT sender_id, receiver_id, content, created_at
    FROM messages
    WHERE (sender_id=$1 AND receiver_id=$2)
       OR (sender_id=$2 AND receiver_id=$1)
    ORDER BY created_at
  `, [userA, userB]);
  res.json(rows);
});

// Send a message
app.post('/api/messages', async (req, res) => {
  const { senderId, receiverId, content } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO messages(sender_id, receiver_id, content)
    VALUES ($1,$2,$3)
    RETURNING id, created_at
  `, [senderId, receiverId, content]);

  io.to(`user_${receiverId}`).emit('new-message', {
    senderId, receiverId, content, created_at: rows[0].created_at
  });

  res.status(201).json(rows[0]);
});

// List all users
app.get('/api/users', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username FROM users ORDER BY username`
  );
  res.json(rows);
});

// Create a new user
app.post('/api/users', async (req, res) => {
  const { username, email, passwordHash } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO users (username,email,password_hash)
     VALUES ($1,$2,$3) RETURNING id, username`,
    [username, email, passwordHash]
  );
  res.status(201).json(rows[0]);
});

// --- WebSocket Logic ---

// WebSocket authentication & user room joining
io.use((socket, next) => {
  const { userId } = socket.handshake.query;
  if (!userId) return next(new Error('invalid user'));
  socket.userId = userId;
  socket.join(`user_${userId}`);
  next();
});

const rooms = {}; // For WebRTC-style signaling
const userSockets = {};

io.on('connection', socket => {
  console.log(`User ${socket.userId} connected`);

  // WebRTC room handling
  socket.on('join-room', roomId => {
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);
    socket.join(roomId);
    socket.emit('room-joined', roomId);
    socket.to(roomId).emit('user-joined', socket.id);

    const others = rooms[roomId].filter(id => id !== socket.id);
    if (others.length > 0) {
      socket.emit('existing-users', others);
    }
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', {
      from: socket.userId,
      signal
    });
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
    
    for (const roomId in rooms) {
      const index = rooms[roomId].indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].splice(index, 1);
        socket.to(roomId).emit('user-left', socket.id);
        if (rooms[roomId].length === 0) delete rooms[roomId];
      }
    }
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on https://localhost:${PORT}`);
});
