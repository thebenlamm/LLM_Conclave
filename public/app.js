const socket = io();

const statusIndicator = document.getElementById('status-indicator');
const templateSelect = document.getElementById('template-select');
const startForm = document.getElementById('start-form');
const outputContainer = document.getElementById('output-container');
const agentBar = document.getElementById('agent-bar');
const activityLog = document.getElementById('activity-log');

let currentRunId = null;
let agents = {};
let activeAgent = null;

// --- Connection Handling ---

socket.on('connect', () => {
    statusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Connected';
    loadTemplates();
});

socket.on('disconnect', () => {
    statusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span> Disconnected';
});

// --- API Calls ---

async function loadTemplates() {
    try {
        const res = await fetch('/api/templates');
        const templates = await res.json();
        templates.forEach(t => {
            const option = document.createElement('option');
            option.value = t.name;
            option.textContent = `${t.name} (${t.mode})`;
            templateSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load templates', err);
    }
}

startForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const task = document.getElementById('task-input').value;
    const template = templateSelect.value;
    const mode = document.getElementById('mode-select').value;
    const projectPath = document.getElementById('project-path-input').value;

    if (!task) return;

    // Reset UI
    outputContainer.innerHTML = '';
    agentBar.innerHTML = '';
    activityLog.innerHTML = '';
    agents = {};

    try {
        await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task,
                template: template || undefined,
                mode: template ? undefined : mode, // Use selected mode if no template
                projectPath: projectPath || undefined
            })
        });

        addSystemMessage('Session started...');
    } catch (err) {
        addSystemMessage(`Error: ${err.message}`, 'text-red-500');
    }
});

// --- Event Handling ---

socket.on('conclave:event', (event) => {
    const { type, payload, timestamp } = event;
    
    switch (type) {
        case 'run:start':
            addSystemMessage(`Started ${payload.mode} run for task: ${payload.task}`);
            break;
            
        case 'status':
            addLog(payload.message);
            break;
            
        case 'agent:thinking':
            updateAgentStatus(payload.agent, payload.model, 'thinking');
            break;
            
        case 'token':
            appendToken(payload.agent, payload.token);
            break;
            
        case 'agent:response':
            updateAgentStatus(payload.agent, null, 'idle');
            // Ensure the response block is closed/finalized if needed
            break;
            
        case 'error':
            addSystemMessage(`Error: ${payload.message}`, 'text-red-500');
            break;
            
        case 'run:complete':
            addSystemMessage('Run completed successfully.');
            break;
    }
});

// --- UI Helper Functions ---

function addLog(message) {
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    activityLog.insertBefore(div, activityLog.firstChild);
}

function addSystemMessage(text, className = 'text-blue-400') {
    const div = document.createElement('div');
    div.className = `font-mono border-l-2 border-blue-500 pl-4 py-2 ${className}`;
    div.textContent = text;
    outputContainer.appendChild(div);
    outputContainer.scrollTop = outputContainer.scrollHeight;
}

function getOrCreateAgentBlock(agentName) {
    let block = document.getElementById(`msg-${agentName}-${currentRunId}`); // Simple ID, ideally use a real unique ID per turn
    
    // Since we don't have turn IDs in the stream yet, we'll just append to the last block 
    // if it matches the agent, or create a new one.
    const lastBlock = outputContainer.lastElementChild;
    if (lastBlock && lastBlock.dataset.agent === agentName && !lastBlock.dataset.finalized) {
        return lastBlock.querySelector('.content-body');
    }
    
    // Create new message block
    const container = document.createElement('div');
    container.className = 'bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-700 mb-4';
    container.dataset.agent = agentName;
    
    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 mb-2 border-b border-gray-700 pb-2';
    header.innerHTML = `<span class="font-bold text-blue-400">${agentName}</span>`;
    
    const content = document.createElement('div');
    content.className = 'content-body font-mono text-sm whitespace-pre-wrap leading-relaxed text-gray-300';
    
    container.appendChild(header);
    container.appendChild(content);
    outputContainer.appendChild(container);
    outputContainer.scrollTop = outputContainer.scrollHeight;
    
    return content;
}

function appendToken(agentName, token) {
    const contentArea = getOrCreateAgentBlock(agentName);
    contentArea.textContent += token;
    outputContainer.scrollTop = outputContainer.scrollHeight;
}

function updateAgentStatus(name, model, status) {
    // Update Sidebar/Top bar agent visualization
    let agentCard = document.getElementById(`agent-card-${name}`);
    if (!agentCard) {
        agentCard = document.createElement('div');
        agentCard.id = `agent-card-${name}`;
        agentCard.className = 'flex items-center gap-2 bg-gray-800 px-3 py-2 rounded border border-gray-700 min-w-[150px]';
        agentCard.innerHTML = `
            <div class="w-2 h-2 rounded-full bg-gray-500 status-dot"></div>
            <div>
                <div class="text-sm font-bold text-white leading-none">${name}</div>
                <div class="text-xs text-gray-500 leading-none mt-1">${model || 'Unknown'}</div>
            </div>
        `;
        agentBar.appendChild(agentCard);
    }
    
    const dot = agentCard.querySelector('.status-dot');
    if (status === 'thinking') {
        dot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse status-dot';
        agentCard.classList.add('border-green-500');
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-gray-500 status-dot';
        agentCard.classList.remove('border-green-500');
    }
}
