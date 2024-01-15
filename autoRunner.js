const { spawn } = require('child_process');
const readlineSync = require('readline-sync');
const path = require('path');

// 脚本路径列表
const scripts = [
    './src/web3go/reikiTask.js',
    './src/qna3/qna3.js',
    './src/robots/getTicket.js',
    './src/robots/claimRaffle.js',
];

const password = readlineSync.question('请输入密码: ', {
    hideEchoBack: true  // 密码输入时不显示字符
});

/*
    './src/web3go/reikiTask.js',
    './src/robots/getTicket.js',
    './src/robots/claimRaffle.js',
*/

runScript(0);

function runScript(index) {
    if (index < scripts.length) {
        const scriptName = path.basename(scripts[index], '.js');
        console.log(`开始执行脚本: ${scriptName}`);
        
        const childProcess = spawn('node', [scripts[index]], {
            env: { ...process.env, SCRIPT_PASSWORD: password },
            stdio: 'inherit'
        });

        childProcess.on('close', (code) => {
            console.log(`脚本 ${scriptName} 执行完成，退出码 ${code}`);
            if (index + 1 < scripts.length) {
                console.log(`脚本 ${scriptName} 执行完成，开始执行脚本 ${path.basename(scripts[index + 1], '.js')}`);
                runScript(index + 1);
            } else {
                // 当最后一个脚本执行完成后，重新调度
                console.log(`所有脚本执行完成，等待下一次执行，请勿关闭窗口`);
                
                scheduleRun();
            }
        });
    }
}

function scheduleRun() {
    const now = new Date();
    const target = new Date();

    // 设定每天执行的时间点，例如下午3点
    target.setHours(15, 0, 0, 0);

    // 如果当前时间已经超过今天的执行时间，则目标时间设置为明天
    if (now > target) {
        target.setDate(target.getDate() + 1);
    }

    const timeout = target - now;
    setTimeout(() => runScript(0), timeout);
}

scheduleRun();