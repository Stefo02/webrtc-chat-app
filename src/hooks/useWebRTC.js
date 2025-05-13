import { useRef, useState, useEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  // turn servers here if you have them…
];

export default function useWebRTC(myUserId, onRemoteStream) {
  const socketRef = useRef();
  const peersRef  = useRef({});
  const streamRef = useRef();
  const [isCalling, setIsCalling] = useState(false);

  useEffect(() => {
    if (!myUserId) return;
    socketRef.current = io(window.location.origin, {
      query: { userId: myUserId },
    });

    socketRef.current.on('connect', () => {
      console.log('[webrtc] socket connected as', myUserId);
    });

    socketRef.current.on('signal', ({ from, signal }) => {
      console.log('[webrtc] signal received from', from, signal);
      const existingPeer = peersRef.current[from];
      if (existingPeer) {
        existingPeer.signal(signal);
      } else {
        answerCall(from, signal);
      }
    });

    return () => {
      console.log('[webrtc] cleaning up');
      socketRef.current.disconnect();
      Object.values(peersRef.current).forEach(p => p.destroy());
    };
  }, [myUserId]); 

  const createPeer = (targetUserId, initiator) => {
      console.log(`[webrtc] createPeer(${targetUserId}, initiator=${initiator})`);
      const peer = new Peer({
        initiator,
        trickle: true,
        stream: streamRef.current,
        config: { iceServers: ICE_SERVERS },    // ← make sure ICE_SERVERS is defined
      });

    peer.on('signal', signal => {
      console.log('[webrtc] sending signal to', targetUserId, signal);
      socketRef.current.emit('signal', { to: `user_${targetUserId}`, signal });
    });

    peer.on('stream', remoteStream => {
      console.log('[webrtc] remote stream arrived');
      onRemoteStream(remoteStream);
    });

    peer.on('connect', () => {
      console.log('[webrtc] peer connection established');
    });

    peer.on('iceStateChange', () => {
      // you can log peer._pc.iceConnectionState here
    });

    peer.on('close', () => {
      console.log('[webrtc] peer closed', targetUserId);
      delete peersRef.current[targetUserId];
      setIsCalling(false);
    });
    peer.on('error', err => {
      console.error('[webrtc] peer error', err);
      delete peersRef.current[targetUserId];
      setIsCalling(false);
    });

    peersRef.current[targetUserId] = peer;
    return peer;
  };

  const startCall = async (targetUserId) => {
    if (isCalling) return;
    setIsCalling(true);
    console.log('[webrtc] startCall to', targetUserId);
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    createPeer(targetUserId, true);
  };

  const answerCall = async (fromUserId, theirSignal) => {
    if (isCalling) return;
    setIsCalling(true);
    console.log('[webrtc] answerCall from', fromUserId);
    if (!streamRef.current) {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    const peer = createPeer(fromUserId, false);
    peer.signal(theirSignal);
  };

  const endCall = () => {
    console.log('[webrtc] endCall');
    Object.values(peersRef.current).forEach(p => p.destroy());
    peersRef.current = {};
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCalling(false);
  };

  return { startCall, answerCall, endCall, isCalling };
}