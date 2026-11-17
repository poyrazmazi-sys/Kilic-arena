import { createServer } from 'http';
import { ExpressPeerServer } from 'peer';
import express from 'express';
const app = express(); const server = createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/' }));
server.listen(9000, '127.0.0.1', () => console.log('peer server on 9000'));
