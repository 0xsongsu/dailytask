const fs = require('fs').promises;
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ethers = require('ethers');

async function main() {
    const config = await fs.readFile('../../config/runner.json', 'utf8').then(JSON.parse);
    const rpcUrls = await fs.readFile('./rpc.json', 'utf8').then(JSON.parse);
    const addresses = await fs.readFile('./wallet.csv', 'utf8')
        .then(data => data.split('\n').filter(line => line));

    const shuffledAddresses = shuffleArray(addresses);

    for (let i = 1; i < shuffledAddresses.length; i++) {
        const address = shuffledAddresses[i].split(',')[0].trim();
        if (!address) continue;

        const rpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)];
        try {
            const result = await checkBalanceAndAppend(address, rpcUrl, config.proxy);
            console.log(i, result);
        } catch (error) {
            console.error(`Error fetching balance for address ${address}: ${error.message}`);
        }
    }
}

async function fetchWithProxy(url, body, proxyUrl) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const agent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        agent,
        signal: controller.signal
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

async function checkBalanceAndAppend(address, rpcUrl, proxyUrl) {
    console.log(`Using RPC: ${rpcUrl}`);
    const jsonRpcPayload = {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
    };

    const response = await fetchWithProxy(rpcUrl, jsonRpcPayload, proxyUrl);
    if (response.error) {
        throw new Error(response.error.message);
    }

    const balance = ethers.utils.formatUnits(response.result, 'ether');
    return `Address: ${address} - Balance: ${balance} ETH`;
}

function shuffleArray(array) {
    return array.map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

main().catch(console.error);
