// Initialize Graph
let network = null;

async function loadGraph() {
    try {
        const response = await fetch('/api/graph');
        const data = await response.json();
        
        if (data.error) {
            console.error("Neo4j Error:", data.error);
            return;
        }

        const nodes = new vis.DataSet(data.nodes);
        const edges = new vis.DataSet(data.edges);

        const container = document.getElementById('network');
        
        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: {
                    color: '#f8fafc',
                    size: 14,
                    face: 'system-ui'
                },
                borderWidth: 2
            },
            edges: {
                width: 1,
                color: { color: '#475569', highlight: '#38bdf8' },
                arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                font: { color: '#94a3b8', size: 10, align: 'middle' }
            },
            groups: {
                swarm_task: { color: { background: '#3b82f6', border: '#2563eb' } },
                swarm_worker: { color: { background: '#10b981', border: '#059669' } },
                swarm_discovery: { color: { background: '#8b5cf6', border: '#7c3aed' } },
                swarm_decision: { color: { background: '#f59e0b', border: '#d97706' } },
                default: { color: { background: '#64748b', border: '#475569' } }
            },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -50,
                    centralGravity: 0.01,
                    springLength: 100,
                    springConstant: 0.08
                }
            }
        };

        if (network) {
            network.setData({ nodes, edges });
        } else {
            network = new vis.Network(container, { nodes, edges }, options);
        }
    } catch (err) {
        console.error("Failed to load graph:", err);
    }
}

// Initial Graph Load
loadGraph();

// Refresh Button
document.getElementById('refresh-graph-btn').addEventListener('click', loadGraph);

// --- WebSocket Feed ---
let ws;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        document.getElementById('ws-status').className = 'status-dot connected';
        document.getElementById('ws-status-text').innerText = 'Connected';
    };

    ws.onclose = () => {
        document.getElementById('ws-status').className = 'status-dot';
        document.getElementById('ws-status-text').innerText = 'Disconnected - Retrying...';
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };

    ws.onmessage = (event) => {
        try {
            const entry = JSON.parse(event.data);
            appendLogEntry(entry);
            
            // If it's a structural change, refresh graph automatically
            if (entry.action && (entry.action.startsWith('memory.entity') || entry.action.startsWith('memory.relation'))) {
                loadGraph();
            }
        } catch (e) {
            console.error("Error parsing WS message:", e, event.data);
        }
    };
}

function appendLogEntry(entry) {
    const feed = document.getElementById('log-feed');
    const div = document.createElement('div');
    div.className = 'log-entry';

    const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    
    // Format action
    let actionColor = '#94a3b8';
    if (entry.action === "memory.entity_stored") actionColor = '#22c55e'; // Green
    if (entry.action === "memory.relation_created") actionColor = '#38bdf8'; // Blue
    if (entry.action === "memory.observations_added") actionColor = '#eab308'; // Yellow

    div.innerHTML = `
        <div class="log-time">[${entry.actor || 'System'}] ${timeStr}</div>
        <div style="margin-bottom: 4px;">
            <span class="log-action" style="color: ${actionColor}">${entry.action}</span>
            <span class="log-entity">${entry.entityId || ''}</span>
        </div>
        ${entry.metadata ? `<div class="log-meta">${JSON.stringify(entry.metadata, null, 2)}</div>` : ''}
    `;

    feed.prepend(div);
    
    // Cleanup old logs to prevent DOM bloat
    if (feed.children.length > 200) {
        feed.removeChild(feed.lastChild);
    }
}

connectWebSocket();
