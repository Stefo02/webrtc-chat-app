// src/components/CallButton.js
import React from 'react';

export default function CallButton({ isCalling, onCall, onHangUp }) {
  return isCalling ? (
    <button onClick={onHangUp} className="call-button hangup">
      🔴 End Call
    </button>
  ) : (
    <button onClick={onCall} className="call-button">
      📞 Call
    </button>
  );
}