import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [docId, setDocId] = useState("");
  const [content, setContent] = useState("");
  const [newDocId, setNewDocId] = useState("");
  const ws = useRef(null);
  const [versions, setVersions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPosition, setHistoryPosition] = useState(-1);
  const [localChanges, setLocalChanges] = useState([]);
  const [localChangePosition, setLocalChangePosition] = useState(-1);
  const [collaborators, setCollaborators] = useState([]);
  const [newCollaborator, setNewCollaborator] = useState('');
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [cursors, setCursors] = useState({});
  const [darkMode, setDarkMode] = useState(false);

  // Authentication functions
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post("http://localhost:8080/register", {
        username,
        password
      }, { withCredentials: true });
      setIsLoggedIn(true);
      setUser(username);
      fetchDocuments();
    } catch (error) {
      alert(error.response?.data || "Registration failed");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post("http://localhost:8080/login", {
        username,
        password
      }, { withCredentials: true });
      setIsLoggedIn(true);
      setUser(username);
      fetchDocuments();
    } catch (error) {
      alert(error.response?.data || "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post("http://localhost:8080/logout", {}, { withCredentials: true });
      setIsLoggedIn(false);
      setUser(null);
      setDocuments([]);
      setDocId("");
      setContent("");
      if (ws.current) ws.current.close();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Document functions
  const fetchDocuments = async () => {
    try {
      const response = await axios.get("http://localhost:8080/documents", {
        withCredentials: true
      });
      setDocuments(response.data);
      if (response.data.length > 0 && !docId) {
        setDocId(response.data[0]._id);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const createDocument = async () => {
    if (!newDocId.trim()) return;
    try {
      await axios.post(
        "http://localhost:8080/documents",
        { docId: newDocId },
        { withCredentials: true }
      );
      setNewDocId("");
      fetchDocuments();
    } catch (error) {
      alert(error.response?.data || "Error creating document");
    }
  };

  const fetchVersions = async () => {
    try {
      const response = await axios.get(
        `http://localhost:8080/documents/${docId}/versions`,
        { withCredentials: true }
      );
      setVersions(response.data);
      setShowHistory(true);
    } catch (error) {
      console.error('Error fetching versions:', error);
    }
  };

  const restoreVersion = async (version) => {
    try {
      await axios.post(
        `http://localhost:8080/documents/${docId}/restore`,
        { version },
        { withCredentials: true }
      );
      setShowHistory(false);
    } catch (error) {
      console.error('Error restoring version:', error);
    }
  };

  const fetchCollaborators = async () => {
    try {
      const response = await axios.get(
        `http://localhost:8080/documents/${docId}/collaborators`,
        { withCredentials: true }
      );
      setCollaborators(response.data.collaborators);
    } catch (error) {
      console.error('Error fetching collaborators:', error);
    }
  };
  
  const addCollaborator = async () => {
    if (!newCollaborator.trim()) return;
    try {
      await axios.post(
        `http://localhost:8080/documents/${docId}/collaborators`,
        { username: newCollaborator },
        { withCredentials: true }
      );
      setNewCollaborator('');
      fetchCollaborators();
    } catch (error) {
      console.error('Error adding collaborator:', error);
      alert(error.response?.data || 'Error adding collaborator');
    }
  };
  
  const removeCollaborator = async (username) => {
    try {
      await axios.delete(
        `http://localhost:8080/documents/${docId}/collaborators/${username}`,
        { withCredentials: true }
      );
      fetchCollaborators();
    } catch (error) {
      console.error('Error removing collaborator:', error);
    }
  };

  // WebSocket connection and document editing
  useEffect(() => {
    if (!isLoggedIn || !docId) return;

    // Load initial document content
    const loadDocument = async () => {
      try {
        const response = await axios.get(
          `http://localhost:8080/documents/${docId}`,
          { withCredentials: true }
        );
        setContent(response.data.content || "");
      } catch (error) {
        console.error("Error loading document:", error);
      }
    };
    loadDocument();

    // Connect WebSocket
    ws.current = new WebSocket("ws://localhost:8080");

    ws.current.onopen = () => {
      console.log("🔌 Connected to WebSocket");
      ws.current.send(JSON.stringify({ type: "load", docId }));
    };

    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'cursor') {
        setCursors(prev => ({
          ...prev,
          [data.userId]: { x: data.x, y: data.y, color: data.color }
        }));
      }
      if (data.type === "update") {
        setContent(data.content);
      } else if (data.type === "load") {
        setContent(data.content);
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [docId, isLoggedIn]);

  const handleTextChange = (e) => {
    const newContent = e.target.value;
    const oldContent = content;
    
    // Save local change for undo/redo
    setLocalChanges(prev => {
      const newChanges = prev.slice(0, localChangePosition + 1);
      newChanges.push({ before: oldContent, after: newContent });
      return newChanges;
    });
    setLocalChangePosition(prev => prev + 1);
    
    setContent(newContent);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "edit", docId, content: newContent }));
    }
  };

  const handleUndo = () => {
    if (localChangePosition < 0) return;
    
    const change = localChanges[localChangePosition];
    setContent(change.before);
    setLocalChangePosition(prev => prev - 1);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ 
        type: "edit", 
        docId, 
        content: change.before 
      }));
    }
  };

  const handleRedo = () => {
    if (localChangePosition >= localChanges.length - 1) return;
    
    const change = localChanges[localChangePosition + 1];
    setContent(change.after);
    setLocalChangePosition(prev => prev + 1);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ 
        type: "edit", 
        docId, 
        content: change.after 
      }));
    }
  };
  
  if (!isLoggedIn) {
    return (
      <div style={{ padding: "20px" }}>
        <h1>Real-Time Collaborative Editor</h1>
        <div>
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Login</button>
          </form>
        </div>
        <div>
          <h2>Register</h2>
          <form onSubmit={handleRegister}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Register</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: "20px",
      backgroundColor: darkMode ? '#1a1a1a' : 'white',
      color: darkMode ? 'white' : 'black',
      minHeight: '100vh'
    }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Real-Time Collaborative Editor</h1>
        <div>
          <span>Logged in as: {user}</span>
          <button onClick={handleLogout} style={{ marginLeft: "10px" }}>Logout</button>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            style={{ marginLeft: "10px" }}
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'} Mode
          </button>

        </div>
      </div>

      <div style={{ display: "flex", marginBottom: "20px" }}>
        <div style={{ marginRight: "20px", width: "200px" }}>
          <h3>My Documents</h3>
          <select
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            style={{ width: "100%", marginBottom: "10px" }}
          >
            {documents.map((doc) => (
              <option key={doc._id} value={doc._id}>
                {doc._id} {doc.owner === user ? "(Owner)" : "(Collaborator)"}
              </option>
            ))}
          </select>
          
          <div style={{ marginTop: '20px' }}>
          <h3>Collaborators</h3>
          <button 
            onClick={() => setShowCollaborators(!showCollaborators)}
            style={{ marginBottom: '5px' }}
          >
            {showCollaborators ? 'Hide' : 'Manage'} Collaborators
          </button>
          
          {showCollaborators && (
            <div>
              <div style={{ display: 'flex', marginBottom: '5px' }}>
                <input
                  type="text"
                  placeholder="Username"
                  value={newCollaborator}
                  onChange={(e) => setNewCollaborator(e.target.value)}
                  style={{ flex: 1, marginRight: '5px' }}
                />
                <button onClick={addCollaborator}>Add</button>
              </div>
              
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                <div style={{ fontWeight: 'bold' }}>Owner: {documents.find(d => d._id === docId)?.owner}</div>
                <ul style={{ listStyle: 'none', paddingLeft: '5px' }}>
                  {collaborators.map((collab) => (
                    <li key={collab} style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ flex: 1 }}>{collab}</span>
                      {documents.find(d => d._id === docId)?.owner === user && (
                        <button 
                          onClick={() => removeCollaborator(collab)}
                          style={{ 
                            background: 'none',
                            border: 'none',
                            color: 'red',
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

          <div>
            <h3>Create New Document</h3>
            <input
              type="text"
              placeholder="Document ID"
              value={newDocId}
              onChange={(e) => setNewDocId(e.target.value)}
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <button onClick={createDocument}>Create</button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Editing: {docId}</h3>
          <div style={{ marginBottom: '10px' }}>
        <button onClick={fetchVersions}>View History</button>
        <button 
          onClick={handleUndo} 
          disabled={localChangePosition < 0}
          style={{ marginLeft: '5px' }}
        >
          Undo
        </button>
        <button 
          onClick={handleRedo} 
          disabled={localChangePosition >= localChanges.length - 1}
          style={{ marginLeft: '5px' }}
        >
          Redo
        </button>
      </div>

      {showHistory && (
        <div style={{ 
          border: '1px solid #ccc', 
          padding: '10px', 
          marginBottom: '10px',
          maxHeight: '200px',
          overflowY: 'auto',
          backgroundColor: darkMode ? '#2d2d2d' : 'white'
        }}>
          <h4>Document History</h4>
          <button 
            onClick={() => setShowHistory(false)}
            style={{ float: 'right' }}
          >
            Close
          </button>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Version</th>
                <th>Date</th>
                <th>User</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(version => (
                <tr key={version._id}>
                  <td>{version.version}</td>
                  <td>{new Date(version.createdAt).toLocaleString()}</td>
                  <td>{version.createdBy}</td>
                  <td>
                    <button onClick={() => restoreVersion(version.version)}>
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
          <textarea
            value={content}
            onChange={handleTextChange}
            onMouseMove={(e) => {
              if (ws.current?.readyState === WebSocket.OPEN) {
                const rect = e.target.getBoundingClientRect();
                ws.current.send(JSON.stringify({
                  type: 'cursor',
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  docId
                }));
              }
            }}
            style={{ width: "100%", 
              height: "400px", 
              position: 'relative',
              backgroundColor: darkMode ? '#2d2d2d' : 'white',
              color: darkMode ? 'white' : 'black',
              borderColor: darkMode ? '#444' : '#ddd' }}
          />
          {Object.entries(cursors).map(([userId, cursor]) => (
            <div 
              key={userId}
              style={{
                position: 'absolute',
                left: cursor.x,
                top: cursor.y,
                width: '2px',
                height: '20px',
                backgroundColor: cursor.color,
                pointerEvents: 'none',
                zIndex: 2 // Ensure cursors appear above textarea
              }}
            >
              <span style={{
                position: 'absolute',
                top: '-20px',
                fontSize: '12px',
                backgroundColor: cursor.color,
                color: 'white',
                padding: '2px 5px',
                borderRadius: '3px'
              }}>
                {userId}
              </span>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}

export default App;