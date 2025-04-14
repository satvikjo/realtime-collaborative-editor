const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','DELETE']
}));
app.use(express.json());
app.use(cookieParser());

const SECRET_KEY = process.env.JWT_SECRET;

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

// Document Schema
const documentSchema = new mongoose.Schema({
  _id: String,
  content: String,
  owner: { type: String, required: true }, // User who created the doc
  collaborators: [{ type: String }], // Users with access
});
const Document = mongoose.model("Document", documentSchema);

const docVersionSchema = new mongoose.Schema({
  docId: { type: String, required: true },
  content: { type: String, required: true },
  version: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true }
});
const DocVersion = mongoose.model('DocVersion', docVersionSchema);

// Auth Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Auth Routes
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send("Username and password are required");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    res.status(201).json({ message: "User created successfully", username });
  } catch (err) {
    if (err.code === 11000) {
      res.status(409).send("Username already exists");
    } else {
      res.status(500).send("Error registering user");
    }
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).send("Invalid password");

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    res.json({ message: "Logged in successfully", username });
  } catch (err) {
    res.status(500).send("Error logging in");
  }
});

app.post("/logout", (req, res) => {
  res.clearCookie('token');
  res.send("Logged out successfully");
});



// Document Routes
app.get("/documents", authenticateToken, async (req, res) => {
  try {
    const docs = await Document.find({
      $or: [
        { owner: req.user.username },
        { collaborators: req.user.username }
      ]
    });
    res.json(docs);
  } catch (err) {
    res.status(500).send("Error fetching documents");
  }
});

app.post("/documents", authenticateToken, async (req, res) => {
  try {
    const { docId } = req.body;
    if (!docId) return res.status(400).send("Document ID is required");

    const existingDoc = await Document.findById(docId);
    if (existingDoc) return res.status(409).send("Document already exists");

    const doc = new Document({
      _id: docId,
      content: "",
      owner: req.user.username,
      collaborators: []
    });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).send("Error creating document");
  }
});

app.get("/documents/:id", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user.username },
        { collaborators: req.user.username }
      ]
    });
    
    if (!doc) return res.status(404).send("Document not found or access denied");
    res.json(doc);
  } catch (err) {
    res.status(500).send("Error fetching document");
  }
});

app.post("/documents/:id", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const doc = await Document.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { owner: req.user.username },
          { collaborators: req.user.username }
        ]
      },
      { content },
      { new: true }
    );
    
    if (!doc) return res.status(404).send("Document not found or access denied");
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send("Error updating document");
  }
});

app.get('/documents/:id/versions', authenticateToken, async (req, res) => {
  try {
    const versions = await DocVersion.find({ 
      docId: req.params.id 
    }).sort('-version').limit(50);
    res.json(versions);
  } catch (err) {
    res.status(500).send('Error fetching versions');
  }
});

app.post('/documents/:id/restore', authenticateToken, async (req, res) => {
  try {
    const { version } = req.body;
    const versionDoc = await DocVersion.findOne({
      docId: req.params.id,
      version: version
    });
    
    if (!versionDoc) {
      return res.status(404).send('Version not found');
    }

    // Update current document
    await Document.findByIdAndUpdate(req.params.id, {
      content: versionDoc.content
    });

    // Broadcast update to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'update',
          content: versionDoc.content,
          sender: req.user.username,
          isRestore: true
        }));
      }
    });

    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error restoring version');
  }
});

app.post('/documents/:id/collaborators', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    
    // Verify document exists and user is owner
    const doc = await Document.findOne({
      _id: req.params.id,
      owner: req.user.username
    });
    
    if (!doc) {
      return res.status(404).send('Document not found or you are not the owner');
    }

    // Verify collaborator user exists
    const collaborator = await User.findOne({ username });
    if (!collaborator) {
      return res.status(404).send('User not found');
    }

    // Add collaborator if not already added
    if (!doc.collaborators.includes(username)) {
      doc.collaborators.push(username);
      await doc.save();
    }

    res.json(doc);
  } catch (err) {
    res.status(500).send('Error adding collaborator');
  }
});

app.delete('/documents/:id/collaborators/:username', authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      owner: req.user.username
    });
    
    if (!doc) {
      return res.status(404).send('Document not found or you are not the owner');
    }

    // Remove collaborator
    doc.collaborators = doc.collaborators.filter(
      user => user !== req.params.username
    );
    await doc.save();

    res.json(doc);
  } catch (err) {
    res.status(500).send('Error removing collaborator');
  }
});

app.get('/documents/:id/collaborators', authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user.username },
        { collaborators: req.user.username }
      ]
    });
    
    if (!doc) {
      return res.status(404).send('Document not found or access denied');
    }

    res.json({
      owner: doc.owner,
      collaborators: doc.collaborators
    });
  } catch (err) {
    res.status(500).send('Error fetching collaborators');
  }
});

function getColorForUser(username) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
  const index = username.charCodeAt(0) % colors.length;
  return colors[index];
}


// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// WebSocket Server with Authentication
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // Extract token from cookies or headers
  const token = req.headers.cookie?.split('; ')
    .find(c => c.startsWith('token='))
    ?.split('=')[1];
  
  if (!token) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  try {
    const user = jwt.verify(token, SECRET_KEY);
    ws.user = user;

    ws.on('message', async (message) => {
      try {

        const data = JSON.parse(message);
    
    if (data.type === 'cursor') {
      // Broadcast cursor position to all collaborators
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'cursor',
            userId: ws.user.username,
            x: data.x,
            y: data.y,
            color: getColorForUser(ws.user.username) // Implement this function
          }));
        }
      });
      return;
    }
        const { docId, content, type } = JSON.parse(message);
    
        if (type === 'edit') {
          // Get current version count
          const latestVersion = await DocVersion.findOne({ docId })
            .sort('-version')
            .select('version')
            .lean();
          
          const newVersion = (latestVersion?.version || 0) + 1;
    
          // Save new version
          await DocVersion.create({
            docId,
            content,
            version: newVersion,
            createdBy: user.username
          });
    
          // Update current document
          await Document.findByIdAndUpdate(docId, { content });
          
          // Broadcast to all clients in the same document
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && 
              (client.user.username === doc.owner || 
               doc.collaborators.includes(client.user.username))) {
            client.send(JSON.stringify({
              type: 'update',
              content,
              sender: user.username
            }));
          }
          });
        }
      } catch (err) {
        console.error('WebSocket error:', err);
      }
    });

    ws.on('close', () => {
      console.log(`❌ WebSocket Disconnected: ${user.username}`);
    });

    console.log(`🔌 New WebSocket Connection: ${user.username}`);
  } catch (err) {
    ws.close(1008, 'Invalid token');
  }
});