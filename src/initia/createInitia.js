const { MnemonicKey } = require('@initia/initia.js');
const fs = require('fs');
const path = require('path');

const mnemonic = ''; // 替换为实际助记词
const numberOfWallets = 5; // 生成的钱包数量

function generateKeyFromMnemonic(mnemonic, account = 0, index = 0) {
  return new MnemonicKey({
    mnemonic: mnemonic,
    account: account,
    index: index,
    coinType: 118,
  });
}

function saveToCSV(filename, wallets) {
  const csvContent = `Address,PrivateKey\n${wallets.map(wallet => `${wallet.address},${wallet.privateKey}`).join('\n')}\n`;
  fs.writeFileSync(path.join(__dirname, filename), csvContent, 'utf8');
  console.log(`${filename} 文件已保存`);
}

const wallets = [];

for (let i = 0; i < numberOfWallets; i++) {
  const key = generateKeyFromMnemonic(mnemonic, 0, i);
  wallets.push({
    address: key.accAddress,
    privateKey: key.privateKey.toString('hex')
  });
}

wallets.forEach((wallet, index) => {
  console.log(`钱包 ${index + 1}:`);
  console.log('地址:', wallet.address);
  console.log('私钥:', wallet.privateKey);
});

saveToCSV('account.csv', wallets);
