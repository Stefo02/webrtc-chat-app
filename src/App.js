  import React, { useState, useEffect, useRef } from 'react';
  import io from 'socket.io-client';;
  import Peer from 'simple-peer/simplepeer.min.js';
  import './App.css';

  function App() {
    const [roomId, setRoomId] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isCallStarted, setIsCallStarted] = useState(false);
    const [peers, setPeers] = useState({});
    const [messages, setMessages] = useState([]);
    const [status, setStatus] = useState('Disconnected');
    const answeredRef = useRef(new Set());

    
    const socketRef = useRef();
    const audioRef = useRef();
    const streamRef = useRef();
    const peersRef = useRef({});
    const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  // { urls: 'turn:turn.myserver.com:3478', username: 'u', credential: 'p' },
];
    
    // Initialize socket connection
    useEffect(() => {
      // Connect to the server
      const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
      const host = window.location.hostname;
      const port = window.location.port === '3000' ? '3001' : window.location.port;
      const socketUrl = `${protocol}${host}:${port}`;
      
      socketRef.current = io(socketUrl);
      
      // Log socket connection
      socketRef.current.on('connect', () => {
        addMessage('Connected to server');
        setStatus('Connected to server');
      });
      
      // Handle socket error
      socketRef.current.on('connect_error', (error) => {
        addMessage(`Connection error: ${error.message}`);
        setStatus(`Connection error`);
        console.error('Socket connection error:', error);
      });
      
      // Handle room joined
      socketRef.current.on('room-joined', (roomId) => {
        addMessage(`Joined room: ${roomId}`);
        setStatus(`Joined room: ${roomId}`);
      });
      
      // Handle new user joined
      socketRef.current.on('user-joined', remoteId => {
    addMessage(`User joined: ${remoteId}`);
    const me = socketRef.current.id;
    // if *we’re* “smaller” we initiate, otherwise wait to answer
    const iAmInitiator = me < remoteId;
    createPeer(remoteId, iAmInitiator);
  });
      
      // Handle existing users
      socketRef.current.on('existing-users', userIds => {
    addMessage(`Existing users: ${userIds.join(', ')}`);
    userIds.forEach(remoteId => {
      // decide who initiates: the one with the lexicographically smaller socket id
      const me = socketRef.current.id;
      const iAmInitiator = me < remoteId;
      createPeer(remoteId, iAmInitiator);
    });
  });
      
      // Handle user left
      socketRef.current.on('user-left', (userId) => {
        addMessage(`User left: ${userId}`);
        
        if (peersRef.current[userId]) {
          peersRef.current[userId].destroy();
          delete peersRef.current[userId];
          
          // Update peers state
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            delete newPeers[userId];
            return newPeers;
          });
        }
      });
      
      // Handle signaling data
      socketRef.current.on('signal', ({ from, signal }) => {
  // 1) If we already have a Peer and it’s connected (or connecting), forward the signal
  if (peersRef.current[from] && !answeredRef.current.has(from)) {
    peersRef.current[from].signal(signal);
    return;
  }

  // 2) If we’ve already answered this caller, ignore any more offers
  if (answeredRef.current.has(from)) {
    console.log(`Ignoring duplicate offer from ${from}`);
    return;
  }

  // 3) First time we see them → treat as an offer
  addMessage(`Incoming call (offer) from ${from}`);
  const peer = createPeer(from, false);
  peer.signal(signal);

  // Mark that we’ve now answered them
  answeredRef.current.add(from);
});
      
      // Clean up
      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
        
        // Close all peer connections
        Object.values(peersRef.current).forEach(peer => {
          if (peer) {
            peer.destroy();
          }
        });
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
    }, []);
    
    const addMessage = (message) => {
      setMessages(prevMessages => [...prevMessages, message]);
    };
    
    const joinRoom = async () => {
      if (!roomId.trim()) {
        alert('Please enter a room ID');
        return;
      }
      
      try {
        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        // Join room
        socketRef.current.emit('join-room', roomId);
        setIsConnected(true);
        setStatus('Joining room...');
      } catch (error) {
        addMessage(`Error accessing microphone: ${error.message}`);
        setStatus(`Error: ${error.message}`);
        console.error('Error accessing microphone:', error);
      }
    };

    // createPeer(remoteId, amInitiator) → returns a Peer instance
const createPeer = (remoteId, initiator) => {
  const peer = new Peer({
    initiator,
    trickle: true,                    // enable trickle ICE
    stream: streamRef.current,
    config: { iceServers: ICE_SERVERS }
  });

  peer.on('signal', signal => {
    socketRef.current.emit('signal', { to: remoteId, signal });
  });

  peer.on('stream', remoteStream => {
    audioRef.current.srcObject = remoteStream;
    setIsCallStarted(true);
    setStatus('Call connected!');
    addMessage(`Connected with ${remoteId}`);
  });

  peer.on('error', err => {
    console.error('Peer error:', err);
    addMessage(`Peer error with ${remoteId}: ${err.message}`);
  });

  peer.on('close', () => {
  addMessage(`Connection closed with ${remoteId}`);
  // clean up peer refs
  delete peersRef.current[remoteId];
  setPeers(p => {
    const next = { ...p };
    delete next[remoteId];
    return next;
  });
  // allow future calls if they re-offer
  answeredRef.current.delete(remoteId);
});

  peer.on('iceStateChange', () => {
    console.log(`ICE state for ${remoteId}:`, peer._pc.iceConnectionState);
    addMessage(`ICE state: ${peer._pc.iceConnectionState}`);
  });

  peersRef.current[remoteId] = peer;
  setPeers(p => ({ ...p, [remoteId]: peer }));
  return peer;
};
    
    const callUser = (userId) => {
      // Create new peer
      const peer = new Peer({ initiator: true, trickle: false, stream: streamRef.current });
  peer.on('signal', data => {
    // send signaling data to remote…
  });
  peer.on('connect', () => {
    // native DataChannel is open!
    peer.send('hey from the browser bundle!');
  });
      
      // Handle peer events
      peer.on('signal', (signal) => {
        socketRef.current.emit('signal', {
          to: userId,
          signal
        });
      });
      
      peer.on('stream', (stream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          addMessage(`Received stream from: ${userId}`);
          setIsCallStarted(true);
          setStatus('Call connected!');
        }
      });
      
      peer.on('close', () => {
        addMessage(`Connection closed with: ${userId}`);
      });
      
      peer.on('error', (error) => {
        addMessage(`Peer error with ${userId}: ${error.message}`);
        console.error('Peer error:', error);
      });
      
      // Store peer reference
      peersRef.current[userId] = peer;
      
      // Update peers state
      setPeers(prevPeers => ({
        ...prevPeers,
        [userId]: peer
      }));
    };
    
    const handleIncomingCall = (userId, incomingSignal) => {
      // Create new peer
      const peer = new Peer({ initiator: false, trickle: false, stream: streamRef.current });
  peer.on('signal', data => {
    // send signaling data to remote…
  });
  peer.on('connect', () => {
    // native DataChannel is open!
    peer.send('hey from the browser bundle!');
  });
      
      // Handle peer events
      peer.on('signal', (signal) => {
        socketRef.current.emit('signal', {
          to: userId,
          signal
        });
      });
      
      peer.on('stream', (stream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          addMessage(`Received stream from: ${userId}`);
          setIsCallStarted(true);
          setStatus('Call connected!');
        }
      });
      
      peer.on('close', () => {
        addMessage(`Connection closed with: ${userId}`);
      });
      
      peer.on('error', (error) => {
        addMessage(`Peer error with ${userId}: ${error.message}`);
        console.error('Peer error:', error);
      });
      
      // Signal the peer
      peer.signal(incomingSignal);
      
      // Store peer reference
      peersRef.current[userId] = peer;
      
      // Update peers state
      setPeers(prevPeers => ({
        ...prevPeers,
        [userId]: peer
      }));
    };
    
    const endCall = () => {
      // Destroy all peer connections
      Object.values(peersRef.current).forEach(peer => {
        if (peer) {
          peer.destroy();
        }
      });
      
      // Reset state
      peersRef.current = {};
      setPeers({});
      
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      cleanUpConnection();
      setIsCallStarted(false);
      setStatus('Call ended, still in room');
      addMessage('Call ended');
    };
    
    const leaveRoom = () => {
  cleanUpConnection();
  setIsConnected(false);
  setStatus('Left room');
  addMessage('Left room');
};
    
    const generateRandomRoomId = () => {
      const id = Math.floor(Math.random() * 1000000).toString();
      setRoomId(id);
    };

    const cleanUpConnection = () => {
  // Close peer connections
  Object.values(peersRef.current).forEach(peer => {
    if (peer) peer.destroy();
  });

  peersRef.current = {};
  setPeers({});
  answeredRef.current = new Set();

  // Stop local stream
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }

  setIsCallStarted(false);
  addMessage('Cleaned up connection');
};
    
    return (
      <div className="app-container">
        <h1>WebRTC Voice Call</h1>
        
        <div className="status-bar">
          <div className="status">Status: {status}</div>
          {socketRef.current && <div className="peer-id">ID: {socketRef.current.id}</div>}
        </div>
        
        <div className="room-controls">
          {!isConnected ? (
            <>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Room ID" 
              />
              <button onClick={generateRandomRoomId}>Random</button>
              <button onClick={joinRoom}>Join Room</button>
            </>
          ) : (
            <>
              <div className="room-id">Room: {roomId}</div>
              <button onClick={leaveRoom}>Leave Room</button>
            </>
          )}
        </div>
        
        <div className="call-controls">
          {isConnected && !isCallStarted && (
            <div className="waiting-message">Waiting for other user to join...</div>
          )}
          {isCallStarted && (
            <button onClick={endCall} className="end-call">End Call</button>
          )}
        </div>
        
        <audio ref={audioRef} autoPlay />
        
        <div className="connection-info">
          <h3>Connected Peers: {Object.keys(peers).length}</h3>
          {Object.keys(peers).length === 0 && isConnected && (
            <p>Share this room ID with someone to start a call: <strong>{roomId}</strong></p>
          )}
        </div>
        
        <div className="log">
          <h3>Connection Log</h3>
          <div className="messages">
            {messages.map((message, index) => (
              <div key={index} className="message">{message}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  export default App;