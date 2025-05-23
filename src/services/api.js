// src/services/api.js
import axios from 'axios';

// 1) Create a shared Axios instance
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
  return res.data.map(msg => ({
    ...msg,
    edited: msg.edited, // make sure this field is preserved
  }));
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

export const deleteMessage = async (messageId) => {
  await api.delete(`/messages/${messageId}`);
};

export const editMessage = async (messageId, newContent) => {
  const res = await api.put(`/messages/${messageId}`, { newContent });
  return res.data;
};

export default api;
