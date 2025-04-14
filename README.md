
# 📝 Real-Time Collaborative Editor

A full-stack real-time collaborative text editor built with **React**, **Node.js**, **Express**, **MongoDB**, and **WebSockets**. This app allows multiple users to create and collaboratively edit documents, manage version history, and control access with real-time synchronization.

---

## ✨ Features

- 🔐 JWT-based user authentication
- 📄 Create, edit, and save documents
- 🔁 Version history and restore functionality
- 👥 Add/remove collaborators
- 🖱️ Real-time cursor sharing
- ⏪ Undo/Redo local changes
- 🌙 Dark mode toggle

---

## 🏗️ Tech Stack

- **Frontend**: React, Axios, WebSocket
- **Backend**: Node.js, Express, MongoDB, Mongoose
- **Authentication**: JWT + Cookies
- **Real-time**: WebSocket with `ws` package

---

## 📁 Project Structure


root/
├── server/               # Backend logic
│   └── server.js
├── client/               # React frontend
│   └── src/
│       └── App.js
├── .env                  # Environment variables (NOT committed)
└── README.md

---

### 1. Backend Setup

Navigate to the backend folder:

```bash
cd server
```

Install dependencies:

```bash
npm install express mongoose cors jsonwebtoken bcryptjs dotenv cookie-parser ws
```

Create a `.env` file:

```
MONGO_URI=mongodb://localhost:27017/realtime-editor
JWT_SECRET=your_secret_key
```

Run the server:

```bash
node server.js
```

---

### 2. Frontend Setup

Navigate to the frontend folder:

```bash
cd ../client
```

Install dependencies:

```bash
npm install
npm install axios
```

Replace the default `src/App.js` with the provided one.

Run the frontend:

```bash
npm start
```

---

## 🌐 Usage

1. Register or log in with a username and password.
2. Create new documents or select from existing ones.
3. Edit text in real-time with other users.
4. Use undo/redo buttons to manage local changes.
5. View and restore past document versions.
6. Manage collaborators on a document (add/remove).
7. Toggle between light and dark mode.

---
