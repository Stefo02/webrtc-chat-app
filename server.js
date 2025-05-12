const express = require('express');
const https = require('https');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

// SSL configuration
const serverOptions = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'server.crt'))
};

// Express app setup
const app = express();
app.use(express.static(path.join(__dirname, 'build')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Create HTTPS server
const server = https.createServer(serverOptions, app);

// Socket.io setup
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Room management
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // Add user to room
    rooms[roomId].push(socket.id);
    
    // Join socket.io room
    socket.join(roomId);
    
    // Notify client they joined
    socket.emit('room-joined', roomId);
    
    console.log(`User ${socket.id} joined room ${roomId}`);
    
    // Notify all users in room about new user
    socket.to(roomId).emit('user-joined', socket.id);
    
    // Send list of existing users to new user
    const otherUsers = rooms[roomId].filter(id => id !== socket.id);
    if (otherUsers.length > 0) {
      socket.emit('existing-users', otherUsers);
    }
  });
  
  // Handle signaling
  socket.on('signal', (data) => {
    console.log(`Signal from ${socket.id} to ${data.to}`);
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms
    for (const roomId in rooms) {
      const index = rooms[roomId].indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].splice(index, 1);
        
        // Notify others in room
        socket.to(roomId).emit('user-left', socket.id);
        
        // Remove empty rooms
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the app at https://192.168.1.6:${PORT}`);
});