// server.js
require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const socketIO = require('socket.io');
const multer  = require('multer');
const serverOptions = {
  key: fs.readFileSync('./certs/localhost+2-key.pem'),
  cert: fs.readFileSync('./certs/localhost+2.pem'),
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename:  (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage });

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
  try {
    const userA = parseInt(req.params.userA, 10);
    const userB = parseInt(req.params.userB, 10);

    const sql = `
      SELECT
        m.id,
        m.sender_id,
        m.receiver_id,
        m.content,
        m.created_at,
        m.edited,
        m.edited_at,
        a.file_name,
        a.file_type,
        a.file_url
      FROM messages AS m
      LEFT JOIN attachments AS a
        ON a.message_id = m.id
      WHERE
        (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at;
    `;

    const result = await pool.query(sql, [userA, userB]);
    const messages = result.rows.map(r => ({
      id:          r.id,
      sender_id:   r.sender_id,
      receiver_id: r.receiver_id,
      created_at:  r.created_at,
      edited:      r.edited,
      edited_at:   r.edited_at,
      type:        r.file_url ? 'file' : 'text',
      content:     r.content,     // will be '' for file-only messages
      fileName:    r.file_name,   // null for text
      fileType:    r.file_type,   // null for text
      fileUrl:     r.file_url     // null for text
    }));

    res.json(messages);
  } catch (err) {
    console.error('Error loading chat history:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a message
app.post('/api/messages', async (req, res) => {
  try {
    const { senderId, receiverId, content } = req.body;

    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { rows } = await pool.query(`
      INSERT INTO messages(sender_id, receiver_id, content)
      VALUES ($1,$2,$3)
      RETURNING id, created_at
    `, [senderId, receiverId, content]);

    const payload = {
      id: rows[0].id,
      senderId,
      receiverId,
      content,
      created_at: rows[0].created_at
    };

    io.to(`user_${receiverId}`).emit('new-message', payload);
    io.to(`user_${senderId}`).emit('new-message', payload);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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

// serve the uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// POST /api/upload-and-send
app.post('/api/upload-and-send', upload.single('file'), async (req, res) => {
  const { senderId, receiverId } = req.body;               // pass these in your form or JSON
  const { filename, originalname, mimetype } = req.file;
  const fileUrl = `/uploads/${filename}`;

  // 1) Insert the message row (content left blank for attachments-only)
  const msgResult = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, content)
     VALUES ($1,$2,'')
     RETURNING id, created_at`,
    [senderId, receiverId]
  );
  const messageId = msgResult.rows[0].id;
  const createdAt = msgResult.rows[0].created_at;

  // 2) Insert the attachment row
  await pool.query(
    `INSERT INTO attachments (message_id, file_name, file_type, file_url)
     VALUES ($1,$2,$3,$4)`,
    [messageId, originalname, mimetype, fileUrl]
  );

  // 3) Emit over socket.io to each party separately
const payload = {
  id:         messageId,
  senderId,
  receiverId,
  created_at: createdAt,
  type:       'file',
  fileName:   originalname,
  fileType:   mimetype,
  fileUrl
};

// Emit to the receiver
io.to(`user_${receiverId}`).emit('new-message', payload);

// Emit to the sender
io.to(`user_${senderId}`).emit('new-message', payload);

  // 4) Respond to the HTTP client
  res.json({
    message: {
      id:          messageId,
      sender_id:   senderId,
      receiver_id: receiverId,
      created_at:  createdAt,
      type:        'file',
      fileName:    originalname,
      fileType:    mimetype,
      fileUrl
    }
  });
});

// Delete a message
app.delete('/api/messages/:id', async (req, res) => {
  const messageId = req.params.id;

  // ✅ Validate message ID
  if (!messageId || isNaN(parseInt(messageId))) {
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  const { rowCount } = await pool.query(
    `DELETE FROM messages WHERE id = $1`,
    [messageId]
  );

  if (rowCount === 0) {
    return res.status(404).json({ error: 'Message not found' });
  }

  io.emit('message-deleted', { id: parseInt(messageId, 10) });

  res.sendStatus(204);
});

// Edit a message
app.put('/api/messages/:id', async (req, res) => {
  const messageId = req.params.id;
  const { newContent } = req.body;

  // ✅ Validate message ID
  if (!messageId || isNaN(parseInt(messageId))) {
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  const result = await pool.query(
    `UPDATE messages
     SET content = $1, edited = TRUE, edited_at = NOW()
     WHERE id = $2
     RETURNING id, content, edited, edited_at`,
    [newContent, messageId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Message not found' });
  }

  io.emit('message-updated', {
    id: result.rows[0].id,
    content: result.rows[0].content,
    edited: result.rows[0].edited,
    edited_at: result.rows[0].edited_at
  });

  res.json(result.rows[0]);
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
