import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import cors from 'cors';
import * as path from 'path';
import { EventBus } from '../core/EventBus';
import { SessionManager } from './SessionManager';
import { TemplateManager } from '../core/TemplateManager';

export class Server {
  private app: express.Application;
  private httpServer: http.Server;
  private io: SocketIOServer;
  private eventBus: EventBus;
  private sessionManager: SessionManager;

  constructor(port: number = 3000) {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.WEB_UI_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    this.eventBus = EventBus.getInstance();
    this.sessionManager = new SessionManager();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();

    this.httpServer.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: process.env.WEB_UI_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || "http://localhost:3000",
      credentials: true
    }));
    this.app.use(express.json());
    this.app.use(express.static(path.join(process.cwd(), 'public')));
  }

  private setupRoutes() {
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    this.app.get('/api/templates', (req, res) => {
      const templateManager = new TemplateManager();
      res.json(templateManager.listTemplates());
    });

    this.app.post('/api/start', async (req, res) => {
      try {
        const options = req.body;
        // Run asynchronously - don't wait for completion
        this.sessionManager.startTask(options).catch(err => {
            console.error("Background task failed:", err);
            // Propagate error to client via EventBus
            this.eventBus.emitEvent('error', { message: err.message });
        });
        res.json({ status: 'started', message: 'Task started successfully' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private setupSocketIO() {
    this.io.on('connection', (socket) => {
      console.log('Client connected');
      
      socket.on('disconnect', () => {
        console.log('Client disconnected');
      });
    });

    // Subscribe to EventBus and broadcast to all clients
    this.eventBus.on('event', (event) => {
      this.io.emit('conclave:event', event);
    });
  }
}
