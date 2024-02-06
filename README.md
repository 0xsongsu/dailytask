
## 使用教程

#### 1、下载软件依赖库
下载代码后，打开终端或者CMD窗口，
输入：
`cd 你的文件夹路径`
然后输入：
`npm install`

##### 1.1 显示乱码问题
使用windows cmd窗口执行程序，如果你的cmd没有支持UTF-8编码，输出的log和提示都是乱码，建议使用PowerShell执行程序，或者打开cmd文件后，先运行 

`chcp 65001`


#### 2、创建wallet.csv 文件
在桌面或者你认为安全的地方，创建一个文件夹，然后文件夹内放置一个.csv的文件，文件夹和名字你自己想一个合适的就行，不一定非得是wallet这种关键词。csv文件格式如下

|fuelAddress |address |privateKey
|  :----: | :----: | :-----: |
| fuel钱包地址1  | evm钱包地址1 | 私钥地址 |
| fuel钱包地址2  | evm钱包地址2 | 私钥地址 |

#### 3、加密wallet.csv 文件
在utils文件夹中打开walletEncryption.js代码文件，将你的钱包文件路径填进去之后，运行代码就行，输入的是你加密的密码，不是小狐狸钱包的密码！！！

请注意，运行程序首先必须加密你的钱包私钥，并且在加密后将原始文档删除，防止私钥明文泄露

#### 4、修改程序变量
- ***rpc：自定义你的rpc
- proxy：自定义你的代理
- walletPath：钱包文件夹放置的路径
	`/****/****/***/*****.csv`
- maxGasPrice：限制主网gas，高于设定值程序不会运行，进入持续检查
- minInterval：最小暂停秒数
- maxInterval：最大暂停秒数
- yescaptcha：在 utils/yescaptcha/yescaptcha.js中，将你购买的yescaptcha ApiKEY填入
		购买链接：https://yescaptcha.com/i/u37t5k

#### 5、运行程序

`node taskRunner.js`

自动执行全部的日常签到脚本,每天都需要运行一次

如果你想单独执行某个脚本，自己进项目文件夹执行就好了

