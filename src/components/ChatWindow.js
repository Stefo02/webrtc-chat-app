import React, { useState, useEffect, useRef } from 'react';
import { getChatHistory, sendMessage } from '../services/api';
import io from 'socket.io-client';
import CallButton from './CallButton';
import useWebRTC from '../hooks/useWebRTC';

export default function ChatWindow({ myUserId, selectedFriend }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerSocketIds, setPeerSocketIds] = useState([]);
  const socketRef = useRef();
  const audioRef = useRef();

  // Initialize WebRTC with a callback for remote stream
  const { startCall, endCall, isCalling } = useWebRTC(myUserId, (remoteStream) => {
    console.log('[ChatWindow] got remoteStream');
  if (audioRef.current) {
    audioRef.current.srcObject = remoteStream;
    audioRef.current.play();
  }
});

  // 1. Fetch chat history
  useEffect(() => {
    if (!myUserId || !selectedFriend) return;
    async function loadHistory() {
      try {
        const history = await getChatHistory(myUserId, selectedFriend.id);
        setMessages(history);
      } catch (err) {
        console.error('Load history failed:', err);
      }
    }
    loadHistory();
  }, [myUserId, selectedFriend]);

  // 2. WebSocket setup for real-time messaging
  useEffect(() => {
    if (!myUserId) return;
    socketRef.current = io(window.location.origin, {
      query: { userId: myUserId },
    });

    socketRef.current.on('new-message', msg => {
      const { senderId, receiverId } = msg;
      if (
        (senderId === selectedFriend?.id && receiverId === myUserId) ||
        (senderId === myUserId && receiverId === selectedFriend?.id)
      ) {
        setMessages(prev => [...prev, msg]);
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [myUserId, selectedFriend]);

  // 3. Sending a message
  const handleSend = async () => {
    if (!input.trim() || !selectedFriend) return;
    const content = input.trim();
    setInput('');
    try {
      const saved = await sendMessage(myUserId, selectedFriend.id, content);
      setMessages(prev => [
        ...prev,
        {
          sender_id: myUserId,
          receiver_id: selectedFriend.id,
          content,
          created_at: saved.created_at,
        },
      ]);
    } catch (err) {
      console.error('Send failed:', err);
    }
  };

  if (!selectedFriend) {
    return <div className="chat-window">Select a friend to chat with</div>;
  }

  return (
    <div className="chat-window">
      <h2>Chat with {selectedFriend.username}</h2>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.sender_id === myUserId ? 'message mine' : 'message theirs'}
          >
            {msg.content}
            <div className="ts">
              {new Date(msg.created_at).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-controls">
        <input
          type="text"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend}>Send</button>

        {/* WebRTC Call Button */}
        <CallButton
          isCalling={isCalling}
          onCall={() => startCall(selectedFriend.id)}
          onHangUp={endCall}
        />
      </div>

      {/* Hidden audio element to play remote audio */}
      <audio ref={audioRef} autoPlay playsInline/>
    </div>
  );
}