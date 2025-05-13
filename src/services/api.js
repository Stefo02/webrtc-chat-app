// src/services/api.js
import axios from 'axios';

// 1) Create a shared Axios instance
//    Reads REACT_APP_API_URL from your .env (e.g. "http://localhost:4000")
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 2) Friend-related endpoints
export const getFriends = async (userId) => {
  const res = await api.get(`/friends/${userId}`);
  return res.data;  // [{ id, username, status }, …]
};

export const addFriend = async (userId, friendUsername) => {
  const res = await api.post('/friends', { userId, friendUsername });
  return res.status === 201;
};

// 3) Message-related endpoints
export const getChatHistory = async (userA, userB) => {
  const res = await api.get(`/messages/${userA}/${userB}`);
  return res.data;  
  /* [
     { sender_id, receiver_id, content, created_at },
     …
   ]
  */
};

export const sendMessage = async (senderId, receiverId, content) => {
  const res = await api.post('/messages', {
    senderId,
    receiverId,
    content,
  });
  return res.data;  // { id, created_at }
};

// 4) (Optional) User endpoints — if you plan to implement signup/login
export const getUsers = async () => {
  const res = await api.get('/users');
  return res.data;
};

export const createUser = async (username, email, passwordHash) => {
  const res = await api.post('/users', { username, email, passwordHash });
  return res.data;  // { id, username }
};

export default api;
