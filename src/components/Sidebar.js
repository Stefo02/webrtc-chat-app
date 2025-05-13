import React, { useState, useEffect } from 'react';
import { getFriends, addFriend } from '../services/api';
import FriendItem from './FriendItem';

export default function Sidebar({ myUserId, selectedFriend, setSelectedFriend }) {
  const [friends, setFriends] = useState([]);
  const [newFriend, setNewFriend] = useState('');

  // 1. Load friends on mount (and when myUserId changes)
  useEffect(() => {
    if (!myUserId) return;
    async function fetchFriends() {
      try {
        const list = await getFriends(myUserId);
        setFriends(list);
      } catch (err) {
        console.error('Failed loading friends:', err);
      }
    }
    fetchFriends();
  }, [myUserId]);

  // 2. Handle Add Friend
  const handleAdd = async () => {
    if (!newFriend.trim()) return;
    try {
      await addFriend(myUserId, newFriend.trim());
      setNewFriend('');
      // re-load
      const updated = await getFriends(myUserId);
      setFriends(updated);
    } catch (err) {
      console.error('Add friend failed:', err);
    }
  };

  return (
    <div className="sidebar">
      <h2>Friends</h2>
      <div className="add-friend">
        <input
          type="text"
          placeholder="Add friend by username"
          value={newFriend}
          onChange={e => setNewFriend(e.target.value)}
        />
        <button onClick={handleAdd}>Add</button>
      </div>
      <ul>
  {friends.map(f => (
    <FriendItem
      key={f.id}
      friend={f}
      isActive={selectedFriend?.id === f.id}
      onSelect={setSelectedFriend}
    />
  ))}
</ul>
    </div>
  );
}