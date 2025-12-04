"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const path = __importStar(require("path"));
const EventBus_1 = require("../core/EventBus");
const SessionManager_1 = require("./SessionManager");
const TemplateManager_1 = require("../core/TemplateManager");
class Server {
    constructor(port = 3000) {
        this.app = (0, express_1.default)();
        this.httpServer = http_1.default.createServer(this.app);
        this.io = new socket_io_1.Server(this.httpServer, {
            cors: {
                origin: process.env.WEB_UI_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        this.eventBus = EventBus_1.EventBus.getInstance();
        this.sessionManager = new SessionManager_1.SessionManager();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIO();
        this.httpServer.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    }
    setupMiddleware() {
        this.app.use((0, cors_1.default)({
            origin: process.env.WEB_UI_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || "http://localhost:3000",
            credentials: true
        }));
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.static(path.join(process.cwd(), 'public')));
    }
    setupRoutes() {
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok' });
        });
        this.app.get('/api/templates', (req, res) => {
            const templateManager = new TemplateManager_1.TemplateManager();
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
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    setupSocketIO() {
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
exports.Server = Server;
