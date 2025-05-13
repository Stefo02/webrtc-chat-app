// src/components/Login.js
import React, { useState, useEffect } from 'react';
import { getUsers, createUser } from '../services/api';

export default function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [name, setName]   = useState('');

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  const handleSelect = (e) => {
    onLogin(parseInt(e.target.value, 10));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    const newUser = await createUser(name.trim(), `${name}@x.com`, 'dummyHash');
    setName('');
    setUsers(prev => [...prev, newUser]);
  };

  return (
    <div className="login-screen">
      <h2>Select User</h2>
      <select onChange={handleSelect} defaultValue="">
        <option value="" disabled>— pick one —</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>{u.username}</option>
        ))}
      </select>

      <h3>—or create new</h3>
      <input
        value={name}
        placeholder="username"
        onChange={e => setName(e.target.value)}
      />
      <button onClick={handleCreate}>Create & Add</button>
    </div>
  );
}