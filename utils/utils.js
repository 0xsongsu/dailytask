const axios = require('axios');
const config = require('../config/runner.json');
const readlineSync = require('readline-sync');
const crypto = require('crypto');
const { createLogger, transports, format } = require('winston');

// 自定义日志级别，包括 success
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        success: 3,
        http: 4,
        verbose: 5,
        debug: 6,
        silly: 7
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        success: 'blue',
        http: 'magenta',
        verbose: 'cyan',
        debug: 'white',
        silly: 'grey'
    }
};

// 创建并返回 logger 实例的函数
function logger() {
    const newLogger = createLogger({
        levels: customLevels.levels,
        format: format.combine(
            format.colorize(),
            format.timestamp({ format: 'HH:mm:ss' }),
            format.printf(info => `${info.timestamp} | ${info.level}: ${info.message}`)
        ),
        transports: [
            new transports.Console(),
        ]
    });

    // 添加颜色
    require('winston').addColors(customLevels.colors);

    return newLogger;
}

const sleep = (seconds) => {
    const milliseconds = seconds * 1000;
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

function randomPause() {
    const minSeconds = Math.ceil(config.minInterval);
    const maxSeconds = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

async function sendRequest(url, urlConfig, timeout = 10000, maxRetries = 3) {
    let retries = 0;

    while (retries < maxRetries) {
        const source = axios.CancelToken.source();
        const timer = setTimeout(() => {
            source.cancel(`Request timed out after ${timeout} ms`);
        }, timeout);

        const newConfig = {
            ...urlConfig,
            url: url,
            timeout: timeout,
            cancelToken: source.token,
            method: urlConfig.method || 'get',
            onDownloadProgress: () => clearTimeout(timer),
        };

        try {
            const response = await axios(newConfig);
            retries = maxRetries;
            return response.data;
        } catch (error) {
            logger().error(error.message);
            retries++;
            logger().info(`请求失败，开始重试第 ${retries} 次`);
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error(`Request failed after ${maxRetries} retries`);
}

function getKeyFromUser() {
    let key;
    if (process.env.SCRIPT_PASSWORD) {
        key = process.env.SCRIPT_PASSWORD;
    } else {
        key = readlineSync.question('请输入你的密码: ', {
            hideEchoBack: true,
        });
    }
    return crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
}

module.exports = { sleep, randomPause, sendRequest, getKeyFromUser, logger };
