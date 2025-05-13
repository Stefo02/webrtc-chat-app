import React, { useState } from 'react';
import Sidebar   from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

export default function Home({ myUserId }) {
  const [selectedFriend, setSelectedFriend] = useState(null);

  return (
    <div className="app-layout">
      <Sidebar
        myUserId={myUserId}
        selectedFriend={selectedFriend}
        setSelectedFriend={setSelectedFriend}
      />
      <ChatWindow
        myUserId={myUserId}
        selectedFriend={selectedFriend}
      />
    </div>
  );
}