// src/App.js
import React, { useState } from 'react';
import Home  from './pages/Home';
import Login from './components/Login';
import './styles/App.css';

function App() {
  const [myUserId, setMyUserId] = useState(null);

  if (!myUserId) {
    return <Login onLogin={setMyUserId} />;
  }

  return <Home myUserId={myUserId} />;
}

export default App;