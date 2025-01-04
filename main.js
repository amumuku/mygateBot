import WebSocket from 'ws';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import log from './utils/logger.js';
import bedduSalama from './utils/banner.js';

function readFile(pathFile) {
    try {
        const datas = fs.readFileSync(pathFile, 'utf8')
            .split('\n')
            .map(data => data.trim())
            .filter(data => data.length > 0);
        return datas;
    } catch (error) {
        log.error(`Error reading file: ${error.message}`);
        return [];
    }
}

class WebSocketClient {
    constructor(token, proxy = null, uuid, reconnectInterval = 5000) {
        this.token = token;
        this.proxy = proxy;
        this.socket = null;
        this.reconnectInterval = reconnectInterval;
        this.shouldReconnect = true;
        this.agent = this.proxy ? new HttpsProxyAgent(this.proxy) : null;
        this.uuid = uuid;
        this.url = `wss://api.mygate.network/socket.io/?nodeId=${this.uuid}&EIO=4&transport=websocket`;
        this.regNode = `40{ "token":"Bearer ${this.token}"}`;
    }

    connect() {
        if (!this.uuid || !this.url) {
            log.error("Cannot connect: Node is not registered.");
            return;
        }

        log.info("Attempting to connect :", this.uuid);
        this.socket = new WebSocket(this.url, { agent: this.agent });

        this.socket.onopen = async () => {
            log.info("WebSocket connection established for node:", this.uuid);
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.reply(this.regNode);
        };

        this.socket.onmessage = (event) => {
            if (event.data === "2" || event.data === "41") this.socket.send("3");
            else log.info(`node ${this.uuid} received message:`, event.data);
        };

        this.socket.onclose = () => {
            log.warn("WebSocket connection closed for node:", this.uuid);
            if (this.shouldReconnect) {
                log.warn(`Reconnecting in ${this.reconnectInterval / 1000} seconds for node:`, this.uuid);
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        };

        this.socket.onerror = (error) => {
            log.error(`WebSocket error for node ${this.uuid}:`, error.message);
            this.socket.close();
        };
    }

    reply(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(String(message));
            log.info("Replied with:", message);
        } else {
            log.error("Cannot send message; WebSocket is not open.");
        }
    }

    disconnect() {
        this.shouldReconnect = true;
        if (this.socket) {
            this.socket.close();
        }
    }
}

async function registerNode(token, proxy = null) {
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    const maxRetries = 3;
    let retries = 0;
    const uuid = randomUUID();
    const activationDate = new Date().toISOString();
    const payload = {
        id: uuid,
        status: "Good",
        activationDate: activationDate,
    };

    try {
        const response = await fetch("https://api.mygate.network/api/front/nodes", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
            agent: agent,
        });

        if (!response.ok) {
            throw new Error(`Registration failed with status ${response.status}`);
        }
        const data = await response.json();

        log.info("Node registered successfully:", data);
        return uuid;

    } catch (error) {
        log.error("Error registering node:", error.message);
        if (retries < maxRetries) {
            log.info(`Retrying in 10 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            retries++;
            await registerNode(token, proxy);
        } else {
            log.error("Max retries exceeded; giving up on registration.");
            return null;
        }
    }
}

async function confirmUser(token) {
    const confirm = await fetch("https://api.mygate.network/api/front/referrals/referral/40gNab?", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({})
    });
    const confirmData = await confirm.json();
    log.info("Confirm user response:", confirmData);
}

async function getUserInfo(token, proxy = null) {
    const maxRetries = 3;
    let retries = 0;
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    try {
        const response = await fetch("https://api.mygate.network/api/front/users/me", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
            },
            agent: agent,
        });
        if (!response.ok) {
            log.error(`Failed to get user info with status ${response.status}`);
            return;
        }
        const data = await response.json();
        const { name, status, _id, levels, currentPoint } = data.data;
        return { name, status, _id, levels, currentPoint };
    } catch (error) {
        if (retries < maxRetries) {
            log.info(`Retrying in 10 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            retries++;
            await getUserInfo(token, proxy);
        } else {
            log.error("Max retries exceeded; giving up on getting user info.");
            return { error: error.message };
        }
    }
}
async function getUserNode(token, proxy = null) {
    const maxRetries = 3;
    let retries = 0;
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    try {
        const response = await fetch("https://api.mygate.network/api/front/nodes?limit=10&page=1", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
            },
            agent: agent,
        });
        if (!response.ok) {
            log.error(`Failed to get user nodes with status ${response.status}`);
            return;
        }
        const data = await response.json();
        const nodeUUIDs = data.data.items.map(item => item.id);
        return nodeUUIDs;
    } catch (error) {
        if (retries < maxRetries) {
            log.info(`Retrying in 10 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            retries++;
            await getUserNode(token, proxy);
        } else {
            log.error("Max retries exceeded; giving up on getting user nodes.");
            return [];
        }
    }
}

async function main() {
    log.info(bedduSalama);

    const tokens = readFile("tokens.txt");
    const proxies = readFile("proxy.txt");
    let proxyIndex = 0;

    try {
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const proxy = proxies.length > 0 ? proxies[proxyIndex] : null;
            if (proxies.length > 0) {
                proxyIndex = (proxyIndex + 1) % proxies.length;
            }

            let nodes = await getUserNode(token, proxy);

            if (nodes && nodes.length > 0) {
                log.info(`Active user nodes:`, nodes.length);
            } else {
                log.info("This account has no nodes - registering new node...");
                const uuid = await registerNode(token, proxy);
                if (!uuid) {
                    log.error("Failed to register node - skipping WebSocket connection.");
                    continue;
                }
                nodes = [uuid];
            }

            await confirmUser(token);
            setInterval(async () => {
                const users = await getUserInfo(token);
                log.info("User info:", { Active_Nodes: nodes.length, users });
            }, 15 * 60 * 1000); // Get user info every 15 minutes

            for (const node of nodes) {
                log.info("Trying to open new connection using proxy:", proxy || "No Proxy");
                const client = new WebSocketClient(token, proxy, node);
                client.connect();

                setInterval(() => {
                    client.disconnect();
                }, 10 * 60 * 1000); // Auto reconnect node every 10 minutes
            }

            const users = await getUserInfo(token);
            log.info("User info:", { Active_Nodes: nodes.length, users });
        }
        log.info("All accounts connections established - Just leave it running.");
    } catch (error) {
        log.error("Error in WebSocket connections:", error.message);
    }
}
//run
main();
