# ADK Chat Interface Template

The `templates/adk-chat-interface/` provides a lightweight, instant-start web interface for communicating with local Agents developed using tools like Genkit or ADK.

## When to Use
Use this template when you are developing an AI agent locally and need a functional chat UI to converse with it, without having to spin up a heavy Next.js frontend or connect it to the main `wot-box` application.

## Components
1. **`server.js`**: An Express server that acts as a middleware router. 
2. **`public/index.html`**: A Vanilla JS/CSS chat UI that immediately renders in browser.

## How to Use
1. Copy the folder to a new local directory.
2. Run `npm install` to grab Express, cors, and dotenv dependencies.
3. Open `server.js` and edit the `app.post('/api/chat', ...)` endpoint.
   - Import your Genkit / ADK module at the top of the file.
   - Pass the `req.body.message` into your agent generation function.
   - Return the agent's generated response in the `reply` JSON field.
4. Run `npm run dev` (starts the server with nodemon for hot-reloading).
5. Open `http://localhost:8080/` in your browser and start chatting with your local agent implementation!

## Customization
- The HTML and CSS are located entirely inside `index.html`. You can easily add Markdown rendering scripts (like `marked.js`) or syntax highlighting if your agent returns code blocks.
