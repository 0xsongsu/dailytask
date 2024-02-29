const fs = require('fs');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ethers = require('ethers');
const config = require('../../config/runner.json');

async function main() {
    const rpcUrls = JSON.parse(fs.readFileSync('./rpc.json', 'utf8'));
    const addresses = fs.readFileSync('./wallet.csv', 'utf8').split('\n').filter(line => line);

    for (let i = 1; i < addresses.length; i++) {
        const address = addresses[i].split(',')[0].trim();
        if (!address) continue;

        const rpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)];
        const result = await checkBalanceAndAppend(address, rpcUrl);
        console.log(result);
    }
}

async function fetchWithProxy(url, body, proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        agent,
    });
    return response.json();
}

async function checkBalanceAndAppend(address, rpcUrl) {
    try {
        console.log(`Using RPC: ${rpcUrl}`);
        const jsonRpcPayload = {
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, "latest"],
            id: 1,
        };

        const response = await fetchWithProxy(rpcUrl, jsonRpcPayload, config.proxy);
        if (response.error) {
            throw new Error(response.error.message);
        }

        const balance = ethers.utils.formatUnits(response.result, 'ether');
        return `Address: ${address} - Balance: ${balance} ETH`;
    } catch (error) {
        return `Error fetching balance for address ${address}`;
    }
}

main().catch(console.error);