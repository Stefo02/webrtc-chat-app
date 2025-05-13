// src/components/FriendItem.js
import React from 'react';

export default function FriendItem({ friend, isActive, onSelect }) {
  return (
    <li
      className={`friend-item${isActive ? ' active' : ''}`}
      onClick={() => onSelect(friend)}
    >
      <span className="friend-name">{friend.username}</span>
      {friend.status === 'pending' && (
        <span className="friend-status">(Pending)</span>
      )}
      {/* You can add more icons/buttons here, e.g.: */}
      {/* {friend.unreadCount > 0 && <span className="badge">{friend.unreadCount}</span>} */}
    </li>
  );
}