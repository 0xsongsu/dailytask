const axios = require('axios');
const { sleep } = require('../../utils/utils.js');
const config = require('../../config/runner.json');

const clientKey = config.fastcaptchaKEY;

// 创建验证码任务
async function createTask(websiteUrl, websiteKey, taskType, pageAction) {
    const url = 'https://api.fastcaptcha.net/createTask';
    const params = {
        "apitKey": clientKey,
        "developerKey": clientKey,

        "task": {
            "websiteURL": websiteUrl,
            "websiteKey": websiteKey,
            "pageAction": pageAction,
            "type": taskType
        },
        "softID": clientKey
    }
    
    const response = await axios.post(url, params);
    return response.data;
}

// 获取验证码结果
async function getTaskResult(taskId) {
    const url = 'https://api.fastcaptcha.net/getTaskResult';
    const params = {
        clientKey: clientKey,
        taskId: taskId
    }

    const response = await axios.post(url, params);
    await sleep(0.2);
    if (response.data.status === 'ready') {
        return response.data;

    } else if (response.data.status === 'processing') {
        await getTaskResult(taskId);
    }
}

module.exports = { createTask, getTaskResult };