const fs = require('fs');
const ethers = require('ethers');

const rpcUrls = JSON.parse(fs.readFileSync('./rpc.json', 'utf8'));
const providers = rpcUrls.map(url => new ethers.providers.JsonRpcProvider(url));

const csvFilePath = './wallet.csv';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkBalanceAndAppend(line, provider, rpcUrl) {
    const columns = line.split(',');
    const address = columns[0].trim();
    try {
        console.log(`Using RPC: ${rpcUrl}`);
        const balance = await provider.getBalance(address);
        const balanceEther = ethers.utils.formatEther(balance);
        console.log(`Address: ${address} - Balance: ${balanceEther} ETH`);
        return `\n${line}${columns.length > 1 ? '' : ','}${balanceEther}`;
    } catch (error) {
        console.error(`Error fetching balance for address ${address}: ${error}`);
        return `\n${line}`;
    }
}

fs.readFile(csvFilePath, 'utf8', async (err, data) => {
    if (err) {
        console.error(err);
        return;
    }
    const lines = data.split('\n');
    let newCsvContent = lines[0].includes('balance') ? lines[0] : lines[0] + ',balance';

    for (let i = 1; i < lines.length; i++) {
        if (lines[i]) {
            const providerIndex = (i - 1) % providers.length;
            const provider = providers[providerIndex];
            const rpcUrl = rpcUrls[providerIndex];
            await delay(Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000);
            const result = await checkBalanceAndAppend(lines[i], provider, rpcUrl);
            newCsvContent += result;
        }
    }

    console.log(newCsvContent);
});
