import React, { useState, useEffect, useRef } from 'react';
import { getChatHistory, sendMessage } from '../services/api';
import io from 'socket.io-client';
import CallButton from './CallButton';
import useWebRTC from '../hooks/useWebRTC';

export default function ChatWindow({ myUserId, selectedFriend}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerSocketIds, setPeerSocketIds] = useState([]);
  const socketRef = useRef();
  const audioRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  
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

  const socket = io(window.location.origin, {
    query: { userId: myUserId },
  });
  socketRef.current = socket;

  socket.on('connect', () => {
    console.log('[Chat] connected socket.id=', socket.id, 'as userId=', myUserId);
  });

  socket.on('new-message', rawMsg => {
    console.log('[Chat] raw new-message arrived:', rawMsg);

    // normalize both camelCase and snake_case
    const senderId   = parseInt(rawMsg.senderId   ?? rawMsg.sender_id,   10);
    const receiverId = parseInt(rawMsg.receiverId ?? rawMsg.receiver_id, 10);

    console.log(`[Chat] normalized sender=${senderId} receiver=${receiverId}`, 
                'selectedFriend=', selectedFriend?.id);

    // only push if it’s actually in this conversation
    if (
      (senderId === selectedFriend?.id && receiverId === myUserId) ||
      (senderId === myUserId && receiverId === selectedFriend?.id)
    ) {
      const msg = {
        id:         rawMsg.id,
        sender_id:  senderId,
        receiver_id:receiverId,
        created_at: rawMsg.created_at,
        type:       rawMsg.type || 'text',
        content:    rawMsg.content ?? '',
        fileName:   rawMsg.fileName ?? null,
        fileType:   rawMsg.fileType ?? null,
        fileUrl:    rawMsg.fileUrl ?? null,
        edited:     rawMsg.edited ?? false,
      };
      console.log('[Chat] pushing message:', msg);
      setMessages(prev => [...prev, msg]);
    }
  });

  return () => {
    socket.disconnect();
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

  // 4. Handle file upload
const handleFileChange = async e => {
  const file = e.target.files[0];
  if (!file || !selectedFriend) return;
  setUploading(true);

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('senderId', myUserId);
    fd.append('receiverId', selectedFriend.id);

    const resp = await fetch('/api/upload-and-send', {
      method: 'POST',
      body: fd
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Upload failed:', errText);
      setUploading(false);
      return;
    }

    const { message } = await resp.json();


  } catch (err) {
    console.error('Upload error:', err);
  } finally {
    setUploading(false);
  }
};

  if (!selectedFriend) {
    return <div className="chat-window">Select a friend to chat with</div>;
  }

  return (
  <> 
    {preview && (
      <div
        className="preview-overlay"
        onClick={() => setPreview(null)}
      >
        {(() => {
          const fullPreviewUrl = `${window.location.origin}${preview.url}`;
          return preview.type === 'video' ? (
            <video
              src={fullPreviewUrl}
              controls
              autoPlay
              className="preview-media"
            />
          ) : (
            <img
              src={fullPreviewUrl}
              alt="Preview"
              className="preview-media"
            />
          );
        })()}

        <a
          href={`${window.location.origin}${preview.url}`}
          download
          className="preview-download-btn"
          onClick={e => e.stopPropagation()}
        >
          ⬇
        </a>
      </div>
    )}

    <div className="chat-window">
      <h2>Chat with {selectedFriend.username}</h2>

      <div className="chat-messages">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={msg.sender_id === myUserId ? 'message mine' : 'message theirs'}
            onMouseEnter={() => setHoveredMsgId(msg.id)}
            onMouseLeave={() => setHoveredMsgId(null)}
          >
            {msg.type === 'file' ? (
              msg.fileType.startsWith('image/') ? (
                <img
                  src={msg.fileUrl}
                  className="chat-thumb"
                  onClick={() => setPreview({ url: msg.fileUrl, type: 'image' })}
                />
              ) : msg.fileType.startsWith('video/') ? (
                <video
                  src={msg.fileUrl}
                  controls
                  className="chat-video"
                  onClick={() => setPreview({ url: msg.fileUrl, type: 'video' })}
                />
              ) : (
                <a href={msg.fileUrl} download={msg.fileName} className="chat-file-link">
                  📎 {msg.fileName}
                </a>
              )
            ) : (
              <div className="message-text">{msg.content}</div>
            )}

            {/* TIMESTAMP: full date + time */}
            <div className="ts">
              {new Date(msg.created_at).toLocaleDateString()} {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {msg.edited && ' (edited)'}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-controls">
        <label htmlFor="fileUpload" className="upload-btn">＋</label>
        <input
          type="file"
          id="fileUpload"
          accept="*/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          disabled={uploading}
        />
        <input
          type="text"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend}>Send</button>

        <CallButton
          isCalling={isCalling}
          onCall={() => startCall(selectedFriend.id)}
          onHangUp={endCall}
        />
      </div>

      <audio ref={audioRef} autoPlay playsInline />
    </div>
  </>
);

}