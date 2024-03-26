const fs = require('fs').promises;
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { Bip39, Random } = require("@cosmjs/crypto");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// 程序配置
const numberOfWallets = 10; // 定义要生成的钱包数量

const csvWriter = createCsvWriter({
    path: 'cosmosWallet.csv', // 保存到的文件路径
    header: [
        {id: 'mnemonic', title: 'mnemonic'},
        {id: 'address', title: 'address'}
    ]
});

async function generateWallets(numberOfWallets) {
    const wallets = [];

    for (let i = 0; i < numberOfWallets; i++) {
        const mnemonic = Bip39.encode(Random.getBytes(16)).toString();
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
            mnemonic,
            { prefix: "axelar" },
        );

        const [firstAccount] = await wallet.getAccounts();
        wallets.push({ mnemonic: mnemonic, address: firstAccount.address });
    }

    return wallets;
}

async function saveWalletsToCsv(wallets) {
    await csvWriter.writeRecords(wallets);
    console.log(`钱包创建完成，助记词和地址已保存到文件中。`);
}

generateWallets(numberOfWallets)
    .then(saveWalletsToCsv)
    .catch(error => console.error(error));
