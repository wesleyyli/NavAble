# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

## Additional setup for NavAble

This project uses Geoapify for geocoding and routing, and ElevenLabs for high-quality text-to-speech / speech-to-text. A light backend proxy is required for ElevenLabs speech-to-text so your API key is never exposed client-side.

1. Create a `.env` file from `.env.example` and set `REACT_APP_GEOAPIFY_KEY`.

2. Implement a server endpoint (for example `/api/elevenlab-stt`) that accepts a multipart file upload (audio) and forwards it to ElevenLabs' STT endpoint using your ElevenLabs API key stored on the server. The endpoint should return JSON like `{ text: "transcribed text here" }`.

3. The frontend component `src/components/ElevenLabsSpeechToText.tsx` will POST recorded audio to `/api/elevenlab-stt`, receive the transcribed text, and attempt to parse start/end locations.

Note: For MVP you may use the browser Web Speech API for STT (no server required), but ElevenLabs offers higher quality and more consistent output.

### Running the local proxy server (ElevenLabs STT + Geoapify routing)

1. Change to the server folder and install dependencies:

```powershell
cd navable/server
npm install
```

2. Create `.env` from `server/.env.example` and set `ELEVENLABS_API_KEY` and `GEOAPIFY_KEY`.

3. Start the server:

```powershell
npm run start
```

The server will listen on port 4000 by default and expose:
- `POST /api/elevenlab-stt` — accepts multipart file form field `file` and returns `{ text: '...' }`.
- `POST /api/route` — accepts `{ start, end, accessibilityOptions }` and returns Geoapify routing JSON.

In development you can run the React app (`npm start` from the `navable` folder) and the server concurrently. Ensure CORS or proxy settings are configured if needed.
