import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ENV } from './config/env';
import projectRouter from './modules/projects/routes/projectRoutes';
import containerRouter from './modules/containers/routes/containerRoutes';
import { TerminalGateway } from './modules/terminal/gateway/terminalGateway';

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE']
}));
app.use(express.json());

// Scoped APIs
app.use('/api/projects', projectRouter);
app.use('/api/projects/:projectId/containers', containerRouter);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

TerminalGateway.handleConnections(io);

server.listen(ENV.PORT, () => {
  console.log(`Backend server running in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
});
