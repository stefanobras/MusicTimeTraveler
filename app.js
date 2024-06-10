const express = require('express');
const opn = require('opn');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const cors = require('cors');
const session = require('express-session'); // Add session support for tracking login
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(session({
    secret: 'your_secret_key', // Replace with your own secret key
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'http://localhost:8001/callback';

async function getAccessToken(code) {
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const params = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
    };
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
        const response = await axios.post(tokenEndpoint, querystring.stringify(params), {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.message);
        throw error;
    }
}

// Root URL for Spotify authorization
app.get('/', (req, res) => {
    if (req.session.accessToken) {
        res.redirect('/index');
    } else {
        const authorizeUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
            response_type: 'code',
            client_id: clientId,
            scope: 'user-read-private user-read-email playlist-modify-public playlist-modify-private',
            redirect_uri: redirectUri,
            show_dialog: true
        })}`;
        res.redirect(authorizeUrl);
    }
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    try {
        const accessToken = await getAccessToken(code);
        req.session.accessToken = accessToken;  // Save the access token in the session

        // Fetch user profile to get userId
        const userProfile = await fetchUserProfile(accessToken);
        req.session.userId = userProfile.id;  // Save the userId in the session

        res.redirect('/index');
    } catch (error) {
        console.error('Error during authorization:', error.message);
        res.send('Error during authorization. Check the console for details.');
    }
});

async function fetchUserProfile(accessToken) {
    const userProfileUrl = 'https://api.spotify.com/v1/me';
    try {
        const response = await axios.get(userProfileUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Failed to fetch user profile:', error.message);
        throw error;
    }
}


app.get('/index', (req, res) => {
  if (!req.session.accessToken) {
      res.redirect('/');
  } else {
      res.render('index', {
          accessToken: req.session.accessToken,
          userId: req.session.userId // Make sure you have this variable defined
      });
  }
});

// Endpoint to get Token
app.get('/get-token', (req, res) => {
    if (req.session.accessToken) {
        res.json({
            accessToken: req.session.accessToken,
            userId: req.session.userId  // Ensure userId is also retrievable
        });
    } else {
        res.status(401).json({ error: 'Access token is unavailable.' });
    }
});


// Endpoint to fetch artists by genre
app.get('/api/artists', async (req, res) => {
  if (!req.session.accessToken) {
      return res.status(401).json({ message: "No access token available" });
  }

  const { genre, year, limit, offset } = req.query;
  const url = `https://api.spotify.com/v1/search?q=genre:"${encodeURIComponent(genre)}"+year:${year}&type=artist&limit=${limit}&offset=${offset}`;

  try {
      const spotifyResponse = await axios.get(url, {
          headers: {
              'Authorization': `Bearer ${req.session.accessToken}`, // Use token from session
              'Content-Type': 'application/json'
          }
      });
      res.json(spotifyResponse.data);
  } catch (error) {
      console.error('Failed to fetch artists from Spotify:', error);
      res.status(500).json({ message: 'Failed to fetch artists', error: error.response.data });
  }
});

app.get('/api/search-albums', async (req, res) => {
  if (!req.session.accessToken) {
      return res.status(401).json({ message: "No access token available" });
  }

  const { artistName, startYear, endYear } = req.query;
  const query = encodeURIComponent(`artist:"${artistName}" year:${startYear}-${endYear}`);
  const url = `https://api.spotify.com/v1/search?q=${query}&type=album&market=ES&limit=50`;

  try {
      const spotifyResponse = await axios.get(url, {
          headers: {
              'Authorization': `Bearer ${req.session.accessToken}`,
              'Content-Type': 'application/json'
          }
      });
      res.json(spotifyResponse.data);
  } catch (error) {
      console.error('Failed to search albums from Spotify:', error);
      res.status(500).json({ message: 'Failed to search albums', error: error.response.data });
  }
});

// Endpoint to fetch tracks for a specific album
app.get('/api/tracks-for-album', async (req, res) => {
  if (!req.session.accessToken) {
      return res.status(401).json({ message: "No access token available" });
  }

  const { albumId } = req.query;
  const url = `https://api.spotify.com/v1/albums/${albumId}/tracks`;

  try {
      const spotifyResponse = await axios.get(url, {
          headers: {
              'Authorization': `Bearer ${req.session.accessToken}`, // Use token from session
              'Content-Type': 'application/json'
          }
      });
      res.json(spotifyResponse.data);
  } catch (error) {
      console.error('Failed to fetch tracks for album:', error);
      res.status(500).json({ message: 'Failed to fetch tracks', error: error.response.data });
  }
});

app.post('/api/playlists', async (req, res) => {
    const { userId, country, decade, token } = req.body;
    const playlistName = `Playlist: ${country} ${decade}`;
    const playlistDescription = `A collection of tracks from ${country} in the ${decade}s.`;

    try {
        const response = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
            name: playlistName,
            description: playlistDescription,
            public: true
        }, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status !== 201) {
            throw new Error('Failed to create playlist');
        }

        res.status(201).json({ playlistId: response.data.id });
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/playlist/tracks', async (req, res) => {
    const { playlistId, trackUris, token } = req.body;

    try {
        const response = await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            uris: trackUris
        }, {
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status !== 200) {
            throw new Error('Failed to add tracks to playlist');
        }

        res.status(200).json({ message: 'Tracks added successfully' });
    } catch (error) {
        console.error('Error adding tracks to playlist:', error);
        res.status(500).json({ error: error.message });
    }
});




const port = process.env.PORT || 8001;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    opn(`http://localhost:${port}`);
});
