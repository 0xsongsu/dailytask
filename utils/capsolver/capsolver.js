const axios = require('axios');
const config = require('../../config/runner.json');

const clientKEY = config.capsolverKEY;

// 创建验证码任务
async function createTask(websiteUrl, websiteKey, taskType, pageAction) {
    const url = 'https://api.capsolver.com/createTask';
    const params = {
        "clientKey": clientKEY,
        "appID": clientKEY,
        "task": {
            "websiteURL": websiteUrl,
            "websiteKey": websiteKey,
            "pageAction": pageAction,
            "type": taskType
        },
        
    }
    
    const response = await axios.post(url, params);
    return response.data;
}

// 获取验证码结果
async function getTaskResult(taskId) {
    const url = 'https://api.capsolver.com/getTaskResult';
    const params = {
        clientKey: clientKEY,
        taskId: taskId
    }

    const response = await axios.post(url, params);
    const  sleep = (minutes) => {
        const milliseconds = minutes * 60 * 1000;
        return new Promise(resolve => setTimeout(resolve, milliseconds));
      };
        await sleep(0.2);
        if (response.data.status === 'ready') {
            return response.data;

        } else if (response.data.status === 'processing') {
            await getTaskResult(taskId);
        }
}

module.exports = { createTask, getTaskResult };