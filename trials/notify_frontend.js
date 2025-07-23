const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: http });

let clients = [];

wss.on('connection', function connection(ws) {
    console.log('Frontend connected to WebSocket');

    clients.push(ws);

    ws.on('close', function () {
        clients = clients.filter(client => client !== ws);
    });
});

// Function to broadcast to all connected clients
function notifyFrontend(payload) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}
