const express = require('express');
const opn = require('opn');
const path = require('path');
const axios = require('axios');
const querystring = require('querystring');
const app = express();
const cors = require('cors');

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Set the directory for views
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// Automatically find a free port
const server = require('http').createServer(app);
const portfinder = require('portfinder');

let userId;

const clientId = '382ee2428fd44ee387e279e5dcee5cf9'; // Replace with your Spotify client ID
const clientSecret = '44b321a1cbd540aab0abcb6788b541a3'; // Replace with your Spotify client secret
const redirectUri = 'http://localhost:8001/callback'; // Replace with your redirect URI
const scopes = ['user-read-private', 'user-read-email', 'playlist-modify-public', 'playlist-modify-private', 'ugc-image-upload']; // Adjust scopes as needed


// Function to request access token
async function getAccessToken(code) {
  const tokenEndpoint = 'https://accounts.spotify.com/api/token';

  try {
    const response = await axios.post(
      tokenEndpoint,
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.message);
    throw error;
  }
}

portfinder.getPortPromise()
  .then(port => {
    // Increment the port number by 1
    const nextPort = port + 1;

    const server = app.listen(nextPort, () => {
      console.log(`The application is running at http://localhost:${nextPort}`);
      // Open the browser automatically to the home page
      opn(`http://localhost:${nextPort}/`);
    });

    // Example route for the home page
    app.get('/index', (req, res) => {
      res.render('index');
    });

    // Example route for authorization
    app.get('/', (req, res) => {
      const authorizeUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
        response_type: 'code',
        client_id: clientId,
        scope: scopes.join(' '),
        redirect_uri: redirectUri,
        //show_dialog: true, // Add this parameter to force the display of the authorization page
      })}`;
      res.redirect(authorizeUrl);
    });

    // Example route for the Spotify authorization callback
    app.get('/callback', async (req, res) => {
      const code = req.query.code || null;

      try {
        // Request access token using the authorization code
        const accessToken = await getAccessToken(code);

        // Now you can use the accessToken to make requests to the Spotify Web API
        // For example, get user profile
        const userProfileResponse = await axios.get('https://api.spotify.com/v1/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        // Extract user ID from the profile data
        const userId = userProfileResponse.data.id;

        // Output user profile data to console
        console.log('User Profile:', userProfileResponse.data);

        res.render('index', {userId, accessToken});

      } catch (error) {
        console.error('Error during authorization:', error.message);
        res.send('Error during authorization. Check the console for details.');
      }
    });
  })
  .catch(err => console.error(err));